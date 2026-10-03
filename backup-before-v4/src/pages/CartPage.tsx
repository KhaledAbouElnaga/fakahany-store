import { Link, useNavigate } from 'react-router-dom';
import Header from '../components/Header';
import Loading from '../components/Loading';
import { useCart } from '../contexts/CartContext';
import { useStore } from '../contexts/StoreContext';
import { isStoreOpenNow, money } from '../lib/utils';

export default function CartPage(){
  const {data,loading}=useStore(); const {items,subtotal,setQuantity,remove}=useCart(); const nav=useNavigate();
  if(loading||!data)return <Loading/>;
  const min=data.settings.min_order||0; const missing=Math.max(0,min-subtotal); const defaultFee=data.settings.default_delivery_fee||0; const storeOpen=isStoreOpenNow(data.settings); const allowed=items.length>0&&missing<=0&&storeOpen;
  return <><Header settings={data.settings}/><main className="container narrow"><h1>سلة التسوق</h1>{!items.length?<div className="empty-state"><p>السلة فارغة حاليًا.</p><Link className="btn secondary" to="/">ابدأ التسوق</Link></div>:<>
    <div className="cart-list">{items.map(i=><div className="cart-item" key={i.key}>{i.image_url?<img src={i.image_url}/>:<div className="thumb-fallback"/>}<div className="grow"><strong>{i.product_name}</strong><small>{i.option_name} · {money(i.unit_price)}</small><div className="qty"><button onClick={()=>setQuantity(i.key,i.quantity-1)}>−</button><b>{i.quantity}</b><button onClick={()=>setQuantity(i.key,i.quantity+1)}>+</button></div></div><div className="cart-line-total">{money(i.unit_price*i.quantity)}<button className="link-danger" onClick={()=>remove(i.key)}>حذف</button></div></div>)}</div>
    <div className="summary-card"><div><span>إجمالي المنتجات</span><b>{money(subtotal)}</b></div><div><span>رسوم التوصيل</span><b>تُحدد حسب المنطقة</b></div><hr/><div className="total-row"><span>الحد الأدنى للطلب</span><b>{money(min)}</b></div>{missing>0&&<p className="warning">أضف منتجات بقيمة {money(missing)} لإتمام الطلب</p>}{!storeOpen&&<p className="warning">المحل مغلق حاليًا حسب حالة المتجر أو مواعيد العمل.</p>}</div>
    <div className="actions-row"><Link className="btn secondary" to="/">متابعة التسوق</Link><button className="btn" disabled={!allowed} onClick={()=>nav('/checkout')}>إتمام الطلب</button></div>
    <small className="muted">رسوم التوصيل الافتراضية الحالية: {money(defaultFee)}</small>
  </>}</main></>;
}
