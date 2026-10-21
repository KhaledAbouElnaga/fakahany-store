import { storeStorageKey } from '../lib/storeLinks';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Loading from '../components/Loading';
import { useStore } from '../contexts/StoreContext';
import { money, normalizeWhatsAppNumber, openWhatsApp } from '../lib/utils';
import type { Order } from '../types';
import { tenantHref } from '../lib/tenant';

type StoredSuccess={order:Order;message:string};

export default function OrderSuccessPage(){
  const {data,loading,tenant}=useStore();
  if(loading||!data)return <Loading/>;
  let success:StoredSuccess|null=null;
  try{success=JSON.parse(localStorage.getItem(storeStorageKey('fakahany-last-success'))||'null')}catch{}
  if(!success)return <><Header settings={data.settings}/><main className="container narrow"><div className="empty-state"><p>لا توجد بيانات طلب حديثة.</p><Link className="btn secondary" to={tenantHref('/')}>العودة للمتجر</Link></div></main></>;
  const {order,message}=success;
  const wa=normalizeWhatsAppNumber(data.settings.whatsapp_number);
  const isShowroom=tenant?.slug==='demo-market';
  return <><Header settings={data.settings}/><main className="container narrow success-page">
    <div className="success-card">
      <div className="success-mark">✓</div>
      <h1>{isShowroom?'تم تسجيل طلبك التجريبي بنجاح':'تم تسجيل طلبك بنجاح'}</h1>
      {isShowroom&&<p>هذا طلب توضيحي داخل متجر التجربة، لا يمثل عملية شراء ولا يُرسل إلى أي رقم واتساب.</p>}
      <p>رقم الطلب <b>#{order.order_number}</b></p>
      <div className="success-summary">
        <div><span>إجمالي المنتجات</span><b>{money(order.product_subtotal)}</b></div>
        {data.settings.delivery_enabled&&<div><span>التوصيل</span><b>{money(order.delivery_fee)}</b></div>}
        {order.requested_time&&<div><span>الموعد المطلوب</span><b>{order.requested_time}</b></div>}
        <div className="total-row"><span>الإجمالي النهائي</span><b>{money(order.total)}</b></div>
      </div>
      {!isShowroom&&<button className="btn whatsapp" disabled={!wa} onClick={()=>wa&&openWhatsApp(wa,message)}>فتح واتساب</button>}
      {data.settings.feature_flags.tracking&&order.tracking_token&&<Link className="btn secondary block" to={tenantHref(`/track/${order.tracking_token}`)}>تتبع حالة الطلب</Link>}
      <Link className="btn secondary block" to={tenantHref('/')}>العودة للمتجر</Link>
    </div>
  </main></>;
}
