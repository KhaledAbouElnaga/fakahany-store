import { useMemo, useState } from 'react';
import type { Product, ProductOption } from '../types';
import { money, isOutOfStock, isLowStock } from '../lib/utils';
import { useCart } from '../contexts/CartContext';
import ProductGallery from './ProductGallery';
import { useStore } from '../contexts/StoreContext';
import { needsPriceInquiry, priceInquiryHref } from '../lib/productInquiry';

function usable(o: ProductOption){return o.available&&(!o.track_stock||Number(o.stock_qty??0)>0)}

export default function ProductQuickView({product,threshold,onClose}:{product:Product,threshold:number,onClose:()=>void}){
  const {add,items}=useCart();
  const {data}=useStore();
  const inquiry=needsPriceInquiry(product);
  const inquiryHref=priceInquiryHref(data?.settings.whatsapp_number||data?.settings.phone||'',product);
  const opts=useMemo(()=>[...product.options].sort((a,b)=>a.display_order-b.display_order).filter(usable),[product.options]);
  const [optionId,setOptionId]=useState(opts[0]?.id||'');
  const [qty,setQty]=useState(1);
  const option=opts.find(o=>o.id===optionId)||opts[0];
  const out=isOutOfStock(product)||!product.available||!option;
  const low=isLowStock(product,threshold);
  const hasSale=Boolean(option?.old_price&&option.old_price>option.price);
  const discount=hasSale&&option?.old_price?Math.round((1-option.price/option.old_price)*100):0;
  const addNow=()=>{
    if(!option||out)return;
    const existing=items.find(x=>x.product_id===product.id&&x.option_id===option.id)?.quantity||0;
    const max=Math.min(option.track_stock?Number(option.stock_qty??0):Infinity,product.track_stock?Number(product.stock_qty??0):Infinity);
    const allowed=Math.max(0,Math.min(qty,max-existing));
    if(allowed<=0)return;
    add(product,option,allowed); onClose();
  };
  return <div className="modal-backdrop product-quick-backdrop" onClick={onClose}>
    <div className="modal-card product-quick-card" onClick={e=>e.stopPropagation()}>
      <div className="modal-head"><h2>{product.name_ar}</h2><button onClick={onClose}>✕</button></div>
      <div className="quick-view-grid">
        <ProductGallery key={product.id} product={product}/>
        <div className="quick-view-info">
          {product.description_ar&&<p>{product.description_ar}</p>}
          {!inquiry && (out?<span className="stock-pill out">نفد مؤقتًا</span>:low?<span className="stock-pill low">متبقي كمية قليلة</span>:null)}
          {opts.length>1&&<label>اختر الحجم أو الوزن<select value={option?.id||''} onChange={e=>setOptionId(e.target.value)}>{opts.map(o=><option key={o.id} value={o.id}>{o.name_ar}</option>)}</select></label>}
          {option&&<div className="quick-price"><strong>{money(option.price)}</strong>{hasSale&&<><del>{money(option.old_price!)}</del><span>خصم {discount}٪</span></>}</div>}
          {inquiry?<><strong>السعر عند الاستفسار</strong><p>يرجى التواصل لتأكيد السعر والتوفر قبل الطلب.</p>{inquiryHref&&<a className="btn" href={inquiryHref} target="_blank" rel="noreferrer">استفسر عن السعر والتوفر</a>}</>:<><label>الكمية<div className="qty quick-qty"><button onClick={()=>setQty(Math.max(1,qty-1))}>−</button><b>{qty}</b><button onClick={()=>setQty(qty+1)}>+</button></div></label><button className="btn" disabled={out} onClick={addNow}>{out?'غير متوفر حاليًا':'أضف للسلة'}</button></>}
        </div>
      </div>
    </div>
  </div>;
}
