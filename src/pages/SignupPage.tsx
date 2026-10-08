import { FormEvent, useEffect, useState } from 'react';
import { finalizeSelfServiceStore, loadPendingSignup, signUpStoreOwner } from '../lib/signupApi';
import { supabase } from '../lib/supabase';
import { validateStrongPassword } from '../lib/auth';
import { updateNeutralPageMeta } from '../lib/utils';

export default function SignupPage(){
  const [form,setForm]=useState({name:'',slug:'',email:'',password:''});
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  const [completing,setCompleting]=useState(false);

  const finishPending=async()=>{
    const pending=loadPendingSignup();
    if(!pending||!supabase)return false;
    const {data:{session}}=await supabase.auth.getSession();
    if(!session)return false;
    setCompleting(true);setError('');setMessage('جاري إنشاء متجرك...');
    try{
      const result=await finalizeSelfServiceStore(pending);
      location.assign('/admin?store='+encodeURIComponent(result.slug));
      return true;
    }catch(e:any){
      const msg=e?.message||'تعذر إنشاء المتجر.';
      if(msg.includes('مرتبط بمتجر بالفعل')){
        setError(msg);
      }else{
        setError(msg);
      }
      setMessage('');
      return false;
    }finally{setCompleting(false)}
  };

  useEffect(()=>{
    updateNeutralPageMeta('إنشاء متجر — Fakahany SaaS','أنشئ متجرك وابدأ الإعداد مباشرة.');
    void finishPending();
    if(!supabase)return;
    const {data}=supabase.auth.onAuthStateChange((_event,session)=>{
      if(session&&loadPendingSignup())void finishPending();
    });
    return()=>data.subscription.unsubscribe();
  },[]);

  const submit=async(e:FormEvent)=>{
    e.preventDefault();setBusy(true);setError('');setMessage('');
    const name=form.name.trim();
    const slug=form.slug.trim().toLowerCase();
    if(name.length<2){setBusy(false);return setError('اكتب اسم المتجر.')}
    if(!/^[a-z0-9][a-z0-9-]{2,39}$/.test(slug)){setBusy(false);return setError('Store Slug يجب أن يكون 3–40 حرفًا إنجليزيًا أو رقمًا ويمكن استخدام -.');}
    try{validateStrongPassword(form.password)}catch(e:any){setBusy(false);return setError(e?.message||'كلمة المرور غير مطابقة للشروط.');}

    try{
      const data=await signUpStoreOwner(form.email,form.password,{name,slug});
      if(data.session){
        setMessage('تم إنشاء الحساب. جاري تجهيز المتجر...');
        await finishPending();
      }else{
        setMessage('تم إرسال رسالة تأكيد إلى بريدك. افتح الرسالة واضغط رابط التأكيد، وبعدها سيتم إنشاء المتجر تلقائيًا.');
      }
    }catch(e:any){
      setError(e?.message||'تعذر إنشاء الحساب.');
    }finally{setBusy(false)}
  };

  return <main className="self-signup-page">
    <div className="self-signup-card">
      <div className="self-signup-brand"><strong>Fakahany SaaS</strong><span>إنشاء متجر جديد</span></div>
      <h1>ابدأ متجرك</h1>
      <p className="muted">أنشئ حسابك، وبعدها سيظهر لك معالج إعداد المتجر خطوة بخطوة.</p>

      {error&&<div className="form-error">{error}</div>}
      {message&&<div className="platform-ok">{message}</div>}

      <form onSubmit={submit} className="self-signup-form">
        <label>اسم المتجر<input required autoComplete="organization" value={form.name} onChange={e=>setForm(v=>({...v,name:e.target.value}))} placeholder="مثال: فواكه أحمد"/></label>
        <label>Store Slug<input required dir="ltr" pattern="[a-z0-9-]{3,40}" value={form.slug} onChange={e=>setForm(v=>({...v,slug:e.target.value.toLowerCase().replace(/[^a-z0-9-]/g,'')}))} placeholder="ahmed"/></label>
        <small className="muted">ده الجزء المميز من رابط متجرك، ويمكن تغييره قبل إنشاء الحساب فقط.</small>
        <label>البريد الإلكتروني<input required type="email" dir="ltr" autoComplete="email" value={form.email} onChange={e=>setForm(v=>({...v,email:e.target.value}))} placeholder="owner@example.com"/></label>
        <label>كلمة المرور<input required type="password" minLength={8} autoComplete="new-password" value={form.password} onChange={e=>setForm(v=>({...v,password:e.target.value}))}/></label>
        <small className="muted">8 أحرف على الأقل، تشمل حرفًا كبيرًا وصغيرًا بالإنجليزية ورقمًا ورمزًا مثل @.</small>
        <button className="btn" disabled={busy||completing}>{busy||completing?'جاري التجهيز...':'إنشاء الحساب والمتجر'}</button>
      </form>

      <div className="self-signup-note"><b>بدون دفع أو اشتراك تلقائي</b><span>إنشاء الحساب لا يفعّل أي عملية تحصيل. نموذج البيع يتم تحديده لاحقًا من إدارة المنصة.</span></div>
      <a className="text-link" href="/platform">دخول إدارة المنصة</a>
    </div>
  </main>;
}
