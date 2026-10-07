import { useEffect, useRef, useState } from 'react';

type UpdateDetail={registration:ServiceWorkerRegistration;worker:ServiceWorker|null};

export default function PwaUpdateToast(){
  const [updateInfo,setUpdateInfo]=useState<UpdateDetail|null>(null);
  const [updating,setUpdating]=useState(false);
  const reloadTimer=useRef<number|undefined>(undefined);

  useEffect(()=>{
    const fn=(e:Event)=>setUpdateInfo((e as CustomEvent<UpdateDetail>).detail);
    window.addEventListener('fakahany-sw-update',fn);
    return()=>{
      window.removeEventListener('fakahany-sw-update',fn);
      if(reloadTimer.current)window.clearTimeout(reloadTimer.current);
    };
  },[]);

  if(!updateInfo)return null;

  const update=async()=>{
    if(updating)return;
    setUpdating(true);

    let reloaded=false;
    const reload=()=>{
      if(reloaded)return;
      reloaded=true;
      location.reload();
    };

    navigator.serviceWorker.addEventListener('controllerchange',reload,{once:true});

    try{
      const {registration,worker}=updateInfo;
      await registration.update().catch(()=>{});
      const waiting=registration.waiting || (worker?.state==='installed'?worker:null);
      if(waiting)waiting.postMessage({type:'SKIP_WAITING'});
      else if(worker)worker.postMessage({type:'SKIP_WAITING'});
    }finally{
      // Some older service-worker versions activated themselves before the click.
      // In that case no new controllerchange event fires, so force a safe reload.
      reloadTimer.current=window.setTimeout(reload,700);
    }
  };

  return <div className="pwa-update-toast" role="status" aria-live="polite">
    <span>يتوفر إصدار جديد من المتجر.</span>
    <button disabled={updating} onClick={()=>void update()}>{updating?'جاري التحديث...':'تحديث الآن'}</button>
    <button aria-label="إغلاق" disabled={updating} onClick={()=>setUpdateInfo(null)}>✕</button>
  </div>;
}
