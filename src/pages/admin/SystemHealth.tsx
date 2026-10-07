import { useEffect, useMemo, useState } from 'react';
import { loadClientErrors, runDataRetentionCleanup } from '../../lib/storeApi';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import { isLowStock } from '../../lib/utils';
import type { ClientErrorLog, StoreSnapshot } from '../../types';
import { APP_VERSION } from '../../lib/releaseNotes';

type Check={name:string,status:'good'|'warn'|'bad',value:string};

export default function SystemHealth({data}:{data:StoreSnapshot}){
  const [db,setDb]=useState<Check>({name:'قاعدة البيانات',status:'warn',value:'جاري الفحص...'});
  const [storage,setStorage]=useState<Check>({name:'Storage',status:'warn',value:'جاري الفحص...'});
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);
  const [errors,setErrors]=useState<ClientErrorLog[]>([]);

  useEffect(()=>{
    if(!supabaseConfigured||!supabase){setDb({name:'قاعدة البيانات',status:'warn',value:'وضع محلي'});setStorage({name:'Storage',status:'warn',value:'وضع محلي'});return}
    void supabase.from('shop_settings').select('id').eq('id','main').single().then(({error})=>setDb({name:'قاعدة البيانات',status:error?'bad':'good',value:error?'يوجد خطأ':'متصلة وتعمل'}));
    void supabase.storage.from('store-images').list('',{limit:1}).then(({error})=>setStorage({name:'Storage',status:error?'warn':'good',value:error?'لم يمكن التحقق من القائمة':'متصل ويعمل'}));
    void loadClientErrors(20).then(setErrors).catch(()=>{});
  },[]);

  const checks=useMemo<Check[]>(()=>{
    const low=data.products.filter(p=>isLowStock(p,data.settings.low_stock_threshold)).length;
    let domain='Cloudflare Pages';
    try{domain=data.settings.public_site_url?new URL(data.settings.public_site_url).hostname:(location.hostname.endsWith('.pages.dev')?'Cloudflare Pages':'Custom Domain')}catch{}
    return [
      db,storage,
      {name:'واتساب',status:data.settings.whatsapp_number?'good':'warn',value:data.settings.whatsapp_number?'مضبوط':'غير مضبوط'},
      {name:'الدومين',status:data.settings.public_site_url?'good':'warn',value:domain},
      {name:'وضع الصيانة',status:data.settings.maintenance_mode?'warn':'good',value:data.settings.maintenance_mode?'مفعل':'غير مفعل'},
      {name:'المخزون المنخفض',status:low?'warn':'good',value:low?low+' منتج/خيار':'لا يوجد'},
      {name:'آخر Backup محلي',status:localStorage.getItem('fakahany-auto-backup-date')?'good':'warn',value:localStorage.getItem('fakahany-auto-backup-date')||'لم يتم بعد'},
      {name:'إصدار النظام',status:'good',value:APP_VERSION},
      {name:'أخطاء الواجهة الحديثة',status:errors.length?'warn':'good',value:errors.length?`${errors.length} مسجلة`:'لا يوجد'},
    ];
  },[data,db,storage,errors.length]);

  const cleanup=async()=>{setBusy(true);setMsg('');try{const x=await runDataRetentionCleanup();setMsg(`تم التنظيف: سجل النشاط ${x.audit_deleted}، المخزون ${x.inventory_deleted}، الزيارات ${x.visits_deleted}.`)}catch(e:any){setMsg(e?.message||'تعذر تنفيذ التنظيف.')}finally{setBusy(false)}};

  return <><div className="page-title"><h1>صحة النظام</h1><button className="btn secondary" disabled={busy} onClick={()=>void cleanup()}>تنظيف البيانات القديمة الآن</button></div><div className="health-grid">{checks.map(c=><div className={'health-card '+c.status} key={c.name}><span/><small>{c.name}</small><b>{c.value}</b></div>)}</div>{msg&&<p className={msg.startsWith('تم')?'success-text':'error-text'}>{msg}</p>}{errors.length>0&&<section className="panel"><div className="page-title"><h3>آخر أخطاء Frontend</h3><button className="btn secondary small-admin-btn" onClick={()=>void loadClientErrors(20).then(setErrors)}>تحديث</button></div><div className="error-log-list">{errors.map(x=><div key={x.id}><b>{x.message}</b><small>{x.path} · {new Date(x.created_at).toLocaleString('ar-EG')}</small></div>)}</div></section>}
  <section className="panel"><h3>معلومة</h3><p className="muted">الطلبات لا يتم حذفها تلقائيًا. مدد الاحتفاظ هنا تخص سجل النشاط وحركات المخزون وإحصاءات الزيارات فقط.</p></section></>;
}
