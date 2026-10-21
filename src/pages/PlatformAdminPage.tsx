import { FormEvent, useEffect, useMemo, useState } from 'react';
import {
  createPlatformStore, endPlatformSupport, exportPlatformStore,
  getPlatformOverview, getPlatformSettings, isPlatformAdmin, listPlatformPlans,
  listPlatformStores, platformAdminUrl, platformStoreUrl, savePlatformSettings,
  setPlatformStorePlan, setPlatformStoreStatus,
  platformAccessUnlocked, signInPlatform, signOutPlatform, startPlatformSupport, transferPlatformStoreOwner
} from '../lib/platformApi';
import type { PlatformOverview, PlatformPlan, PlatformSettings, PlatformStore } from '../types';
import { clearResolvedTenant } from '../lib/tenant';
import { downloadText, money, updateNeutralPageMeta } from '../lib/utils';
import PlatformOperationsPanel from '../components/PlatformOperationsPanel';
import PlatformBackupManager from '../components/PlatformBackupManager';
import PlatformDeleteConfirm from '../components/PlatformDeleteConfirm';
import type { PlatformDeleteResult } from '../lib/platformApi';

const EMPTY_OVERVIEW:PlatformOverview={total_stores:0,active_stores:0,suspended_stores:0,stores_active_7d:0,stores_inactive_30d:0,orders_30d:0,revenue_30d:0,products_total:0,staff_total:0,errors_24h:0,visits_30d:0,storage_bytes:0};
const EMPTY_SETTINGS:PlatformSettings={base_domain:'',default_trial_days:14,support_session_minutes:30};

function bytes(n:number){
  if(!n)return '0 MB';
  if(n<1024*1024)return (n/1024).toFixed(1)+' KB';
  if(n<1024*1024*1024)return (n/1024/1024).toFixed(1)+' MB';
  return (n/1024/1024/1024).toFixed(2)+' GB';
}
function when(value:string|null|undefined){
  if(!value)return '—';
  const d=new Date(value);
  if(Number.isNaN(d.getTime()))return '—';
  return d.toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'});
}
const PLAN_DESCRIPTIONS:Record<string,string>={
  basic:'للمتاجر الصغيرة: كتالوج وطلبات وتقارير أساسية، بدون مخزون أو جدولة.',
  pro:'للمتاجر المتوسطة: إمكانيات الأساسي، مع إدارة المخزون وجدولة الأسعار والطلبات.',
  business:'نفس إمكانيات الاحترافي حاليًا، لكن بدون حد ثابت للمنتجات أو الموظفين.'
};
function planLimits(plan:PlatformPlan){
  return `${plan.max_products===null?'منتجات غير محدودة':plan.max_products+' منتج'} · ${plan.max_staff===null?'حسابات غير محدودة':plan.max_staff+' حسابات'}`;
}
function ownerInviteMessage(origin:string,slug:string,email:string,code:string){
  return [
    'دعوة لإدارة المتجر — Matgark — متجرك',
    'رابط تفعيل حساب المالك: '+origin+'/s/'+encodeURIComponent(slug)+'/admin?join=1',
    'البريد المخصص للدعوة: '+email,
    'كود الدعوة: '+code,
    'افتح الرابط، واضغط «لدي كود دعوة» إذا لم تظهر استمارة الدعوة، ثم أنشئ الحساب أو اربط حسابك الحالي.',
    'إذا أنشأت حسابًا جديدًا، افتح رسالة تأكيد البريد الإلكتروني أولًا ثم عد وسجل الدخول.'
  ].join('\n');
}

