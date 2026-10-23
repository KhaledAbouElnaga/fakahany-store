import { productImages } from '../lib/productImages';
import { useMemo, useState } from 'react';
import type { Product, ProductOption } from '../types';
import { isLowStock, isOutOfStock, money } from '../lib/utils';
import { useCart } from '../contexts/CartContext';
import { useStore } from '../contexts/StoreContext';
import { needsPriceInquiry, priceInquiryHref } from '../lib/productInquiry';

function optionUsable(o: ProductOption) { return o.available && (!o.track_stock || Number(o.stock_qty ?? 0) > 0); }

export default function ProductCard({ product, lowStockThreshold=5, onQuickView, favorite=false, onToggleFavorite }: { product: Product; lowStockThreshold?:number; onQuickView?:(p:Product)=>void; favorite?:boolean; onToggleFavorite?:(p:Product)=>void }) {
  const { add, items } = useCart();
  const {data}=useStore();
  const inquiry=needsPriceInquiry(product);
  const inquiryHref=priceInquiryHref(data?.settings.whatsapp_number||data?.settings.phone||'',product);
  const opts = useMemo(()=>[...product.options].sort((a,b) => a.display_order - b.display_order).filter(optionUsable),[product.options]);
  const [optionId, setOptionId] = useState(opts[0]?.id || '');
  const [feedback, setFeedback] = useState('');
  const option = opts.find(o => o.id === optionId) || opts[0];
  const out = isOutOfStock(product) || !product.available || !option;
  const usable = !out;
  const hasSale = Boolean(option && option.old_price && option.old_price > option.price);
  const discount = hasSale && option?.old_price ? Math.max(1,Math.round((1-option.price/option.old_price)*100)) : 0;
  const low = !out && isLowStock(product,lowStockThreshold);

  const addToCart = () => {
    if (!option || !usable) return;
    const current = items.find(x=>x.product_id===product.id&&x.option_id===option.id)?.quantity || 0;
    const optionLimit = option.track_stock ? Number(option.stock_qty ?? 0) : Infinity;
    const productLimit = product.track_stock ? Number(product.stock_qty ?? 0) : Infinity;
    const limit = Math.min(optionLimit,productLimit);
    if (current >= limit) { setFeedback('وصلت للكمية المتاحة'); window.setTimeout(()=>setFeedback(''),1800); return; }
    add(product, option); setFeedback('✓ تمت الإضافة للسلة'); window.setTimeout(() => setFeedback(''), 1800);
  };

  return <article className="product-card">
    {onToggleFavorite&&<button type="button" className={favorite?'favorite-btn active':'favorite-btn'} aria-label={favorite?`إزالة ${product.name_ar} من المفضلة`:`إضافة ${product.name_ar} للمفضلة`} aria-pressed={favorite} onClick={()=>onToggleFavorite(product)}>{favorite?'♥':'♡'}</button>}
    <button className="product-image-button" type="button" onClick={()=>onQuickView?.(product)} aria-label={`عرض تفاصيل ${product.name_ar}`}>
      <div className="product-image-wrap">
        {productImages(product).length>1&&<span className="product-image-count">{productImages(product).length} صور</span>}
        {hasSale && <span className="sale-badge">خصم {discount}٪</span>}
        {!inquiry && (out ? <span className="stock-badge out">نفد مؤقتًا</span> : low ? <span className="stock-badge low">كمية قليلة</span> : null)}
        {product.image_url ? <img src={product.image_url} alt={product.name_ar} loading="lazy"/> : <div className="image-fallback">صورة المنتج</div>}
      </div>
    </button>
    <div className="product-body">
      <button className="product-title-button" type="button" onClick={()=>onQuickView?.(product)}><h3>{product.name_ar}</h3></button>
      {opts.length > 1 ? <select aria-label={`اختر خيار ${product.name_ar}`} value={option?.id || ''} onChange={e => setOptionId(e.target.value)}>{opts.map(o => <option key={o.id} value={o.id}>{o.name_ar}</option>)}</select> : <small>{option?.name_ar}</small>}
      {option && <div className="price-line"><strong>{money(option.price)}</strong>{hasSale && <del>{money(option.old_price!)}</del>}</div>}
      {inquiry?<><div className="price-line"><strong>السعر عند الاستفسار</strong></div>{inquiryHref?<a className="btn" href={inquiryHref} target="_blank" rel="noreferrer">استفسر عن السعر والتوفر</a>:<span>تفاصيل البيع قيد المراجعة</span>}</>:<button disabled={!usable} onClick={addToCart} aria-label={usable?`أضف ${product.name_ar} للسلة`:`${product.name_ar} غير متوفر حاليًا`}>{usable ? 'أضف للسلة +' : 'غير متوفر حاليًا'}</button>}
      {onQuickView&&<button type="button" className="details-link" onClick={()=>onQuickView(product)}>عرض التفاصيل</button>}
      <div className={`add-feedback ${feedback ? 'show' : ''}`} role="status" aria-live="polite">{feedback}</div>
    </div>
  </article>;
}
