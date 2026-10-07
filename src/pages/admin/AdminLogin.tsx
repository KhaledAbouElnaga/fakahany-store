import { useEffect, useState } from 'react';
import { adminExists, claimFirstAdminAfterLogin, createFirstAdmin, joinStaffWithInvite, signInAdmin } from '../../lib/auth';
import { supabase, supabaseConfigured } from '../../lib/supabase';

export default function AdminLogin({ onDone }: { onDone: () => void }) {
  const [exists,setExists]=useState<boolean|null>(null);
  const [email,setEmail]=useState('');
  const [password,setPassword]=useState('');
  const [msg,setMsg]=useState(()=>sessionStorage.getItem('fakahany-idle-logout')==='1'?'تم تسجيل خروجك تلقائيًا بعد فترة من عدم الاستخدام لحماية الحساب.':'');
  const [busy,setBusy]=useState(false);
  const [joinMode,setJoinMode]=useState(false);
  const [inviteCode,setInviteCode]=useState('');
  const [displayName,setDisplayName]=useState('');

  useEffect(()=>{sessionStorage.removeItem('fakahany-idle-logout');adminExists().then(setExists).catch(e=>setMsg(e.message));},[]);

  const run=async(fn:()=>Promise<void>)=>{
    setBusy(true);setMsg('');
    try{await fn();onDone();}
    catch(e:any){setMsg(e?.message||'حدث خطأ.');}
    finally{setBusy(false);}
  };

  if(!supabaseConfigured)return <div className="admin-login"><div className="login-card"><h1>وضع التجربة</h1><p>قاعدة البيانات السحابية لم تُربط بعد. يمكنك تجربة لوحة الإدارة بالكامل على جهازك الآن.</p><button className="btn" onClick={()=>run(()=>signInAdmin('',''))}>دخول تجريبي كمدير</button><small>عند ربط Supabase سيختفي هذا الدخول التجريبي تلقائيًا.</small></div></div>;

  return <div className="admin-login"><div className="login-card">
    <h1>{exists===false?'إنشاء أول مدير':joinMode?'انضمام موظف بدعوة':'دخول الإدارة'}</h1>
    {joinMode&&<label>اسم الموظف<input value={displayName} onChange={e=>setDisplayName(e.target.value)}/></label>}
    <label>البريد الإلكتروني<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
    <label>كلمة المرور<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
    {joinMode&&<label>كود الدعوة<input value={inviteCode} onChange={e=>setInviteCode(e.target.value)} placeholder="الكود الذي أرسله لك المالك"/></label>}
    {msg&&<p className="info-box">{msg}</p>}
    {exists===false?<><button className="btn" disabled={busy} onClick={()=>run(()=>createFirstAdmin(email,password))}>إنشاء أول مدير</button><button className="btn secondary" disabled={busy} onClick={()=>run(async()=>{if(!supabase)throw new Error('Supabase غير متصل');const r=await supabase.auth.signInWithPassword({email,password});if(r.error)throw r.error;await claimFirstAdminAfterLogin();})}>فعّلت البريد بالفعل — اجعلني المدير الأول</button></>:joinMode?<><button className="btn" disabled={busy} onClick={()=>run(()=>joinStaffWithInvite(email,password,inviteCode,displayName))}>إنشاء أو ربط حساب الموظف</button><button className="btn secondary" disabled={busy} onClick={()=>{setJoinMode(false);setMsg('')}}>العودة لتسجيل الدخول</button></>:<><button className="btn" disabled={busy} onClick={()=>run(()=>signInAdmin(email,password))}>دخول</button><button className="btn secondary" disabled={busy} onClick={()=>{setJoinMode(true);setMsg('')}}>لدي كود دعوة كموظف</button></>}
  </div></div>;
}
