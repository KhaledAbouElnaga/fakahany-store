import { type FormEvent, useEffect, useState } from 'react';
import type { PlatformStore } from '../types';
import { deletePlatformStore, requestPlatformDeleteCode } from '../lib/platformApi';
import type { PlatformDeleteResult } from '../lib/platformApi';

type Phase='confirm'|'verify';

function normalizeDigits(value:string){
  return value
    .replace(/[\u0660-\u0669]/g,ch=>String(ch.charCodeAt(0)-0x660))
    .replace(/[\u06f0-\u06f9]/g,ch=>String(ch.charCodeAt(0)-0x6f0))
    .replace(/[^0-9]/g,'')
    .slice(0,8);
}

export default function PlatformDeleteConfirm({
  store,onClose,onDeleted
}:{
  store:PlatformStore;
  onClose:()=>void;
  onDeleted:(result:PlatformDeleteResult)=>Promise<void>;
}){
  const [phase,setPhase]=useState<Phase>('confirm');
  const [slug,setSlug]=useState('');
  const [otp,setOtp]=useState('');
  const [email,setEmail]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [sentAt,setSentAt]=useState<number|null>(null);
  const [usingExistingCode,setUsingExistingCode]=useState(false);
  const [now,setNow]=useState(Date.now());

  useEffect(()=>{
    if(phase!=='verify')return;
    const timer=window.setInterval(()=>setNow(Date.now()),1000);
    return()=>window.clearInterval(timer);
  },[phase]);

  const secondsSinceSent=sentAt===null?0:Math.floor((now-sentAt)/1000);
  const resendWait=Math.max(0,60-secondsSinceSent);
  const expiresIn=usingExistingCode?null:Math.max(0,600-secondsSinceSent);
  const exactSlug=slug.trim()===store.slug;
  const validCode=/^[0-9]{6,8}$/.test(otp);

  const requestCode=async()=>{
    if(!exactSlug)return setError('اكتب رمز المتجر بالضبط للتأكيد.');
    setBusy(true);setError('');
    try{
      const result=await requestPlatformDeleteCode();
      setEmail(result.email);
      setOtp('');
      setUsingExistingCode(false);
      setSentAt(Date.now());
      setNow(Date.now());
      setPhase('verify');
    }catch(e:any){
      const message=String(e?.message||'تعذر إرسال الكود.');
      const limited=e?.status===429||e?.code==='over_email_send_rate_limit'||/rate.?limit|429/i.test(message);
      setError(limited
        ?'وصلت المنصة للحد الأقصى لإرسال الإيميلات في Supabase (الخدمة الافتراضية ترسل حتى رسالتين في الساعة للمشروع كله). لا تحاول الإرسال بشكل متكرر؛ انتظر تجدد الحصة أو اربط خدمة SMTP مخصصة. لو عندك كود حديث، استخدم «لدي كود بالفعل» بدون إرسال جديد.'
        :message);
    }finally{setBusy(false)}
  };

  const submit=async(e:FormEvent)=>{
    e.preventDefault();
    if(!exactSlug)return setError('رمز المتجر غير مطابق.');
    if(!validCode)return setError('أدخل كود البريد الإلكتروني كاملًا (6 أو 8 أرقام).');
    if(expiresIn===0)return setError('انتهت صلاحية الكود. اطلب كودًا جديدًا.');
    setBusy(true);setError('');
    try{
      const result=await deletePlatformStore(store.id,store.slug,otp);
      setOtp('');
      await onDeleted(result);
    }catch(e:any){
      setError(e?.message||'تعذر حذف المتجر. لم يتم تأكيد نجاح الحذف.');
    }finally{setBusy(false)}
  };

  return <div className="modal-backdrop" role="presentation">
    <section className="modal-card platform-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="delete-dialog-heading" dir="rtl">
      <div className="platform-delete-title">
        <div>
          <h2 id="delete-dialog-heading">حذف متجر نهائيًا</h2>
          <p className="muted">المتجر: <strong>{store.name}</strong></p>
        </div>
        <button type="button" className="btn secondary" aria-label="إغلاق نافذة الحذف" onClick={onClose} disabled={busy}>إغلاق</button>
      </div>
      <div className="platform-delete-warning">
        <strong>تحذير: عملية نهائية لا يمكن التراجع عنها.</strong>
        سيتم عمل نسخة احتياطية ثم حذف بيانات المتجر وحسابات الدخول الخاصة به، ما لم تكن هذه الحسابات مرتبطة بمتاجر أخرى أو بإدارة المنصة. لا يتأثر أي متجر آخر.
      </div>
      {phase==='confirm'?<form onSubmit={e=>{e.preventDefault();void requestCode()}} className="platform-delete-form">
        <label htmlFor="delete-store-slug">للتأكيد، اكتب رمز المتجر التالي: <code dir="ltr">{store.slug}</code></label>
        <input id="delete-store-slug" autoComplete="off" value={slug} onChange={e=>setSlug(e.target.value)} placeholder={store.slug} dir="ltr" required autoFocus/>
        {error&&<p className="error-text" role="alert">{error}</p>}
        <div className="platform-delete-actions">
          <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn danger-action" disabled={busy||!exactSlug}>{busy?'جاري إرسال الكود...':'إرسال كود التأكيد للإيميل'}</button>
        </div>
        <button type="button" className="platform-delete-resend" disabled={busy||!exactSlug} onClick={()=>{
          setUsingExistingCode(true);
          setSentAt(null);
          setOtp('');
          setEmail('');
          setError('');
          setPhase('verify');
        }}>لدي كود بالفعل — إدخاله بدون إرسال جديد</button>
      </form>:<form onSubmit={submit} className="platform-delete-form">
        <div className="platform-delete-email">
          <strong>{usingExistingCode?'إدخال كود التأكيد الموجود':'تم طلب كود تأكيد على بريد إدارة المنصة'}</strong>
          {email&&<span dir="ltr">{email}</span>}
          <small>اكتب الكود كما ورد في الرسالة. قد يتكون من 6 أو 8 أرقام.</small>
        </div>
        <label htmlFor="delete-email-otp">كود تأكيد الحذف</label>
        <input
          id="delete-email-otp"
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6,8}"
          maxLength={8}
          dir="ltr"
          placeholder="الكود الموجود في الإيميل"
          value={otp}
          onChange={e=>{setOtp(normalizeDigits(e.target.value));setError('')}}
          required
          autoFocus
          aria-describedby="delete-otp-expiry"
        />
        <p id="delete-otp-expiry" className="muted platform-delete-expiry">
          {usingExistingCode
            ?'الكود صالح لمدة 10 دقائق من وقت إرسال الإيميل، وسيتم فحص صلاحيته على السيرفر قبل أي حذف.'
            :expiresIn!==null&&expiresIn>0
              ?'تنتهي صلاحية الكود خلال '+Math.floor(expiresIn/60)+':'+String(expiresIn%60).padStart(2,'0')+' دقيقة.'
              :'انتهت صلاحية الكود. اطلب كودًا جديدًا.'}
        </p>
        {error&&<p className="error-text" role="alert">{error}</p>}
        <div className="platform-delete-actions">
          <button type="button" className="btn secondary" disabled={busy} onClick={onClose}>إلغاء</button>
          <button type="submit" className="btn danger-action" disabled={busy||!validCode||expiresIn===0}>{busy?'جاري التحقق والحذف...':'تأكيد الحذف النهائي'}</button>
        </div>
        <button type="button" className="platform-delete-resend" disabled={busy||resendWait>0} onClick={()=>void requestCode()}>
          {resendWait>0?'إعادة إرسال الكود بعد '+resendWait+' ثانية':'إعادة إرسال كود جديد'}
        </button>
      </form>}
    </section>
  </div>;
}
