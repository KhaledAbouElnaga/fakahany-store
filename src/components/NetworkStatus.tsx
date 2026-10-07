import { useEffect, useState } from 'react';

export default function NetworkStatus(){
  const [online,setOnline]=useState(()=>navigator.onLine);
  useEffect(()=>{
    const on=()=>setOnline(true),off=()=>setOnline(false);
    window.addEventListener('online',on);window.addEventListener('offline',off);
    return()=>{window.removeEventListener('online',on);window.removeEventListener('offline',off)};
  },[]);
  if(online)return null;
  return <div className="network-banner" role="status">الاتصال بالإنترنت غير متاح. انتظر عودة الاتصال ثم أعد المحاولة.</div>;
}
