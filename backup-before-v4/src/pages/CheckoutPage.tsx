import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Loading from '../components/Loading';
import { useCart } from '../contexts/CartContext';
import { useStore } from '../contexts/StoreContext';
import { isStoreOpenNow, makeOrderNumber, money, normalizeWhatsAppNumber, uid } from '../lib/utils';
import { saveOrder } from '../lib/storeApi';
import type { Order } from '../types';

export default function CheckoutPage(){
  const {data,loading}=useStore(); const {items,subtotal,clear}=useCart(); const nav=useNavigate();
  const [form,setForm]=useState({name:'',phone:'',address:'',areaId:'',notes:''}); const [busy,setBusy]=useState(false); const [error,setError]=useState('');
  const areas=useMemo(()=>data?.deliveryAreas.filter(a=>a.enabled).sort((a,b)=>a.display_order-b.display_order)||[],[data]);
  if(loading||!data)return <Loading/>;
  if(!items.length)return <main className="container narrow"><div className="empty-state">السلة فارغة.<br/><Link to="/">العودة للمتجر</Link></div></main>;
  const missing=Math.max(0,data.settings.min_order-subtotal); const area=areas.find(a=>a.id===form.areaId); const deliveryFee=area?.fee ?? data.settings.default_delivery_fee; const total=subtotal+deliveryFee;
  const set=(k:string,v:string)=>setForm(x=>({...x,[k]:v}));
  const submit=async()=>{
    setError('');
    if(!isStoreOpenNow(data.settings))return setError('المحل مغلق حاليًا حسب حالة المتجر أو مواعيد العمل.');
    if(missing>0)return setError(`أضف منتجات بقيمة ${money(missing)} لإتمام الطلب.`);
    if(!form.name.trim()||!form.phone.trim()||!form.address.trim())return setError('من فضلك أدخل الاسم ورقم الهاتف والعنوان.');
    if(areas.length&&!form.areaId)return setError('من فضلك اختر منطقة التوصيل.');
    const wa=normalizeWhatsAppNumber(data.settings.whatsapp_number); if(!wa)return setError('رقم واتساب غير مضبوط من لوحة الإدارة.');
    const win=window.open('about:blank','_blank'); setBusy(true);
    try{
      const orderId=uid(), orderNumber=makeOrderNumber();
      const order:Order={id:orderId,order_number:orderNumber,created_at:new Date().toISOString(),customer_name:form.name.trim(),customer_phone:form.phone.trim(),address:form.address.trim(),area_id:area?.id||null,area_name:area?.name_ar||'',product_subtotal:subtotal,delivery_fee:deliveryFee,total,notes:form.notes.trim(),status:'جديد',items:items.map(i=>({id:uid(),order_id:orderId,product_id:i.product_id,product_name:i.product_name,option_id:i.option_id,option_name:i.option_name,unit_price:i.unit_price,quantity:i.quantity,line_total:i.unit_price*i.quantity}))};
      await saveOrder(order);
      const waMoney=(value:number)=>`${Number(value||0).toLocaleString('en-US')} جنيه`;
      const itemLines=order.items.map((x,idx)=>`${idx+1}- ${x.product_name} - ${x.option_name} × ${x.quantity} = ${waMoney(x.line_total)}`);
      const totals=order.items.length>1
        ? [`إجمالي المنتجات: ${waMoney(subtotal)}`,`رسوم التوصيل: ${waMoney(deliveryFee)}`,`الإجمالي النهائي: ${waMoney(total)}`]
        : [`رسوم التوصيل: ${waMoney(deliveryFee)}`,`الإجمالي النهائي: ${waMoney(total)}`];
      const lines=[
        `طلب جديد`,
        `رقم الطلب: #${orderNumber}`,
        ``,
        `الاسم: ${order.customer_name}`,
        `رقم الهاتف: ${order.customer_phone}`,
        `العنوان: ${order.address}`,
        `المنطقة: ${order.area_name||'غير محددة'}`,
        ``,
        `الطلب:`,
        ...itemLines,
        ``,
        ...totals,
        ``,
        `ملاحظات: ${order.notes||'لا يوجد'}`
      ];
      const url=`https://wa.me/${wa}?text=${encodeURIComponent(lines.join('\n'))}`; clear(); if(win)win.location.href=url;else window.location.href=url; nav('/');
    }catch(e:any){if(win)win.close(); setError(e?.message||'تعذر حفظ الطلب. حاول مرة أخرى.');}finally{setBusy(false);}
  };
  return <><Header settings={data.settings}/><main className="container narrow"><h1>إتمام الطلب</h1><div className="checkout-grid"><div className="panel"><label>الاسم<input value={form.name} onChange={e=>set('name',e.target.value)}/></label><label>رقم الهاتف<input value={form.phone} onChange={e=>set('phone',e.target.value)} inputMode="tel"/></label><label>العنوان<textarea value={form.address} onChange={e=>set('address',e.target.value)}/></label>{areas.length>0&&<label>المنطقة<select value={form.areaId} onChange={e=>set('areaId',e.target.value)}><option value="">اختر المنطقة</option>{areas.map(a=><option key={a.id} value={a.id}>{a.name_ar} — {money(a.fee)}</option>)}</select></label>}<label>ملاحظات<textarea value={form.notes} onChange={e=>set('notes',e.target.value)}/></label></div><div className="summary-card"><h3>ملخص الطلب</h3>{items.map(i=><div key={i.key}><span>{i.product_name} ({i.option_name}) × {i.quantity}</span><b>{money(i.unit_price*i.quantity)}</b></div>)}<hr/><div><span>إجمالي المنتجات</span><b>{money(subtotal)}</b></div><div><span>التوصيل</span><b>{money(deliveryFee)}</b></div><div className="total-row"><span>الإجمالي</span><b>{money(total)}</b></div>{error&&<p className="error-text">{error}</p>}<button className="btn whatsapp" disabled={busy} onClick={submit}>{busy?'جاري تجهيز الطلب...':'إرسال الطلب عبر واتساب'}</button><Link className="btn secondary block" to="/cart">العودة للسلة</Link></div></div></main></>;
}
