import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Loading from '../components/Loading';
import { useCart } from '../contexts/CartContext';
import { useStore } from '../contexts/StoreContext';
import { isPlausiblePhone, isStoreOpenNow, makeOrderNumber, money, normalizeWhatsAppNumber, orderTemplateValues, renderTemplate, uid } from '../lib/utils';
import { saveOrder } from '../lib/storeApi';
import type { Order } from '../types';

function FieldTitle({children, required}:{children:ReactNode, required:boolean}){return <span className="field-title">{children}{required&&<span className="required-badge">مطلوب</span>}</span>}

export default function CheckoutPage(){
  const {data,loading,refresh}=useStore(); const {items,subtotal,clear}=useCart(); const nav=useNavigate();
  const [form,setForm]=useState({name:'',phone:'',address:'',areaId:'',notes:''}); const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const sending=useRef(false);
  const areas=useMemo(()=>data?.deliveryAreas.filter(a=>a.enabled).sort((a,b)=>a.display_order-b.display_order)||[],[data]);
  if(loading||!data)return <Loading/>;
  if(!items.length)return <main className="container narrow"><div className="empty-state">السلة فارغة.<br/><Link to="/">العودة للمتجر</Link></div></main>;
  const deliveryEnabled=data.settings.delivery_enabled; const missing=Math.max(0,data.settings.min_order-subtotal); const area=areas.find(a=>a.id===form.areaId); const deliveryFee=deliveryEnabled?(area?.fee ?? data.settings.default_delivery_fee):0; const total=subtotal+deliveryFee;
  const set=(k:string,v:string)=>setForm(x=>({...x,[k]:v}));
  const submit=async()=>{
    if(sending.current)return; setError('');
    if(!isStoreOpenNow(data.settings))return setError('المحل مغلق حاليًا حسب إعدادات ومواعيد العمل.');
    if(missing>0)return setError(`أضف منتجات بقيمة ${money(missing)} لإتمام الطلب.`);
    const missingFields:string[]=[]; if(data.settings.require_name&&!form.name.trim())missingFields.push('الاسم'); if(data.settings.require_phone&&!form.phone.trim())missingFields.push('رقم الهاتف'); if(data.settings.require_address&&!form.address.trim())missingFields.push('العنوان'); if(deliveryEnabled&&data.settings.require_area&&areas.length&&!form.areaId)missingFields.push('المنطقة'); if(data.settings.require_notes&&!form.notes.trim())missingFields.push('الملاحظات');
    if(missingFields.length)return setError(`من فضلك أكمل الحقول المطلوبة: ${missingFields.join('، ')}.`);
    if(form.phone.trim()&&!isPlausiblePhone(form.phone))return setError('رقم الهاتف غير صحيح. اكتب رقمًا مكونًا من 10 إلى 15 رقمًا.');
    const wa=normalizeWhatsAppNumber(data.settings.whatsapp_number); if(!wa)return setError('رقم واتساب غير مضبوط من لوحة الإدارة.');
    sending.current=true; setBusy(true); const win=window.open('about:blank','_blank');
    try{
      const orderId=uid(), orderNumber=makeOrderNumber();
      const draft:Order={id:orderId,order_number:orderNumber,created_at:new Date().toISOString(),customer_name:form.name.trim(),customer_phone:form.phone.trim(),address:form.address.trim(),area_id:deliveryEnabled?(area?.id||null):null,area_name:deliveryEnabled?(area?.name_ar||''):'',product_subtotal:subtotal,delivery_fee:deliveryFee,total,notes:form.notes.trim(),status:'جديد',items:items.map(i=>({id:uid(),order_id:orderId,product_id:i.product_id,product_name:i.product_name,option_id:i.option_id,option_name:i.option_name,unit_price:i.unit_price,quantity:i.quantity,line_total:i.unit_price*i.quantity}))};
      const order=await saveOrder(draft); const values=orderTemplateValues(order,data.settings); let message=renderTemplate(data.settings.whatsapp_order_template,values);
      if(!deliveryEnabled){message=message.split('\n').filter(line=>!line.includes('رسوم التوصيل')&&!line.startsWith('المنطقة:')).join('\n');}
      const url=`https://wa.me/${wa}?text=${encodeURIComponent(message)}`; clear(); await refresh(); if(win)win.location.href=url;else window.location.href=url; nav('/');
    }catch(e:any){if(win)win.close();setError(e?.message||'تعذر حفظ الطلب. حاول مرة أخرى.');}finally{setBusy(false);sending.current=false;}
  };
  return <><Header settings={data.settings}/><main className="container narrow"><h1>إتمام الطلب</h1><div className="checkout-grid"><div className="panel checkout-form">
    <label><FieldTitle required={data.settings.require_name}>الاسم</FieldTitle><input required={data.settings.require_name} value={form.name} onChange={e=>set('name',e.target.value)}/></label>
    <label><FieldTitle required={data.settings.require_phone}>رقم الهاتف</FieldTitle><input required={data.settings.require_phone} value={form.phone} onChange={e=>set('phone',e.target.value)} inputMode="tel"/></label>
    <label><FieldTitle required={data.settings.require_address}>العنوان</FieldTitle><textarea required={data.settings.require_address} value={form.address} onChange={e=>set('address',e.target.value)}/></label>
    {deliveryEnabled&&areas.length>0&&<label><FieldTitle required={data.settings.require_area}>المنطقة</FieldTitle><select required={data.settings.require_area} value={form.areaId} onChange={e=>set('areaId',e.target.value)}><option value="">اختر المنطقة</option>{areas.map(a=><option key={a.id} value={a.id}>{a.name_ar} — {money(a.fee)}</option>)}</select></label>}
    <label><FieldTitle required={data.settings.require_notes}>ملاحظات</FieldTitle><textarea required={data.settings.require_notes} value={form.notes} onChange={e=>set('notes',e.target.value)}/></label>
  </div><div className="summary-card checkout-summary"><h3>ملخص الطلب</h3>{items.map(i=><div key={i.key}><span>{i.product_name} ({i.option_name}) × {i.quantity}</span><b>{money(i.unit_price*i.quantity)}</b></div>)}<hr/><div><span>إجمالي المنتجات</span><b>{money(subtotal)}</b></div>{deliveryEnabled&&<div><span>التوصيل</span><b>{money(deliveryFee)}</b></div>}<div className="total-row"><span>الإجمالي</span><b>{money(total)}</b></div>{error&&<p className="error-text form-error">{error}</p>}<button className="btn whatsapp" disabled={busy} onClick={submit}>{busy?'جاري تجهيز الطلب...':'إرسال الطلب عبر واتساب'}</button><Link className="btn secondary block" to="/cart">العودة للسلة</Link></div></div></main></>;
}
