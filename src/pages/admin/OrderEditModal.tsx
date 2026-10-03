import { useMemo, useState } from 'react';
import { useStore } from '../../contexts/StoreContext';
import { editStoreOrder } from '../../lib/storeApi';
import { money, uid } from '../../lib/utils';
import type { Order, OrderItem } from '../../types';

export default function OrderEditModal({order,onClose,onSaved}:{order:Order;onClose:()=>void;onSaved:()=>Promise<void>}){
  const {data}=useStore();
  const [draft,setDraft]=useState<Order>(structuredClone(order));
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');

  const products=useMemo(()=>data?.products.filter(p=>!p.hidden)||[],[data]);
  const localDateTime=(value:string)=>{const d=new Date(value);if(Number.isNaN(d.getTime()))return '';const pad=(n:number)=>String(n).padStart(2,'0');return d.getFullYear()+'-'+pad(d.getMonth()+1)+'-'+pad(d.getDate())+'T'+pad(d.getHours())+':'+pad(d.getMinutes())};

  if(!data)return null;

  const patch=(k:keyof Order,v:any)=>setDraft(x=>({...x,[k]:v}));
  const patchItem=(id:string,fields:Partial<OrderItem>)=>setDraft(x=>({...x,items:x.items.map(i=>i.id===id?{...i,...fields}:i)}));

  const chooseProduct=(itemId:string,productId:string)=>{
    const p=products.find(x=>x.id===productId);
    const o=p?.options.find(x=>x.available)||p?.options[0];
    if(!p||!o)return;
    patchItem(itemId,{product_id:p.id,product_name:p.name_ar,option_id:o.id,option_name:o.name_ar,unit_price:o.price,line_total:o.price});
  };

  const chooseOption=(itemId:string,optionId:string)=>{
    const item=draft.items.find(x=>x.id===itemId);
    const p=products.find(x=>x.id===item?.product_id);
    const o=p?.options.find(x=>x.id===optionId);
    if(!o||!item)return;
    patchItem(itemId,{option_id:o.id,option_name:o.name_ar,unit_price:o.price,line_total:o.price*item.quantity});
  };

  const addItem=()=>{
    const p=products[0];const o=p?.options[0];
    if(!p||!o)return setMsg('لا توجد منتجات متاحة للإضافة.');
    setDraft(x=>({...x,items:[...x.items,{id:uid(),order_id:x.id,product_id:p.id,product_name:p.name_ar,option_id:o.id,option_name:o.name_ar,unit_price:o.price,quantity:1,line_total:o.price}]}));
  };

  const save=async()=>{
    if(!draft.items.length)return setMsg('يجب أن يحتوي الطلب على منتج واحد على الأقل.');
    setBusy(true);setMsg('');
    try{
      const next=structuredClone(draft);
      next.requested_for=draft.requested_for?new Date(draft.requested_for).toISOString():null;
      await editStoreOrder(next);
      await onSaved();
      onClose();
    }catch(e:any){setMsg(e?.message||'تعذر تعديل الطلب.')}finally{setBusy(false)}
  };

  return <div className="modal-backdrop" onClick={onClose}><div className="modal-card large" onClick={e=>e.stopPropagation()}>
    <div className="modal-head"><h2>تعديل الطلب #{order.order_number}</h2><button onClick={onClose}>✕</button></div>
    <div className="form-grid">
      <label>اسم العميل<input value={draft.customer_name} onChange={e=>patch('customer_name',e.target.value)}/></label>
      <label>رقم الهاتف<input value={draft.customer_phone} onChange={e=>patch('customer_phone',e.target.value)}/></label>
      <label className="full">العنوان<textarea value={draft.address} onChange={e=>patch('address',e.target.value)}/></label>
      {data.settings.delivery_enabled&&<label>منطقة التوصيل<select value={draft.area_id||''} onChange={e=>patch('area_id',e.target.value||null)}><option value="">بدون منطقة</option>{data.deliveryAreas.filter(a=>a.enabled).map(a=><option key={a.id} value={a.id}>{a.name_ar} — {money(a.fee)}</option>)}</select></label>}
      <label>موعد الطلب<input type="datetime-local" value={draft.requested_for?localDateTime(draft.requested_for):''} onChange={e=>{patch('requested_for',e.target.value||null);patch('requested_time',e.target.value?new Date(e.target.value).toLocaleString('ar-EG'):'')}}/></label>
      <label className="full">ملاحظات العميل<textarea value={draft.notes} onChange={e=>patch('notes',e.target.value)}/></label>
    </div>

    <div className="edit-order-items">
      <div className="section-title"><h3>منتجات الطلب</h3><button className="btn secondary" onClick={addItem}>إضافة منتج</button></div>
      {draft.items.map(item=>{
        const p=products.find(x=>x.id===item.product_id);
        const opts=p?.options||[];
        return <div className="edit-order-row" key={item.id}>
          <select value={item.product_id||''} onChange={e=>chooseProduct(item.id,e.target.value)}>{products.map(x=><option key={x.id} value={x.id}>{x.name_ar}</option>)}</select>
          <select value={item.option_id||''} onChange={e=>chooseOption(item.id,e.target.value)}>{opts.map(x=><option key={x.id} value={x.id}>{x.name_ar} — {money(x.price)}</option>)}</select>
          <input type="number" min="1" step="1" value={item.quantity} onChange={e=>{const q=Math.max(1,Number(e.target.value)||1);patchItem(item.id,{quantity:q,line_total:item.unit_price*q})}}/>
          <b>{money(item.unit_price*item.quantity)}</b>
          <button className="link-danger" onClick={()=>setDraft(x=>({...x,items:x.items.filter(i=>i.id!==item.id)}))}>حذف</button>
        </div>;
      })}
    </div>

    {msg&&<p className="error-text">{msg}</p>}
    <div className="modal-actions"><button className="btn secondary" onClick={onClose}>إلغاء</button><button className="btn" disabled={busy} onClick={()=>void save()}>{busy?'جاري الحفظ...':'حفظ تعديل الطلب'}</button></div>
  </div></div>;
}
