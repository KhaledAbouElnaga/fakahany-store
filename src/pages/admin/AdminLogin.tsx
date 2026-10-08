import { useEffect, useState } from 'react';
import { adminExists, claimFirstAdminAfterLogin, createFirstAdmin, joinStaffWithInvite, mfaChallengeNeeded, signInAdmin, verifyMfaLogin } from '../../lib/auth';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import { updateNeutralPageMeta } from '../../lib/utils';

export default function AdminLogin({ onDone }: { onDone: () => void }) {
  const [exists,setExists]=useState<boolean|null>(null);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [msg,setMsg]=useState(()=>sessionStorage.getItem('fakahany-idle-logout')==='1'?'تم تسجيل خروجك تلقائيًا بعد فترة من عدم الاستخدام لحماية الحساب.':'');
  const [busy,setBusy]=useState(false);
  const [joinMode,setJoinMode]=useState(false);
  const [inviteCode,setInviteCode]=useState('');
  const [displayName,setDisplayName]=useState('');
  const [mfaMode,setMfaMode]=useState(false);
  const [mfaCode,setMfaCode]=useState('');

  useEffect(()=>{
    updateNeutralPageMeta('دخول الإدارة — Fakahany SaaS','تسجيل الدخول إلى لوحة إدارة المتجر.');
    sessionStorage.removeItem('fakahany-idle-logout');
    adminExists().then(setExists).catch(e=>setMsg(e.message));
  },[]);

  const run=async(fn:()=>Promise<void>)=>{
    setBusy(true);setMsg('');
    try{await fn();onDone();}
    catch(e:any){setMsg(e?.message||'حدث خطأ.');}
    finally{setBusy(false);}
  };

  const login=async()=>{
    setBusy(true);setMsg('');
    try{
      await signInAdmin(email,password);
      if(await mfaChallengeNeeded()){setMfaMode(true);return}
      onDone();
    }catch(e:any){setMsg(e?.message||'تعذر تسجيل الدخول.')}
    finally{setBusy(false)}
  };

  const verifySecondFactor=async()=>{
    setBusy(true);setMsg('');
    try{await verifyMfaLogin(mfaCode);onDone()}
    catch(e:any){setMsg(e?.message||'رمز التحقق غير صحيح.')}
    finally{setBusy(false)}
  };

  if(!supabaseConfigured)return <div className="admin-login"><div className="login-card"><h1>وضع التجربة</h1><p>قاعدة البيانات السحابية لم تُربط بعد. يمكنك تجربة لوحة الإدارة بالكامل على جهازك الآن.</p><button className="btn" onClick={()=>run(()=>signInAdmin('',''))}>دخول تجريبي كمدير</button><small>عند ربط Supabase سيختفي هذا الدخول التجريبي تلقائيًا.</small></div></div>;

  if(mfaMode)return <div className="admin-login"><div className="login-card"><h1>التحقق بخطوتين</h1><p className="muted">اكتب الرمز المكون من 6 أرقام من تطبيق المصادقة.</p><label>رمز التحقق<input inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={mfaCode} onChange={e=>setMfaCode(e.target.value.replace(/\D/g,'').slice(0,6))}/></label>{msg&&<p className="info-box">{msg}</p>}<button className="btn" disabled={busy||mfaCode.length!==6} onClick={()=>void verifySecondFactor()}>{busy?'جاري التحقق...':'تأكيد الدخول'}</button></div></div>;

  return <div className="admin-login"><div className="login-card">
    <h1>{exists===false?'إنشاء أول مدير':joinMode?'انضمام بدعوة':'دخول الإدارة'}</h1>
    {joinMode&&<label>اسم الموظف<input value={displayName} onChange={e=>setDisplayName(e.target.value)}/></label>}
    <label>البريد الإلكتروني<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label>كلمة المرور<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {(joinMode||exists===false)&&<small className="muted">لإنشاء حساب جديد: 8 أحرف على الأقل، منها حرف إنجليزي كبير وصغير، ورقم، ورمز خاص مثل @. الحساب الموجود بالفعل يسجل دخوله بكلمة مروره الحالية.</small>}
    {joinMode&&<label>كود الدعوة<input value={inviteCode} onChange={e=>setInviteCode(e.target.value)} placeholder="الكود الذي أرسله لك المالك"/></label>}
    {msg&&<p className="info-box">{msg}</p>}
    {exists===false?<><button className="btn" disabled={busy} onClick={()=>run(()=>createFirstAdmin(email,password))}>إنشاء أول مدير</button><button className="btn secondary" disabled={busy} onClick={()=>run(async()=>{if(!supabase)throw new Error('Supabase غير متصل');const r=await supabase.auth.signInWithPassword({email,password});if(r.error)throw r.error;await claimFirstAdminAfterLogin();})}>فعّلت البريد بالفعل — اجعلني المدير الأول</button></>:joinMode?<><button className="btn" disabled={busy} onClick={()=>run(()=>joinStaffWithInvite(email,password,inviteCode,displayName))}>إنشاء أو ربط الحساب</button><button className="btn secondary" disabled={busy} onClick={()=>{setJoinMode(false);setMsg('')}}>العودة لتسجيل الدخول</button></>:<><button className="btn" disabled={busy} onClick={()=>void login()}>دخول</button><button className="btn secondary" disabled={busy} onClick={()=>{setJoinMode(true);setMsg('')}}>لدي كود دعوة</button></>}
  </div></div>;
}
