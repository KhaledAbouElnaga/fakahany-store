import { useState } from 'react';
import { loadOrderEvents, setOrderInternalNote } from '../../lib/storeApi';
import { money } from '../../lib/utils';
import type { Order, OrderEvent } from '../../types';

export default function OrderOperationsDetails({order,allOrders,onUpdated,canManage}:{order:Order;allOrders:Order[];onUpdated:()=>Promise<void>;canManage:boolean}){
  const [note,setNote]=useState(order.internal_note||'');
  const [events,setEvents]=useState<OrderEvent[]|null>(null);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');

  const phoneDigits=(order.customer_phone||'').replace(/\\D/g,'');
  const history=allOrders.filter(o=>(o.customer_phone||'').replace(/\\D/g,'')===phoneDigits&&phoneDigits.length>=6);
  const total=history.reduce((s,o)=>s+Number(o.total),0);
  const last=history.filter(o=>o.id!==order.id).sort((a,b)=>new Date(b.created_at).getTime()-new Date(a.created_at).getTime())[0];

  const saveNote=async()=>{
    setBusy(true);setMsg('');
    try{await setOrderInternalNote(order.id,note);await onUpdated();setMsg('تم حفظ الملاحظة الداخلية.');}
    catch(e:any){setMsg(e?.message||'تعذر حفظ الملاحظة.')}finally{setBusy(false)}
  };

  const showTimeline=async()=>{
    if(events!==null){setEvents(null);return}
    setBusy(true);
    try{setEvents(await loadOrderEvents(order.id))}catch(e:any){setMsg(e?.message||'تعذر تحميل سجل الطلب.')}finally{setBusy(false)}
  };

  return <div className="order-ops-extra">
    <div className="customer-history-card">
      <b>تاريخ العميل</b>
      <span>{history.length} طلب</span>
      <span>إجمالي الطلبات: {money(total)}</span>
      <span>{last?'آخر طلب سابق: #'+last.order_number+' — '+new Date(last.created_at).toLocaleDateString('ar-EG'):'أول طلب مسجل لهذا العميل'}</span>
    </div>

    {canManage?<><label className="internal-note-field">ملاحظة داخلية — لا تظهر للعميل
      <textarea value={note} onChange={e=>setNote(e.target.value)} placeholder="مثال: العميل يفضل الفاكهة المستوية"/>
    </label>
    <button className="btn secondary small-admin-btn" disabled={busy||note===String(order.internal_note||'')} onClick={()=>void saveNote()}>حفظ الملاحظة الداخلية</button></>:order.internal_note&&<p><b>الملاحظة الداخلية:</b> {order.internal_note}</p>}

    <button className="text-btn timeline-toggle" disabled={busy} onClick={()=>void showTimeline()}>{events===null?'عرض سجل الطلب':'إخفاء سجل الطلب'}</button>
    {events!==null&&<div className="order-timeline">{events.length?events.map(e=><div className="timeline-event" key={e.id}><i/><div><b>{e.summary}</b><small>{new Date(e.created_at).toLocaleString('ar-EG')}</small></div></div>):<p className="muted">لا توجد أحداث إضافية مسجلة.</p>}</div>}
    {msg&&<p className={msg.startsWith('تم')?'success-text':'error-text'}>{msg}</p>}
  </div>;
}
