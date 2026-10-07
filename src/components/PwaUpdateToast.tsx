import { useEffect, useState } from 'react';

export default function PwaUpdateToast(){
  const [worker,setWorker]=useState<ServiceWorker|null>(null);
  useEffect(()=>{
    const fn=(e:Event)=>setWorker((e as CustomEvent<ServiceWorker>).detail);
    window.addEventListener('fakahany-sw-update',fn);
    return()=>window.removeEventListener('fakahany-sw-update',fn);
  },[]);
  if(!worker)return null;
  const update=()=>{
    navigator.serviceWorker.addEventListener('controllerchange',()=>location.reload(),{once:true});
    worker.postMessage({type:'SKIP_WAITING'});
  };
  return <div className="pwa-update-toast" role="status"><span>يتوفر إصدار جديد من المتجر.</span><button onClick={update}>تحديث الآن</button><button aria-label="إغلاق" onClick={()=>setWorker(null)}>✕</button></div>;
}
