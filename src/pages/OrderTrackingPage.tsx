import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Header from '../components/Header';
import Loading from '../components/Loading';
import { useStore } from '../contexts/StoreContext';
import { loadPublicOrderTracking } from '../lib/storeApi';
import { money } from '../lib/utils';

type Tracking={order_number:string;created_at:string;status:string;requested_time:string;total:number;events:Array<{created_at:string;summary:string}>};

export default function OrderTrackingPage(){
  const {token=''}=useParams();
  const {data,loading}=useStore();
  const [tracking,setTracking]=useState<Tracking|null>(null);
  const [error,setError]=useState('');
  const [refreshing,setRefreshing]=useState(false);
  const reload=async()=>{if(!token)return;setRefreshing(true);setError('');try{setTracking(await loadPublicOrderTracking(token))}catch(e:any){setError(e?.message||'تعذر تحميل حالة الطلب.')}finally{setRefreshing(false)}};
  useEffect(()=>{void reload()},[token]);
  if(loading||!data)return <Loading/>;
  if(!data.settings.feature_flags.tracking)return <><Header settings={data.settings}/><main className="center-state"><div><h1>تتبع الطلبات غير مفعل</h1><Link className="btn secondary" to="/">العودة للمتجر</Link></div></main></>;
  return <><Header settings={data.settings}/><main className="container narrow tracking-page">
    <div className="panel tracking-card">
      <h1>تتبع الطلب</h1>
      {error?<><p className="error-text">{error}</p><Link className="btn secondary" to="/">العودة للمتجر</Link></>:!tracking?<Loading text="جاري تحميل حالة الطلب..."/>:<>
        <div className="tracking-summary"><div><span>رقم الطلب</span><b>#{tracking.order_number}</b></div><div><span>الحالة الحالية</span><strong>{tracking.status}</strong></div><div><span>الإجمالي</span><b>{money(tracking.total)}</b></div>{tracking.requested_time&&<div><span>الموعد المطلوب</span><b>{tracking.requested_time}</b></div>}</div>
        <div className="tracking-head"><h3>آخر التحديثات</h3><button className="text-btn" disabled={refreshing} onClick={()=>void reload()}>{refreshing?'جاري التحديث...':'تحديث الحالة'}</button></div>
        <div className="tracking-timeline">{tracking.events.length?tracking.events.map((e,i)=><div className="tracking-event" key={i}><i/><div><b>{e.summary}</b><small>{new Date(e.created_at).toLocaleString('ar-EG')}</small></div></div>):<p className="muted">لا توجد تحديثات إضافية حتى الآن.</p>}</div>
        <Link className="btn secondary block" to="/">العودة للمتجر</Link>
      </>}
    </div>
  </main></>;
}
