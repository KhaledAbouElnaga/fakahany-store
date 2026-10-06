import { useEffect, useMemo, useState } from 'react';
import { loadOrders, loadOrderStatuses, updateOrderStatus } from '../../lib/storeApi';
import { downloadCsv, downloadText, money, orderTemplateValues, printOrder, renderTemplate } from '../../lib/utils';
import type { Order, OrderStatusDefinition, ShopSettings } from '../../types';
import OrderEditModal from './OrderEditModal';
import OrderOperationsDetails from './OrderOperationsDetails';

export default function OrdersManager({settings,onNewCount,onOpenStatuses,canManage,canConfigureStatuses}:{settings:ShopSettings,onNewCount:(n:number)=>void,onOpenStatuses:()=>void,canManage:boolean,canConfigureStatuses:boolean}){
  const [orders,setOrders]=useState<Order[]|null>(null);
  const [statuses,setStatuses]=useState<OrderStatusDefinition[]|null>(null);
  const [editing,setEditing]=useState<Order|null>(null);
  const [q,setQ]=useState('');
  const [status,setStatus]=useState('all');
  const [from,setFrom]=useState('');
  const [to,setTo]=useState('');
  const [msg,setMsg]=useState('');

  const reload=async()=>{
    const [current,statusList]=await Promise.all([loadOrders(),loadOrderStatuses()]);
    setOrders(current);setStatuses(statusList);
    const newNames=new Set(statusList.filter(x=>x.is_new).map(x=>x.name));
    onNewCount(current.filter(o=>newNames.has(o.status)).length);
  };

  useEffect(()=>{void reload()},[]);

  const filtered=useMemo(()=>{
    if(!orders)return [];
    return orders.filter(o=>{
      const text=(o.order_number+' '+o.customer_name+' '+o.customer_phone).toLowerCase();
      const d=new Date(o.created_at);
      const fromOk=!from||d>=new Date(from+'T00:00:00');
      const toOk=!to||d<=new Date(to+'T23:59:59');
      return (!q||text.includes(q.toLowerCase()))&&(status==='all'||o.status===status)&&fromOk&&toOk;
    });
  },[orders,q,status,from,to]);

  if(!orders||!statuses)return <div className="panel">جاري تحميل الطلبات...</div>;

  const activeStatuses=statuses.filter(s=>s.active).sort((a,b)=>a.display_order-b.display_order);
  const statusMap=new Map(statuses.map(s=>[s.name,s]));

  const changeStatus=async(o:Order,next:string)=>{
    setMsg('');
    try{await updateOrderStatus(o.id,next);await reload();setMsg('تم تحديث حالة الطلب.');}
    catch(e:any){setMsg(e?.message||'تعذر تحديث الحالة.')}
  };

  const downloadOrder=(o:Order)=>{
    const values=orderTemplateValues(o,settings);
    downloadText('order-'+o.order_number+'.txt',renderTemplate(settings.whatsapp_order_template,values));
  };

  const exportOrders=()=>downloadCsv('orders.csv',[
    ['رقم الطلب','التاريخ','العميل','الهاتف','العنوان','المنطقة','إجمالي المنتجات','التوصيل','الإجمالي','الحالة'],
    ...filtered.map(o=>[o.order_number,new Date(o.created_at).toLocaleString('ar-EG'),o.customer_name,o.customer_phone,o.address,o.area_name,o.product_subtotal,o.delivery_fee,o.total,o.status])
  ]);

  return <>
    <div className="page-title"><h1>الطلبات</h1><div className="page-actions">{canConfigureStatuses&&<button className="btn secondary" onClick={onOpenStatuses}>إدارة الحالات</button>}<button className="btn secondary" onClick={exportOrders}>تصدير النتائج</button></div></div>
    {msg&&<p className={msg.includes('تعذر')?'error-text':'success-text'}>{msg}</p>}

    <div className="order-filters">
      <input placeholder="ابحث بالاسم أو الهاتف أو رقم الطلب" value={q} onChange={e=>setQ(e.target.value)}/>
      <select value={status} onChange={e=>setStatus(e.target.value)}><option value="all">كل الحالات</option>{[...statuses].sort((a,b)=>a.display_order-b.display_order).map(s=><option key={s.id} value={s.name}>{s.name}{!s.active?' — غير مفعلة':''}</option>)}</select>
      <label>من<input type="date" value={from} onChange={e=>setFrom(e.target.value)}/></label>
      <label>إلى<input type="date" value={to} onChange={e=>setTo(e.target.value)}/></label>
    </div>

    {!filtered.length?<div className="empty-state">لا توجد طلبات مطابقة.</div>:<div className="table-wrap"><table><thead><tr><th>رقم الطلب</th><th>العميل</th><th>التاريخ</th><th>الإجمالي</th><th>الحالة والإجراءات</th></tr></thead><tbody>{filtered.map(o=>{
      const definition=statusMap.get(o.status);
      const options=activeStatuses.some(s=>s.name===o.status)?activeStatuses:[{id:'legacy-'+o.id,name:o.status,note:'',display_order:-1,active:false,is_new:false,is_completed:false,is_cancelled:false},...activeStatuses];
      return <tr key={o.id}>
        <td>#{o.order_number}</td>
        <td>{o.customer_name||'—'}<small className="block">{o.customer_phone||'—'}</small></td>
        <td>{new Date(o.created_at).toLocaleString('ar-EG')}</td>
        <td>{money(o.total)}</td>
        <td>
          <div className="order-status-box">{canManage?<select value={o.status} onChange={e=>void changeStatus(o,e.target.value)}>{options.map(s=><option key={s.id} value={s.name}>{s.name}</option>)}</select>:<b>{o.status}</b>}{definition?.note&&<small className="status-note">{definition.note}</small>}</div>
          <div className="order-action-row">{canManage&&<button onClick={()=>setEditing(o)}>تعديل الطلب</button>}<button onClick={()=>printOrder(o,settings)}>طباعة</button><button onClick={()=>downloadOrder(o)}>تنزيل</button></div>
          <details><summary>التفاصيل والسجل</summary><div className="order-details">
            {o.items.map(i=><p key={i.id}>{i.product_name} — {i.option_name} × {i.quantity} = {money(i.line_total)}</p>)}
            <p><b>العنوان:</b> {o.address||'—'}</p>
            {settings.delivery_enabled&&<p><b>المنطقة:</b> {o.area_name||'—'} · <b>التوصيل:</b> {money(o.delivery_fee)}</p>}
            {o.requested_time&&<p><b>الموعد المطلوب:</b> {o.requested_time}</p>}
            <p><b>ملاحظات العميل:</b> {o.notes||'لا يوجد'}</p>
            <OrderOperationsDetails order={o} allOrders={orders} onUpdated={reload} canManage={canManage}/>
          </div></details>
        </td>
      </tr>;
    })}</tbody></table></div>}

    {editing&&<OrderEditModal order={editing} onClose={()=>setEditing(null)} onSaved={reload}/>}
  </>;
}
