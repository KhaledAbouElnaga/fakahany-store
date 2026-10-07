import { FormEvent, useEffect, useMemo, useState } from 'react';
import { createPlatformStore, isPlatformAdmin, listPlatformStores, setPlatformStoreDomain, setPlatformStoreStatus, signInPlatform, signOutPlatform } from '../lib/platformApi';
import type { PlatformStore } from '../types';
import { clearResolvedTenant } from '../lib/tenant';
import { updateNeutralPageMeta } from '../lib/utils';

export default function PlatformAdminPage(){
  const [authorized,setAuthorized]=useState<boolean|null>(null);
  const [stores,setStores]=useState<PlatformStore[]>([]);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [created,setCreated]=useState<{slug:string;invite_code:string;owner_email:string}|null>(null);
  const [login,setLogin]=useState({email:'',password:''});
  const [form,setForm]=useState({name:'',slug:'',ownerEmail:'',customDomain:''});

  const refresh=async()=>{
    setError('');
    try{setStores(await listPlatformStores())}catch(e:any){setError(e?.message||'تعذر تحميل المتاجر.')}
  };

  useEffect(()=>{
    clearResolvedTenant({forgetPreview:true});
    updateNeutralPageMeta('Fakahany SaaS — إدارة المنصة','إدارة جميع المتاجر من منصة واحدة.');
    void isPlatformAdmin().then(async ok=>{setAuthorized(ok);if(ok)await refresh()}).catch(()=>setAuthorized(false));
  },[]);

  const previewBase=useMemo(()=>typeof location==='undefined'?'':location.origin,[]);

  const submitLogin=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setError('');
    try{await signInPlatform(login.email,login.password);setAuthorized(true);await refresh()}
    catch(e:any){setError(e?.message||'تعذر تسجيل الدخول.')}
    finally{setBusy(false)}
  };

  const createStore=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setError('');setCreated(null);
    try{
      const result=await createPlatformStore(form);
      setCreated({slug:result.slug,invite_code:result.invite_code,owner_email:result.owner_email});
      setForm({name:'',slug:'',ownerEmail:'',customDomain:''});
      await refresh();
    }catch(e:any){setError(e?.message||'تعذر إنشاء المتجر.')}
    finally{setBusy(false)}
  };

  const toggle=async(store:PlatformStore)=>{
    setBusy(true);setError('');
    try{await setPlatformStoreStatus(store.id,store.status==='active'?'suspended':'active');await refresh()}
    catch(e:any){setError(e?.message||'تعذر تحديث حالة المتجر.')}
    finally{setBusy(false)}
  };

  const changeDomain=async(store:PlatformStore)=>{
    const value=window.prompt('اكتب الدومين الكامل بدون https://. اتركه فارغًا لإزالته.',store.custom_domain||'');
    if(value===null)return;
    setBusy(true);setError('');
    try{await setPlatformStoreDomain(store.id,value);await refresh()}
    catch(e:any){setError(e?.message||'تعذر تحديث الدومين.')}
    finally{setBusy(false)}
  };

  if(authorized===null)return <div className="center-state">جاري فتح إدارة المنصة...</div>;

  if(!authorized)return <main className="platform-login"><form className="login-card" onSubmit={submitLogin}>
    <h1>إدارة المنصة</h1>
    <p className="muted">هذه الصفحة لمالك نظام المتاجر فقط.</p>
    {error&&<div className="form-error">{error}</div>}
    <label>البريد الإلكتروني<input type="email" required value={login.email} onChange={e=>setLogin(v=>({...v,email:e.target.value}))}/></label>
    <label>كلمة المرور<input type="password" required value={login.password} onChange={e=>setLogin(v=>({...v,password:e.target.value}))}/></label>
    <button className="btn" disabled={busy}>{busy?'جاري الدخول...':'دخول'}</button>
  </form></main>;

  return <div className="platform-shell">
    <header className="platform-topbar"><div><strong>Fakahany SaaS</strong><span>إدارة المتاجر</span></div><div className="platform-top-actions"><button className="btn secondary" onClick={()=>void signOutPlatform().then(()=>setAuthorized(false))}>تسجيل الخروج</button></div></header>
    <main className="platform-main">
      <div className="page-title"><div><h1>المتاجر</h1><p className="muted">نسخة كود واحدة، وبيانات منفصلة بالكامل لكل متجر.</p></div></div>
      {error&&<div className="form-error">{error}</div>}
      {created&&<div className="platform-created">
        <div><b>تم إنشاء المتجر بنجاح</b><span>أرسل كود الدعوة لصاحب المتجر مع رابط لوحة الإدارة الخاصة بدومينه.</span></div>
        <div className="invite-code-box"><span>البريد: {created.owner_email}</span><strong dir="ltr">{created.invite_code}</strong></div>
        <div className="platform-created-actions">
          <a className="btn secondary" href={previewBase+'/?store='+encodeURIComponent(created.slug)} target="_blank" rel="noreferrer">معاينة مؤقتة</a>
          <a className="btn" href={previewBase+'/admin?store='+encodeURIComponent(created.slug)} target="_blank" rel="noreferrer">رابط إعداد المالك</a>
        </div>
      </div>}

      <section className="panel platform-create-panel">
        <h2>إضافة متجر جديد</h2>
        <form className="platform-create-grid" onSubmit={createStore}>
          <label>اسم المتجر<input required value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} placeholder="مثال: فواكه أحمد"/></label>
          <label>Store Slug<input required dir="ltr" pattern="[a-z0-9-]{3,40}" value={form.slug} onChange={e=>setForm(v=>({...v,slug:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'')}))} placeholder="ahmed"/></label>
          <label>بريد المالك<input required type="email" dir="ltr" value={form.ownerEmail} onChange={e=>setForm(v=>({...v,ownerEmail:e.target.value}))} placeholder="owner@example.com"/></label>
          <label>Custom Domain اختياري<input dir="ltr" value={form.customDomain} onChange={e=>setForm(v=>({...v,customDomain:e.target.value.replace(/^https?:\/\//,'').replace(/\/$/,'')}))} placeholder="shop.example.com"/></label>
          <button className="btn" disabled={busy}>{busy?'جاري الإنشاء...':'+ إنشاء المتجر'}</button>
        </form>
      </section>

      <section className="platform-store-grid">
        {stores.map(store=><article className="platform-store-card" key={store.id}>
          <div className="platform-store-head"><div><h3>{store.name}</h3><code>{store.slug}</code></div><span className={'platform-status '+store.status}>{store.status==='active'?'نشط':'موقوف'}</span></div>
          <div className="platform-store-meta">
            <span>المالك: <b>{store.owner_email||'لم ينضم بعد'}</b></span>
            <span>المنتجات: <b>{store.products_count}</b></span>
            <span>الطلبات: <b>{store.orders_count}</b></span>
            <span>الفريق: <b>{store.staff_count}</b></span>
          </div>
          <div className="platform-domain"><small>الدومين</small><strong dir="ltr">{store.custom_domain||'غير مربوط بعد'}</strong></div>
          <div className="platform-card-actions">
            <a className="btn secondary" href={previewBase+'/?store='+encodeURIComponent(store.slug)} target="_blank" rel="noreferrer">معاينة</a>
            <a className="btn secondary" href={previewBase+'/admin?store='+encodeURIComponent(store.slug)} target="_blank" rel="noreferrer">لوحة الإدارة</a>
            <button className="btn secondary" disabled={busy} onClick={()=>void changeDomain(store)}>الدومين</button>
            <button className={'btn '+(store.status==='active'?'danger-action':'')} disabled={busy} onClick={()=>void toggle(store)}>{store.status==='active'?'إيقاف المتجر':'إعادة التفعيل'}</button>
          </div>
        </article>)}
      </section>
    </main>
  </div>;
}
