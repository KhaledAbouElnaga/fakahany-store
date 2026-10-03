import { useState } from 'react';
import type { Product, ProductOption } from '../types';
import { money } from '../lib/utils';
import { useCart } from '../contexts/CartContext';

function optionUsable(o: ProductOption) {
  return o.available && (!o.track_stock || (o.stock_qty ?? 0) > 0);
}

export default function ProductCard({ product }: { product: Product }) {
  const { add } = useCart();
  const opts = [...product.options].sort((a,b) => a.display_order - b.display_order).filter(optionUsable);
  const [optionId, setOptionId] = useState(opts[0]?.id || '');
  const option = opts.find(o => o.id === optionId) || opts[0];
  const usable = product.available && (!product.track_stock || (product.stock_qty ?? 0) > 0) && Boolean(option);
  const hasSale = option && option.old_price && option.old_price > option.price;
  return <article className="product-card">
    <div className="product-image-wrap">
      {hasSale && <span className="sale-badge">خصم</span>}
      {product.image_url ? <img src={product.image_url} alt={product.name_ar}/> : <div className="image-fallback">صورة المنتج</div>}
    </div>
    <div className="product-body">
      <h3>{product.name_ar}</h3>
      {opts.length > 1 ? <select value={option?.id || ''} onChange={e => setOptionId(e.target.value)}>{opts.map(o => <option key={o.id} value={o.id}>{o.name_ar}</option>)}</select> : <small>{option?.name_ar}</small>}
      {option && <div className="price-line"><strong>{money(option.price)}</strong>{hasSale && <del>{money(option.old_price!)}</del>}</div>}
      <button disabled={!usable} onClick={() => option && add(product, option)}>{usable ? 'أضف للسلة +' : 'غير متوفر حاليًا'}</button>
    </div>
  </article>;
}
