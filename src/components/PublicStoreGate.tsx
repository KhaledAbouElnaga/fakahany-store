import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import Loading from './Loading';
import Header from './Header';
import { useStore } from '../contexts/StoreContext';

export default function PublicStoreGate({children}:{children:ReactNode}){
  const {data,loading,error,refresh}=useStore();
  if(loading)return <Loading/>;
  if(error||!data)return <main className="center-state error-state"><div><h1>تعذر تحميل المتجر</h1><p>{error||'حاول مرة أخرى.'}</p><button className="btn" onClick={()=>void refresh()}>إعادة المحاولة</button></div></main>;
  if(data.settings.maintenance_mode)return <><Header settings={data.settings}/><main className="center-state maintenance-state"><div className="maintenance-card"><div className="maintenance-icon">🛠</div><h1>المتجر تحت الصيانة</h1><p>{data.settings.maintenance_message||'نعود قريبًا.'}</p>{data.settings.phone&&<a className="btn secondary" href={`tel:${data.settings.phone}`}>اتصال بالمتجر</a>}<Link className="text-btn" to="/track">تتبع طلب سابق</Link></div></main></>;
  return <>{children}</>;
}
