import { useMemo, useRef, useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Loading from '../components/Loading';
import { useCart } from '../contexts/CartContext';
import { useStore } from '../contexts/StoreContext';
import { getPublicBaseUrl, isPlausiblePhone, isStoreOpenNow, makeOrderNumber, money, normalizeWhatsAppNumber, openWhatsApp, orderTemplateValues, renderTemplate, uid } from '../lib/utils';
import { loadStore, saveOrder } from '../lib/storeApi';
import type { Order } from '../types';

function FieldTitle({children, required}:{children:ReactNode, required:boolean}){return <span className="field-title">{children}{required&&<span className="required-badge">مطلوب</span>}</span>}

export default function CheckoutPage(){
  const {data,loading,refresh}=useStore(); const {items,subtotal,clear}=useCart(); const nav=useNavigate();
  const [form,setForm]=useState({name:'',phone:'',address:'',areaId:'',notes:'',timing:'asap',requestedTime:''});
  const [website,setWebsite]=useState('');
  const [busy,setBusy]=useState(false); const [error,setError]=useState(''); const sending=useRef(false);
  const submissionToken=useRef((()=>{
    let device='';
    try{
      device=localStorage.getItem('fakahany-device-id')||'';
      if(!device){device=(globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():uid()).replaceAll('.','-');localStorage.setItem('fakahany-device-id',device);}
    }catch{device=(globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():uid()).replaceAll('.','-');}
    const submission=(globalThis.crypto?.randomUUID?globalThis.crypto.randomUUID():uid()).replaceAll('.','-');
    return device+'.'+submission;
  })());
  const areas=useMemo(()=>data?.deliveryAreas.filter(a=>a.enabled).sort((a,b)=>a.display_order-b.display_order)||[],[data]);
  if(loading||!data)return <Loading/>;
  if(!items.length)return <main className="container narrow"><div className="empty-state">السلة فارغة.<br/><Link to="/">العودة للمتجر</Link></div></main>;
  const deliveryEnabled=data.settings.delivery_enabled; const missing=Math.max(0,data.settings.min_order-subtotal); const area=areas.find(a=>a.id===form.areaId); const deliveryFee=deliveryEnabled?(area?.fee ?? data.settings.default_delivery_fee):0; const total=subtotal+deliveryFee;
  const set=(k:string,v:string)=>setForm(x=>({...x,[k]:v}));

  const validateFreshCart=async()=>{
    const latest=await loadStore();
    for(const item of items){
      const p=latest.products.find(x=>x.id===item.product_id&&!x.hidden&&x.available);
      const o=p?.options.find(x=>x.id===item.option_id&&x.available);
      if(!p||!o) throw new Error(`المنتج «${item.product_name}» لم يعد متاحًا. ارجع للسلة وعدّل الطلب.`);
      if(Number(o.price)!==Number(item.unit_price)) throw new Error(`تم تغيير سعر «${item.product_name}» من ${money(item.unit_price)} إلى ${money(o.price)}. ارجع للمتجر وأضفه بالسعر الجديد.`);
      const max=Math.min(p.track_stock?Number(p.stock_qty??0):Infinity,o.track_stock?Number(o.stock_qty??0):Infinity);
      if(item.quantity>max) throw new Error(`الكمية المتاحة من «${item.product_name}» أصبحت ${Number.isFinite(max)?max:0}. عدّل الكمية قبل الإرسال.`);
    }
  };

  const submit=async()=>{
    if(sending.current)return; setError('');
    if(!navigator.onLine)return setError('لا يوجد اتصال بالإنترنت حاليًا. انتظر عودة الاتصال ثم حاول مرة أخرى.');
    if(website.trim())return setError('تعذر إتمام الطلب. حاول مرة أخرى.');
    try{
      const now=Date.now();
      const recent=(JSON.parse(localStorage.getItem('fakahany-order-times')||'[]') as number[]).filter(x=>now-x<5*60*1000);
      if(recent.length>=3)return setError('تم إرسال عدة طلبات خلال وقت قصير. انتظر بضع دقائق ثم حاول مرة أخرى.');
    }catch{}
    if(!isStoreOpenNow(data.settings))return setError('المحل مغلق حاليًا حسب إعدادات ومواعيد العمل.');
    if(missing>0)return setError(`أضف منتجات بقيمة ${money(missing)} لإتمام الطلب.`);
    const missingFields:string[]=[];
    if(data.settings.require_name&&!form.name.trim())missingFields.push('الاسم');
    if(data.settings.require_phone&&!form.phone.trim())missingFields.push('رقم الهاتف');
    if(data.settings.require_address&&!form.address.trim())missingFields.push('العنوان');
    if(deliveryEnabled&&data.settings.require_area&&areas.length&&!form.areaId)missingFields.push('المنطقة');
    if(data.settings.require_notes&&!form.notes.trim())missingFields.push('الملاحظات');
    if(data.settings.scheduled_orders_enabled&&form.timing==='scheduled'&&!form.requestedTime)missingFields.push('موعد الطلب');
    if(missingFields.length)return setError(`من فضلك أكمل الحقول المطلوبة: ${missingFields.join('، ')}.`);
    if(form.phone.trim()&&!isPlausiblePhone(form.phone))return setError('رقم الهاتف غير صحيح. اكتب رقمًا مكونًا من 10 إلى 15 رقمًا.');
    if(form.timing==='scheduled'&&form.requestedTime&&new Date(form.requestedTime).getTime()<=Date.now())return setError('اختر موعدًا في المستقبل.');
    const wa=normalizeWhatsAppNumber(data.settings.whatsapp_number); if(!wa)return setError('رقم واتساب غير مضبوط من لوحة الإدارة.');

    const mobile=/android|iphone|ipad|ipod/i.test(navigator.userAgent);
    sending.current=true; setBusy(true); const win=mobile?null:window.open('about:blank','_blank');
    try{
      await validateFreshCart();
      const orderId=uid(), orderNumber=makeOrderNumber();
      const requestedTime=data.settings.scheduled_orders_enabled?(form.timing==='scheduled'?new Date(form.requestedTime).toLocaleString('ar-EG'):'في أقرب وقت'):'';
      const requestedFor=data.settings.scheduled_orders_enabled&&form.timing==='scheduled'?new Date(form.requestedTime).toISOString():null;
      const draft:Order={id:orderId,order_number:orderNumber,created_at:new Date().toISOString(),customer_name:form.name.trim(),customer_phone:form.phone.trim(),address:form.address.trim(),area_id:deliveryEnabled?(area?.id||null):null,area_name:deliveryEnabled?(area?.name_ar||''):'',product_subtotal:subtotal,delivery_fee:deliveryFee,total,notes:form.notes.trim(),requested_time:requestedTime,requested_for:requestedFor,client_token:submissionToken.current,internal_note:'',status:'جديد',items:items.map(i=>({id:uid(),order_id:orderId,product_id:i.product_id,product_name:i.product_name,option_id:i.option_id,option_name:i.option_name,unit_price:i.unit_price,quantity:i.quantity,line_total:i.unit_price*i.quantity}))};
      const order=await saveOrder(draft);
      const values=orderTemplateValues(order,data.settings);
      let message=renderTemplate(data.settings.whatsapp_order_template,values);
      if(!deliveryEnabled){message=message.split('\n').filter(line=>!line.includes('رسوم التوصيل')&&!line.startsWith('المنطقة:')).join('\n');}
      if(!data.settings.scheduled_orders_enabled){message=message.split('\n').filter(line=>!line.startsWith('موعد الطلب:')).join('\n');}
      if(data.settings.feature_flags.tracking&&order.tracking_token){message+=`\n\nتتبع الطلب: ${getPublicBaseUrl(data.settings)}/track/${order.tracking_token}`;}
      localStorage.setItem('fakahany-last-order',JSON.stringify(order));
      try{
        const now=Date.now();
        const recent=(JSON.parse(localStorage.getItem('fakahany-order-times')||'[]') as number[]).filter(x=>now-x<10*60*1000);
        localStorage.setItem('fakahany-order-times',JSON.stringify([...recent,now].slice(-8)));
      }catch{}
      localStorage.setItem('fakahany-last-success',JSON.stringify({order,message}));
      clear(); await refresh(); nav('/order-success',{replace:true});
      if(mobile) window.setTimeout(()=>openWhatsApp(wa,message),120);
      else openWhatsApp(wa,message,win);
    }catch(e:any){
      if(win)win.close();
      setError(e?.message||'تعذر حفظ الطلب. حاول مرة أخرى.');
    }finally{setBusy(false);sending.current=false;}
  };

  return <><Header settings={data.settings}/><main className="container narrow"><h1>إتمام الطلب</h1><div className="checkout-grid"><div className="panel checkout-form">
    <label><FieldTitle required={data.settings.require_name}>الاسم</FieldTitle><input required={data.settings.require_name} value={form.name} onChange={e=>set('name',e.target.value)}/></label>
    <label><FieldTitle required={data.settings.require_phone}>رقم الهاتف</FieldTitle><input required={data.settings.require_phone} value={form.phone} onChange={e=>set('phone',e.target.value)} inputMode="tel"/></label>
    <label><FieldTitle required={data.settings.require_address}>العنوان</FieldTitle><textarea required={data.settings.require_address} value={form.address} onChange={e=>set('address',e.target.value)}/></label>
    {deliveryEnabled&&areas.length>0&&<label><FieldTitle required={data.settings.require_area}>المنطقة</FieldTitle><select required={data.settings.require_area} value={form.areaId} onChange={e=>set('areaId',e.target.value)}><option value="">اختر المنطقة</option>{areas.map(a=><option key={a.id} value={a.id}>{a.name_ar} — {money(a.fee)}</option>)}</select></label>}
    {data.settings.scheduled_orders_enabled&&<div className="timing-box"><FieldTitle required={false}>موعد الطلب</FieldTitle><div className="timing-options"><label><input type="radio" name="timing" checked={form.timing==='asap'} onChange={()=>set('timing','asap')}/> في أقرب وقت</label><label><input type="radio" name="timing" checked={form.timing==='scheduled'} onChange={()=>set('timing','scheduled')}/> اختيار موعد</label></div>{form.timing==='scheduled'&&<><input type="datetime-local" value={form.requestedTime} onChange={e=>set('requestedTime',e.target.value)}/>{data.settings.delivery_capacity_enabled&&<small className="muted">عدد الطلبات في كل فترة محدود. إذا امتلأت الفترة سيطلب منك النظام اختيار موعد آخر.</small>}</>}</div>}
    <label><FieldTitle required={data.settings.require_notes}>ملاحظات</FieldTitle><textarea required={data.settings.require_notes} value={form.notes} onChange={e=>set('notes',e.target.value)}/></label>
    <label className="bot-trap" aria-hidden="true">الموقع<input tabIndex={-1} autoComplete="off" value={website} onChange={e=>setWebsite(e.target.value)}/></label>
  </div><div className="summary-card checkout-summary"><h3>ملخص الطلب</h3>{items.map(i=><div key={i.key}><span>{i.product_name} ({i.option_name}) × {i.quantity}</span><b>{money(i.unit_price*i.quantity)}</b></div>)}<hr/><div><span>إجمالي المنتجات</span><b>{money(subtotal)}</b></div>{deliveryEnabled&&<div><span>التوصيل</span><b>{money(deliveryFee)}</b></div>}<div className="total-row"><span>الإجمالي</span><b>{money(total)}</b></div><small className="muted">يتم التأكد من السعر والمخزون مرة أخيرة قبل تسجيل الطلب.</small>{error&&<p className="error-text form-error">{error}</p>}<button className="btn whatsapp" disabled={busy} onClick={submit}>{busy?'جاري مراجعة الطلب...':'تسجيل الطلب وفتح واتساب'}</button><Link className="btn secondary block" to="/cart">العودة للسلة</Link></div></div></main></>;
}