export default function PlatformAdminPage(){
  const [authorized,setAuthorized]=useState<boolean|null>(null);
  const [stores,setStores]=useState<PlatformStore[]>([]);
  const [plans,setPlans]=useState<PlatformPlan[]>([]);
  const [overview,setOverview]=useState<PlatformOverview>(EMPTY_OVERVIEW);
  const [settings,setSettings]=useState<PlatformSettings>(EMPTY_SETTINGS);
  const [error,setError]=useState('');
  const [ok,setOk]=useState('');
  const [busy,setBusy]=useState(false);
  const [created,setCreated]=useState<{slug:string;invite_code:string;owner_email:string;plan:string}|null>(null);
  const [login,setLogin]=useState({email:'',password:''});
  const [form,setForm]=useState({name:'',slug:'',ownerEmail:'',plan:'pro'});
  const [filter,setFilter]=useState('');
  const [showPlatformSettings,setShowPlatformSettings]=useState(false);
  const [backupStore,setBackupStore]=useState<PlatformStore|null>(null);
  const [deleteStore,setDeleteStore]=useState<PlatformStore|null>(null);

  const origin=useMemo(()=>typeof location==='undefined'?'':location.origin,[]);

  const refresh=async()=>{
    setError('');
    try{
      const [nextStores,nextPlans,nextOverview,nextSettings]=await Promise.all([
        listPlatformStores(),listPlatformPlans(),getPlatformOverview(),getPlatformSettings()
      ]);
      setStores(nextStores);setPlans(nextPlans);setOverview(nextOverview);setSettings(nextSettings);
      if(!nextPlans.some(x=>x.id===form.plan)&&nextPlans[0])setForm(v=>({...v,plan:nextPlans[0].id}));
    }catch(e:any){setError(e?.message||'تعذر تحميل بيانات المنصة.')}
  };

  useEffect(()=>{
    clearResolvedTenant({forgetPreview:true});
    updateNeutralPageMeta('Matgark — متجرك — إدارة المنصة','إدارة جميع المتاجر من منصة واحدة.');
    void endPlatformSupport().catch(()=>{}).finally(()=>{
      if(!platformAccessUnlocked()){
        setAuthorized(false);
        return;
      }
      void isPlatformAdmin().then(async ok=>{setAuthorized(ok);if(ok)await refresh()}).catch(()=>setAuthorized(false));
    });
  },[]);

  const submitLogin=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setError('');setOk('');
    try{await signInPlatform(login.email,login.password);setAuthorized(true);await refresh()}
    catch(e:any){setError(e?.message||'تعذر تسجيل الدخول.')}
    finally{setBusy(false)}
  };

  const createStore=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setError('');setOk('');setCreated(null);
    try{
      const result=await createPlatformStore(form);
      setCreated({slug:result.slug,invite_code:result.invite_code,owner_email:result.owner_email,plan:result.plan});
      setForm(v=>({name:'',slug:'',ownerEmail:'',plan:v.plan}));
      await refresh();setOk('تم إنشاء المتجر. لن يتم إرسال رسالة بريد تلقائيًا؛ انسخ الدعوة وشاركها مع المالك.');
    }catch(e:any){setError(e?.message||'تعذر إنشاء المتجر.')}
    finally{setBusy(false)}
  };

  const toggle=async(store:PlatformStore)=>{
    setBusy(true);setError('');setOk('');
    try{
      await setPlatformStoreStatus(store.id,store.status==='active'?'suspended':'active');
      await refresh();setOk(store.status==='active'?'تم إيقاف المتجر.':'تمت إعادة تفعيل المتجر.');
    }catch(e:any){setError(e?.message||'تعذر تحديث حالة المتجر.')}
    finally{setBusy(false)}
  };

  const changePlan=async(store:PlatformStore,plan:string)=>{
    if(plan===store.plan)return;
    setBusy(true);setError('');setOk('');
    try{await setPlatformStorePlan(store.id,plan);await refresh();setOk('تم تحديث الباقة وحدودها وخصائصها.')}
    catch(e:any){setError(e?.message||'تعذر تغيير الباقة.')}finally{setBusy(false)}
  };

  const issueOwnerInvite=async(store:PlatformStore)=>{
    if(store.staff_count>0){setError('هذه العملية مخصصة للمتجر الذي لم ينضم مالكه بعد. لن يتم تغيير ملكية متجر نشط بهذه الطريقة.');return;}
    const email=window.prompt('بريد المالك الذي سيستخدمه في إنشاء الحساب أو تسجيل الدخول:','');
    if(!email)return;
    setBusy(true);setError('');setOk('');
    try{
      const invitation=await transferPlatformStoreOwner(store.id,email);
      setCreated({slug:store.slug,invite_code:invitation.code,owner_email:invitation.email,plan:store.plan});
      await refresh();
      setOk('تم إنشاء كود دعوة جديد، وأُلغي الكود السابق. انسخ نص الدعوة وأرسله للمالك بنفسك؛ النظام لا يرسلها تلقائيًا.');
      window.scrollTo({top:0,behavior:'smooth'});
    }catch(e:any){setError(e?.message||'تعذر إصدار دعوة جديدة.')}finally{setBusy(false)}
  };

  const support=async(store:PlatformStore)=>{
    setBusy(true);setError('');setOk('');
    try{
      // Never open a blank tab before the server authorizes a support session.
      // Reuse this tab so Auth storage and the intended tenant remain in sync.
      const session=await startPlatformSupport(store.id);
      setOk(`تم فتح جلسة دعم لـ «${store.name}» حتى ${when(session.expires_at)}.`);
      window.location.assign(platformAdminUrl(origin,store)+'&support=1');
    }catch(e:any){
      const message=String(e?.message||'تعذر بدء جلسة الدعم.');
      setError(message);
      if(message.includes('انتهت جلسة إدارة المنصة'))setAuthorized(false);
    }finally{setBusy(false)}
  };

  const transferOwner=async(store:PlatformStore)=>{
    const email=window.prompt('اكتب بريد المالك الجديد.',store.owner_email||'');
    if(!email)return;
    if(!confirm(`إنشاء دعوة نقل ملكية إلى ${email}؟ عند قبولها سيتم إيقاف صلاحيات المالك السابق.`))return;
    setBusy(true);setError('');setOk('');
    try{
      const invite=await transferPlatformStoreOwner(store.id,email);
      await navigator.clipboard.writeText(invite.code).catch(()=>{});
      setOk(`تم إنشاء دعوة نقل الملكية إلى ${invite.email}. الكود: ${invite.code} — تم نسخه للحافظة.`);
    }catch(e:any){setError(e?.message||'تعذر إنشاء دعوة نقل الملكية.')}finally{setBusy(false)}
  };

  const exportStore=async(store:PlatformStore)=>{
    setBusy(true);setError('');setOk('');
    try{
      const payload=await exportPlatformStore(store.id);
      downloadText(`store-${store.slug}-export-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(payload,null,2),'application/json;charset=utf-8');
      setOk('تم تجهيز نسخة كاملة من المتجر.');
    }catch(e:any){setError(e?.message||'تعذر تصدير المتجر.')}finally{setBusy(false)}
  };

  const removeStore=(store:PlatformStore)=>{
    setError('');
    setOk('');
    if(store.status!=='suspended')return setError('أوقف المتجر أولًا قبل الحذف النهائي.');
    setDeleteStore(store);
  };

  const afterDeletion=async(result:PlatformDeleteResult)=>{
    setDeleteStore(null);
    await refresh();
    const summary=result.accounts_deleted>0
      ?' وتم حذف '+result.accounts_deleted+' حساب دخول خاص به.'
      :' ولم تكن هناك حسابات دخول خاصة به لحذفها.';
    const shared=result.accounts_protected>0
      ?' احتفظنا بـ '+result.accounts_protected+' حساب مشترك أو له صلاحيات بالمنصة.':'';
    if(result.auth_cleanup_incomplete){
      setError('تم حذف المتجر، لكن تعذر حذف بعض حسابات الدخول. تحتاج مراجعة الحسابات المتبقية بشكل منفصل.');
      return;
    }
    setOk('تم حذف المتجر بنجاح بعد التحقق من الإيميل.'+summary+shared);
  };

  const saveSettings=async()=>{
    setBusy(true);setError('');setOk('');
    try{await savePlatformSettings(settings);await refresh();setOk('تم حفظ إعدادات المنصة.')}
    catch(e:any){setError(e?.message||'تعذر حفظ إعدادات المنصة.')}finally{setBusy(false)}
  };

  const filtered=stores.filter(s=>!filter.trim()||[s.name,s.slug,s.owner_email,s.plan].some(x=>(x||'').toLowerCase().includes(filter.trim().toLowerCase())));
  const currentPlan=(id:string)=>plans.find(x=>x.id===id);
  const storePublic=(s:PlatformStore)=>platformStoreUrl(origin,s,settings);

  if(authorized===null)return <div className="center-state">جاري فتح إدارة المنصة...</div>;

  if(!authorized)return <main className="platform-login"><form className="login-card" onSubmit={submitLogin}>
    <h1>إدارة المنصة</h1>
    <p className="muted">هذه الصفحة لمالك النظام فقط وليست مرتبطة باسم أي متجر.</p>
    {error&&<div className="form-error">{error}</div>}
    <label>البريد الإلكتروني<input type="email" required value={login.email} onChange={e=>setLogin(v=>({...v,email:e.target.value}))}/></label>
    <label>كلمة المرور<input type="password" required value={login.password} onChange={e=>setLogin(v=>({...v,password:e.target.value}))}/></label>
    <button className="btn" disabled={busy}>{busy?'جاري الدخول...':'دخول'}</button>
  </form></main>;

  return <div className="platform-shell">
    <header className="platform-topbar">
      <div><strong>Matgark — متجرك</strong><span>إدارة المنصة والمتاجر</span></div>
      <div className="platform-top-actions"><button className="btn secondary" onClick={()=>setShowPlatformSettings(v=>!v)}>إعدادات المنصة</button><button className="btn secondary" onClick={()=>void signOutPlatform().then(()=>setAuthorized(false))}>تسجيل الخروج</button></div>
    </header>

    <main className="platform-main">
      <div className="page-title"><div><h1>لوحة المنصة</h1><p className="muted">إدارة المتاجر والمستخدمين وإمكانيات كل متجر والدعم الفني. لا توجد اشتراكات أو دفعات تلقائية.</p></div></div>
      {error&&<div className="form-error">{error}</div>}
      {ok&&<div className="platform-ok">{ok}</div>}

      <section className="platform-overview-grid">
        <div><span>إجمالي المتاجر</span><strong>{overview.total_stores}</strong><small>{overview.active_stores} نشط · {overview.suspended_stores} موقوف</small></div>
        <div><span>نشط آخر 7 أيام</span><strong>{overview.stores_active_7d}</strong><small>{overview.stores_inactive_30d} غير نشط 30 يوم</small></div>
        <div><span>طلبات آخر 30 يوم</span><strong>{overview.orders_30d}</strong><small>إجمالي المنصة</small></div>
        <div><span>مبيعات مكتملة 30 يوم</span><strong>{money(Number(overview.revenue_30d||0))}</strong><small>من كل المتاجر</small></div>
        <div><span>المنتجات / الفريق</span><strong>{overview.products_total} / {overview.staff_total}</strong><small>عبر جميع المتاجر</small></div>
        <div><span>الزيارات 30 يوم</span><strong>{overview.visits_30d}</strong><small>{overview.errors_24h} خطأ Frontend آخر 24 ساعة</small></div>
        <div><span>التخزين</span><strong>{bytes(overview.storage_bytes)}</strong><small>صور جميع المتاجر</small></div>
      </section>

      <PlatformOperationsPanel/>

      {showPlatformSettings&&<section className="panel platform-settings-panel">
        <div className="platform-section-title"><div><h2>إعدادات المنصة</h2><p className="muted">الدومين هنا للمنصة كلها مرة واحدة، وليس دومينًا خاصًا بكل عميل.</p></div></div>
        <div className="form-grid">
          <label>الدومين الأساسي للمنصة<input dir="ltr" value={settings.base_domain} onChange={e=>setSettings(v=>({...v,base_domain:e.target.value.replace(/^https?:\/\//,'').replace(/\/$/,'')}))} placeholder="yourbrand.com"/></label>
          
          <label>مدة جلسة الدعم (دقيقة)<input type="number" min="5" max="240" value={settings.support_session_minutes} onChange={e=>setSettings(v=>({...v,support_session_minutes:Number(e.target.value)}))}/></label>
        </div>
        <div className="platform-domain-note">{settings.base_domain?<><b>نظام الـSubdomains جاهز:</b><span dir="ltr">store-name.{settings.base_domain}</span></>:<><b>حاليًا:</b><span>كل متجر يستخدم رابط <code>/s/slug</code>. عند ربط دومين واحد للمنصة، تتحول الروابط تلقائيًا إلى Subdomains.</span></>}</div>
        <button className="btn" disabled={busy} onClick={()=>void saveSettings()}>حفظ إعدادات المنصة</button>
      </section>}

      {created&&<div className="platform-created">
        <div><b>دعوة مالك المتجر جاهزة</b><span>تنبيه: إنشاء المتجر لا يرسل بريدًا تلقائيًا. انسخ الرسالة التالية وأرسلها للمالك عبر الإيميل أو واتساب. الكود مرتبط بالإيميل المحدد.</span></div>
        <div className="invite-code-box"><span dir="ltr">{created.owner_email}</span><strong dir="ltr">{created.invite_code}</strong><button className="btn secondary" onClick={()=>void navigator.clipboard.writeText(created.invite_code)}>نسخ الكود</button></div>
        <pre className="platform-invite-message" dir="rtl">{ownerInviteMessage(origin,created.slug,created.owner_email,created.invite_code)}</pre>
        <button className="btn" type="button" onClick={()=>void navigator.clipboard.writeText(ownerInviteMessage(origin,created.slug,created.owner_email,created.invite_code)).then(()=>setOk('تم نسخ رسالة الدعوة كاملة، وأصبحت جاهزة للإرسال.')).catch(()=>setError('تعذر نسخ الرسالة؛ انسخها يدويًا من المربع.'))}>نسخ رسالة الدعوة كاملة</button>
        <div className="platform-created-actions">
          <a className="btn secondary" href={platformStoreUrl(origin,{slug:created.slug} as PlatformStore,settings)} target="_blank" rel="noreferrer">معاينة المتجر</a>
          <a className="btn" href={platformAdminUrl(origin,{slug:created.slug} as PlatformStore)+'&join=1'} target="_blank" rel="noreferrer">رابط انضمام المالك</a>
        </div>
      </div>}

      <section className="panel platform-create-panel">
        <div className="platform-section-title"><div><h2>إضافة متجر جديد</h2><p className="muted">أنشئ المتجر وحدد إمكانياته. حساب المالك يتفعل لاحقًا بكود الدعوة؛ لا يتم إرسال إيميل تلقائي.</p></div></div>
        <form className="platform-create-grid saas-create-grid" onSubmit={createStore}>
          <label>اسم المتجر<input required value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} placeholder="مثال: فواكه أحمد"/></label>
          <label>Store Slug<input required dir="ltr" pattern="[a-z0-9-]{3,40}" value={form.slug} onChange={e=>setForm(v=>({...v,slug:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'')}))} placeholder="ahmed"/></label>
          <label>بريد المالك<input required type="email" dir="ltr" value={form.ownerEmail} onChange={e=>setForm(v=>({...v,ownerEmail:e.target.value}))} placeholder="owner@example.com"/></label>
          <label>مستوى إمكانيات المتجر<select value={form.plan} onChange={e=>setForm(v=>({...v,plan:e.target.value}))}>{plans.filter(x=>x.active).map(p=><option key={p.id} value={p.id}>{p.name_ar}</option>)}</select></label>
          <button className="btn" disabled={busy}>{busy?'جاري الإنشاء...':'+ إنشاء المتجر'}</button>
        </form>
        <p className="muted platform-no-billing">هذه المستويات تحدد المميزات وحدود الاستخدام فقط، ولا تمثل أسعارًا أو اشتراكات أو دفعات.</p>
        <div className="platform-plan-explainer">
          {plans.filter(p=>p.active).map(plan=><article key={plan.id} className={form.plan===plan.id?'selected':''}>
            <b>{plan.name_ar}</b>
            <strong>{planLimits(plan)}</strong>
            <p>{PLAN_DESCRIPTIONS[plan.id]||'مستوى إمكانيات للمتجر.'}</p>
          </article>)}
        </div>
      </section>

      <div className="platform-list-toolbar">
        <div><h2>المتاجر</h2><span className="platform-count">{filtered.length}</span></div>
        <input className="admin-search" placeholder="بحث بالاسم أو الرابط أو البريد أو الباقة" value={filter} onChange={e=>setFilter(e.target.value)}/>
      </div>

      <section className="platform-store-grid">
        {filtered.map(store=>{
          const plan=currentPlan(store.plan);
          const publicUrl=storePublic(store);
          const lastActivity=[store.last_order_at,store.owner_last_login_at,store.last_visit_at].filter(Boolean).sort().at(-1)||null;
          return <article className="platform-store-card saas-store-card" key={store.id}>
            <div className="platform-store-head"><div><h3>{store.name}</h3><code>{store.slug}</code></div><div className="platform-store-badges"><span className={'platform-status '+store.status}>{store.status==='active'?'نشط':'موقوف'}</span></div></div>

            <div className="platform-link-box"><small>رابط العميل</small><a dir="ltr" href={publicUrl} target="_blank" rel="noreferrer">{publicUrl.replace(/^https?:\/\//,'')}</a><button onClick={()=>void navigator.clipboard.writeText(publicUrl)}>نسخ</button></div>

            <div className="platform-store-meta saas-meta">
              <span>المالك <b dir="ltr">{store.owner_email||'لم ينضم بعد'}</b></span>
              <span>آخر دخول للمالك <b>{when(store.owner_last_login_at)}</b></span>
              <span>المنتجات <b>{store.products_count}{plan?.max_products?` / ${plan.max_products}`:''}</b></span>
              <span>الفريق <b>{store.staff_count}{plan?.max_staff?` / ${plan.max_staff}`:''}</b></span>
              <span>الطلبات <b>{store.orders_count} · {store.orders_30d} آخر 30 يوم</b></span>
              <span>آخر نشاط <b>{when(lastActivity)}</b></span>
              <span>أخطاء 24 ساعة <b>{store.errors_24h}</b></span>
              <span>التخزين <b>{bytes(store.storage_bytes)}</b></span>
            </div>

            <div className="platform-plan-row">
              <label>مستوى إمكانيات المتجر<select value={store.plan} disabled={busy} onChange={e=>void changePlan(store,e.target.value)}>{plans.filter(x=>x.active).map(p=><option key={p.id} value={p.id}>{p.name_ar}</option>)}</select></label>
              <div className="platform-plan-inline">
                <b>{plan?planLimits(plan):'—'}</b>
                <span>{PLAN_DESCRIPTIONS[store.plan]||'خصائص المتجر الحالية'}</span>
              </div>
            </div>
            <div className="platform-subscription-line"><span>لا توجد اشتراكات أو دفعات تلقائية</span><span className={store.setup_completed?'setup-done':'setup-pending'}>{store.setup_completed?'الإعداد مكتمل':'الإعداد غير مكتمل'}</span></div>

            <div className="platform-card-actions primary-actions">
              <a className="btn secondary" href={publicUrl} target="_blank" rel="noreferrer">المتجر</a>
              <a className="btn secondary" href={platformAdminUrl(origin,store)} target="_blank" rel="noreferrer">لوحة الإدارة</a>
              <button className="btn" disabled={busy} onClick={()=>void support(store)}>دخول دعم</button>
            </div>
            <div className="platform-card-actions secondary-actions">
              <button className="btn secondary" disabled={busy} onClick={()=>setBackupStore(store)}>نسخ احتياطي</button>
              <button className="btn secondary" disabled={busy} onClick={()=>void exportStore(store)}>Export</button>
              {store.staff_count===0?<button className="btn secondary" disabled={busy} onClick={()=>void issueOwnerInvite(store)}>إنشاء / تجديد دعوة المالك</button>:<button className="btn secondary" disabled={busy} onClick={()=>void transferOwner(store)}>نقل الملكية</button>}
              <button className={'btn '+(store.status==='active'?'danger-action':'secondary')} disabled={busy} onClick={()=>void toggle(store)}>{store.status==='active'?'إيقاف':'إعادة التفعيل'}</button>
              {store.status==='suspended'&&<button className="btn danger-action" disabled={busy} onClick={()=>void removeStore(store)}>حذف نهائي</button>}
            </div>
          </article>;
        })}
      </section>
    </main>
    {backupStore&&<PlatformBackupManager store={backupStore} onClose={()=>setBackupStore(null)} onDone={message=>setOk(message)}/>}
    {deleteStore&&<PlatformDeleteConfirm store={deleteStore} onClose={()=>setDeleteStore(null)} onDeleted={afterDeletion}/>} 
  </div>;
}
