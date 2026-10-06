import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { cancelScheduledPrice, loadScheduledPrices, scheduleOptionPrice } from '../../lib/storeApi';
import { money } from '../../lib/utils';
import type { ScheduledPrice } from '../../types';

export default function ScheduledPrices(){
  const {data}=useStore();
  const [list,setList]=useState<ScheduledPrice[]|null>(null);
  const [optionId,setOptionId]=useState('');
  const [price,setPrice]=useState('');
  const [oldPrice,setOldPrice]=useState('');
  const [startsAt,setStartsAt]=useState('');
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  const options=useMemo(()=>data?.products.flatMap(p=>p.options.map(o=>({id:o.id,label:`${p.name_ar} — ${o.name_ar}`,price:o.price})))||[],[data]);

  const reload=async()=>setList(await loadScheduledPrices());
  useEffect(()=>{void reload().catch(()=>setList([]))},[]);

  const save=async()=>{
    if(!optionId||!startsAt||price==='')return setMsg('اختر المنتج والسعر وموعد التطبيق.');
    setBusy(true);setMsg('');
    try{
      await scheduleOptionPrice(optionId,Number(price),oldPrice===''?null:Number(oldPrice),new Date(startsAt).toISOString());
      await reload();setMsg('تم جدولة السعر. سيتم تطبيقه تلقائيًا عند حلول الموعد.');
      setPrice('');setOldPrice('');setStartsAt('');
    }catch(e:any){setMsg(e?.message||'تعذر جدولة السعر.')}finally{setBusy(false)}
  };

  if(!data||!list)return <div className="panel">جاري تحميل الأسعار المجدولة...</div>;

  return <>
    <div className="page-title"><h1>الأسعار المجدولة</h1></div>
    <section className="panel">
      <h3>جدولة سعر جديد</h3>
      <p className="muted">السجل المجدول يُحذف تلقائيًا بعد تطبيقه، لذلك لا يتراكم في قاعدة البيانات.</p>
      <div className="form-grid">
        <label>المنتج والخيار<select value={optionId} onChange={e=>{setOptionId(e.target.value);const x=options.find(o=>o.id===e.target.value);if(x)setPrice(String(x.price))}}><option value="">اختر</option>{options.map(o=><option key={o.id} value={o.id}>{o.label}</option>)}</select></label>
        <label>السعر الجديد<input type="number" min="0" step="0.01" value={price} onChange={e=>setPrice(e.target.value)}/></label>
        <label>السعر القديم للعرض — اختياري<input type="number" min="0" step="0.01" value={oldPrice} onChange={e=>setOldPrice(e.target.value)}/></label>
        <label>موعد التطبيق<input type="datetime-local" value={startsAt} onChange={e=>setStartsAt(e.target.value)}/></label>
      </div>
      <button className="btn" disabled={busy} onClick={()=>void save()}>حفظ الجدولة</button>
      {msg&&<p className={msg.startsWith('تم')?'success-text':'error-text'}>{msg}</p>}
    </section>
    <section className="panel">
      <h3>الأسعار المنتظرة</h3>
      {!list.length?<p className="muted">لا توجد أسعار مجدولة.</p>:<div className="table-wrap"><table><thead><tr><th>المنتج</th><th>السعر الجديد</th><th>موعد التطبيق</th><th>إجراء</th></tr></thead><tbody>{list.map(x=><tr key={x.id}>
        <td>{x.product_name}<small className="block muted">{x.option_name}</small></td>
        <td>{money(x.price)}{x.old_price!==null&&<small className="block muted">السعر القديم: {money(x.old_price)}</small>}</td>
        <td>{new Date(x.starts_at).toLocaleString('ar-EG')}</td>
        <td><button className="btn secondary small-admin-btn" disabled={busy} onClick={async()=>{if(!confirm('إلغاء السعر المجدول؟'))return;setBusy(true);try{await cancelScheduledPrice(x.id);await reload()}finally{setBusy(false)}}}>إلغاء</button></td>
      </tr>)}</tbody></table></div>}
    </section>
  </>;
}
