import { useEffect, useMemo, useState } from 'react';
import { listPlatformAudit, listPlatformNotifications, listPlatformSupportTickets, replyPlatformSupportTicket, startPlatformSupport } from '../lib/platformApi';
import type { PlatformAuditEntry, PlatformNotification, SupportTicket } from '../types';

function when(value:string|null|undefined){
  if(!value)return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'});
}
function statusLabel(status:SupportTicket['status']){
  return status==='open'?'مفتوح':status==='in_progress'?'قيد المتابعة':'تم الحل';
}

export default function PlatformOperationsPanel(){
  const [tab,setTab]=useState<'notifications'|'support'|'audit'>('notifications');
  const [notifications,setNotifications]=useState<PlatformNotification[]>([]);
  const [tickets,setTickets]=useState<SupportTicket[]>([]);
  const [audit,setAudit]=useState<PlatformAuditEntry[]>([]);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');
  const [drafts,setDrafts]=useState<Record<string,string>>({});

  const refresh=async()=>{
    setBusy(true);setMsg('');
    try{
      const [n,t,a]=await Promise.all([listPlatformNotifications(),listPlatformSupportTickets(),listPlatformAudit(160)]);
      setNotifications(n);setTickets(t);setAudit(a);
      setDrafts(d=>{const next={...d};for(const ticket of t)if(next[ticket.id]===undefined)next[ticket.id]=ticket.admin_reply||'';return next});
    }catch(e:any){setMsg(e?.message||'تعذر تحميل مركز تشغيل المنصة.')}
    finally{setBusy(false)}
  };
  useEffect(()=>{void refresh()},[]);

  const openTickets=useMemo(()=>tickets.filter(t=>t.status!=='resolved').length,[tickets]);

  const openSupport=async(ticket:SupportTicket)=>{
    if(!ticket.store_id||!ticket.store_slug)return;
    const tab=window.open('about:blank','_blank');
    setBusy(true);setMsg('');
    try{
      await startPlatformSupport(ticket.store_id);
      const url='/s/'+encodeURIComponent(ticket.store_slug)+'/admin?support=1';
      if(tab)tab.location.href=url;else location.assign(url);
    }catch(e:any){
      if(tab)tab.close();
      setMsg(e?.message||'تعذر فتح جلسة الدعم.');
    }finally{setBusy(false)}
  };

  const saveTicket=async(ticket:SupportTicket,status:SupportTicket['status'])=>{
    setBusy(true);setMsg('');
    try{
      await replyPlatformSupportTicket(ticket.id,status,drafts[ticket.id]||'');
      await refresh();
      setMsg('تم تحديث طلب الدعم.');
    }catch(e:any){setMsg(e?.message||'تعذر تحديث طلب الدعم.')}finally{setBusy(false)}
  };

  return <section className="panel platform-ops-panel">
    <div className="platform-section-title">
      <div><h2>مركز تشغيل المنصة</h2><p className="muted">التنبيهات، طلبات الدعم، وكل العمليات الإدارية في مكان واحد.</p></div>
      <button className="btn secondary" disabled={busy} onClick={()=>void refresh()}>{busy?'جاري التحديث...':'تحديث'}</button>
    </div>

    <div className="platform-ops-tabs">
      <button className={tab==='notifications'?'active':''} onClick={()=>setTab('notifications')}>التنبيهات <b>{notifications.length}</b></button>
      <button className={tab==='support'?'active':''} onClick={()=>setTab('support')}>الدعم <b>{openTickets}</b></button>
      <button className={tab==='audit'?'active':''} onClick={()=>setTab('audit')}>سجل المنصة</button>
    </div>
    {msg&&<p className={msg.includes('تم')?'success-text':'error-text'}>{msg}</p>}

    {tab==='notifications'&&<div className="platform-notifications-list">
      {!notifications.length&&<div className="empty-state">لا توجد تنبيهات تحتاج تدخل حاليًا.</div>}
      {notifications.map(n=><article key={n.id} className={'platform-notification '+n.severity}>
        <div><b>{n.title}</b><span>{n.message}</span></div>
        <div>{n.store_slug&&<a href={'/s/'+encodeURIComponent(n.store_slug)} target="_blank" rel="noreferrer">{n.store_name||n.store_slug}</a>}<small>{when(n.refreshed_at)}</small></div>
      </article>)}
    </div>}

    {tab==='support'&&<div className="platform-support-list">
      {!tickets.length&&<div className="empty-state">لا توجد طلبات دعم حتى الآن.</div>}
      {tickets.map(t=><article key={t.id} className="platform-support-ticket">
        <div className="platform-support-head"><div><b>{t.subject}</b><span>{t.store_name} · {when(t.created_at)}</span></div><div className="ticket-badges"><span className={'ticket-status '+t.status}>{statusLabel(t.status)}</span>{t.priority==='high'&&<span className="ticket-priority">عالية</span>}</div></div>
        <p>{t.message}</p>
        <textarea rows={3} placeholder="اكتب رد إدارة المنصة..." value={drafts[t.id]||''} onChange={e=>setDrafts(v=>({...v,[t.id]:e.target.value}))}/>
        <div className="platform-ticket-actions">
          <button className="btn secondary" disabled={busy} onClick={()=>void openSupport(t)}>دخول دعم</button>
          <button className="btn secondary" disabled={busy} onClick={()=>void saveTicket(t,'in_progress')}>قيد المتابعة</button>
          <button className="btn" disabled={busy} onClick={()=>void saveTicket(t,'resolved')}>حفظ الرد وحل الطلب</button>
        </div>
      </article>)}
    </div>}

    {tab==='audit'&&<div className="platform-audit-list">
      {!audit.length&&<div className="empty-state">لا توجد عمليات مسجلة حتى الآن.</div>}
      {audit.map(a=><article key={a.id}><div><b>{a.action}</b><span>{a.label||a.store_slug||'المنصة'}</span></div><small>{when(a.created_at)}</small></article>)}
    </div>}
  </section>;
}
