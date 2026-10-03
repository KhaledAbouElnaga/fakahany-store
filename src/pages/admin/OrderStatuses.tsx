import { useEffect, useState } from 'react';
import { loadOrderStatuses, saveOrderStatus } from '../../lib/storeApi';
import { uid } from '../../lib/utils';
import type { OrderStatusDefinition } from '../../types';

type Kind='normal'|'new'|'completed'|'cancelled';

function kindOf(s:OrderStatusDefinition):Kind{
  return s.is_new?'new':s.is_completed?'completed':s.is_cancelled?'cancelled':'normal';
}
function applyKind(s:OrderStatusDefinition,kind:Kind):OrderStatusDefinition{
  return {...s,is_new:kind==='new',is_completed:kind==='completed',is_cancelled:kind==='cancelled'};
}

export default function OrderStatuses(){
  const [items,setItems]=useState<OrderStatusDefinition[]|null>(null);
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');

  const reload=async()=>{
    try{setItems(await loadOrderStatuses())}catch(e:any){setMsg(e?.message||'تعذر تحميل الحالات.');setItems([])}
  };
  useEffect(()=>{void reload()},[]);

  if(!items)return <div className="panel">جاري تحميل الحالات...</div>;

  const add=()=>setItems(v=>[...(v||[]),{
    id:uid(),name:'حالة جديدة',note:'',display_order:(v?.length||0)+1,active:true,is_new:false,is_completed:false,is_cancelled:false
  }]);

  const patch=(id:string,fields:Partial<OrderStatusDefinition>)=>setItems(v=>(v||[]).map(x=>x.id===id?{...x,...fields}:x));

  const saveOne=async(item:OrderStatusDefinition)=>{
    setBusy(true);setMsg('');
    try{
      const saved=await saveOrderStatus(item);
      setItems(v=>(v||[]).map(x=>x.id===saved.id?saved:x).sort((a,b)=>a.display_order-b.display_order));
      setMsg('تم حفظ الحالة بنجاح.');
    }catch(e:any){setMsg(e?.message||'تعذر حفظ الحالة.')}finally{setBusy(false)}
  };

  return <section className="panel status-manager">
    <div className="status-manager-head">
      <div><h3>حالات الطلبات</h3><p className="muted">يمكنك تغيير اسم أي حالة، إضافة حالات جديدة، وإضافة ملاحظة توضيحية تظهر بجانب الحالة داخل الطلبات.</p></div>
      <button className="btn secondary" onClick={add}>إضافة حالة</button>
    </div>
    <p className="muted">نوع الحالة مهم للنظام: «جديدة» لعداد الطلبات الجديدة، «مكتملة» لحساب المبيعات، و«ملغية» لإرجاع المخزون.</p>
    <div className="status-list">
      {[...items].sort((a,b)=>a.display_order-b.display_order).map(item=><div className="status-edit-row" key={item.id}>
        <label>اسم الحالة<input value={item.name} onChange={e=>patch(item.id,{name:e.target.value})}/></label>
        <label>ملاحظة الحالة<input value={item.note} onChange={e=>patch(item.id,{note:e.target.value})} placeholder="اختياري"/></label>
        <label>نوع الحالة<select value={kindOf(item)} onChange={e=>patch(item.id,applyKind(item,e.target.value as Kind))}>
          <option value="normal">عادية</option>
          <option value="new">جديدة</option>
          <option value="completed">مكتملة</option>
          <option value="cancelled">ملغية</option>
        </select></label>
        <label>الترتيب<input type="number" value={item.display_order} onChange={e=>patch(item.id,{display_order:Number(e.target.value)})}/></label>
        <label className="status-active"><input type="checkbox" checked={item.active} onChange={e=>patch(item.id,{active:e.target.checked})}/> مفعلة</label>
        <button className="btn" disabled={busy||!item.name.trim()} onClick={()=>void saveOne(item)}>حفظ</button>
      </div>)}
    </div>
    {msg&&<p className={msg.includes('تعذر')||msg.includes('مطلوب')?'error-text':'success-text'}>{msg}</p>}
  </section>;
}
