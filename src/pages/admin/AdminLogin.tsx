import { useEffect, useState } from 'react';
import { adminExists, claimFirstAdminAfterLogin, createFirstAdmin, signInAdmin } from '../../lib/auth';
import { supabase, supabaseConfigured } from '../../lib/supabase';

export default function AdminLogin({ onDone }: { onDone: () => void }) {
  const [exists,setExists]=useState<boolean|null>(null); const [email,setEmail]=useState(''); const [password,setPassword]=useState(''); const [msg,setMsg]=useState(''); const [busy,setBusy]=useState(false);
  useEffect(()=>{adminExists().then(setExists).catch(e=>setMsg(e.message));},[]);
  const run=async(fn:()=>Promise<void>)=>{setBusy(true);setMsg('');try{await fn();onDone();}catch(e:any){setMsg(e?.message||'حدث خطأ.');}finally{setBusy(false);}};
  if(!supabaseConfigured)return <div className="admin-login"><div className="login-card"><h1>وضع التجربة</h1><p>قاعدة البيانات السحابية لم تُربط بعد. يمكنك تجربة لوحة الإدارة بالكامل على جهازك الآن.</p><button className="btn" onClick={()=>run(()=>signInAdmin('',''))}>دخول تجريبي كمدير</button><small>عند ربط Supabase سيختفي هذا الدخول التجريبي تلقائيًا.</small></div></div>;
  return <div className="admin-login"><div className="login-card"><h1>{exists===false?'إنشاء أول مدير':'دخول الإدارة'}</h1><label>البريد الإلكتروني<input type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label><label>كلمة المرور<input type="password" value={password} onChange={e=>setPassword(e.target.value)}/></label>{msg&&<p className="info-box">{msg}</p>}{exists===false?<><button className="btn" disabled={busy} onClick={()=>run(()=>createFirstAdmin(email,password))}>إنشاء أول مدير</button><button className="btn secondary" disabled={busy} onClick={()=>run(async()=>{if(!supabase)throw new Error('Supabase غير متصل'); const r=await supabase.auth.signInWithPassword({email,password}); if(r.error)throw r.error; await claimFirstAdminAfterLogin();})}>فعّلت البريد بالفعل — اجعلني المدير الأول</button></>:<button className="btn" disabled={busy} onClick={()=>run(()=>signInAdmin(email,password))}>دخول</button>}</div></div>;
}
