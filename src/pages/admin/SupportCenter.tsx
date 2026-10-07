import { FormEvent, useEffect, useState } from 'react';
import { createSupportTicket, listStoreSupportTickets } from '../../lib/supportApi';
import type { SupportTicket } from '../../types';

function statusLabel(status:SupportTicket['status']){
  return status==='open'?'مفتوح':status==='in_progress'?'قيد المتابعة':'تم الحل';
}
function when(value:string|null|undefined){
  if(!value)return '—';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'});
}

export default function SupportCenter(){
  const [tickets,setTickets]=useState<SupportTicket[]>([]);
  const [form,setForm]=useState({subject:'',message:'',priority:'normal' as 'normal'|'high'});
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');

  const refresh=async()=>{
    try{setTickets(await listStoreSupportTickets())}
    catch(e:any){setMsg(e?.message||'تعذر تحميل طلبات الدعم.')}
  };
  useEffect(()=>{void refresh()},[]);

  const submit=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setMsg('');
    try{
      await createSupportTicket(form);
      setForm({subject:'',message:'',priority:'normal'});
      await refresh();
      setMsg('تم إرسال طلب الدعم.');
    }catch(e:any){setMsg(e?.message||'تعذر إرسال طلب الدعم.')}
    finally{setBusy(false)}
  };

  return <div className="support-center">
    <div className="page-title"><div><h1>الدعم</h1><p className="muted">أرسل المشكلة من هنا وتابع رد إدارة المنصة داخل نفس الصفحة.</p></div></div>

    <section className="panel">
      <h3>طلب دعم جديد</h3>
      <form className="support-ticket-form" onSubmit={submit}>
        <label>العنوان<input required minLength={3} maxLength={160} value={form.subject} onChange={e=>setForm(v=>({...v,subject:e.target.value}))} placeholder="مثال: مشكلة في إضافة منتج"/></label>
        <label>الأولوية<select value={form.priority} onChange={e=>setForm(v=>({...v,priority:e.target.value as 'normal'|'high'}))}><option value="normal">عادية</option><option value="high">عالية</option></select></label>
        <label className="full">تفاصيل المشكلة<textarea required minLength={10} maxLength={3000} rows={5} value={form.message} onChange={e=>setForm(v=>({...v,message:e.target.value}))} placeholder="اكتب ما حدث والخطوات التي أدت للمشكلة..."/></label>
        <button className="btn" disabled={busy}>{busy?'جاري الإرسال...':'إرسال طلب الدعم'}</button>
      </form>
      {msg&&<p className={msg.includes('تم')?'success-text':'error-text'}>{msg}</p>}
      <p className="muted small-note">لمنع الرسائل المكررة، الحد الأقصى 3 طلبات دعم في الساعة لكل حساب.</p>
    </section>

    <section className="support-ticket-list">
      <h2>طلباتك السابقة</h2>
      {!tickets.length&&<div className="panel empty-state">لا توجد طلبات دعم حتى الآن.</div>}
      {tickets.map(t=><article className="panel support-ticket-card" key={t.id}>
        <div className="support-ticket-head"><div><h3>{t.subject}</h3><small>{when(t.created_at)}</small></div><div className="ticket-badges"><span className={'ticket-status '+t.status}>{statusLabel(t.status)}</span>{t.priority==='high'&&<span className="ticket-priority">أولوية عالية</span>}</div></div>
        <p>{t.message}</p>
        {t.admin_reply&&<div className="support-reply"><b>رد إدارة المنصة</b><p>{t.admin_reply}</p><small>{when(t.replied_at)}</small></div>}
      </article>)}
    </section>
  </div>;
}
