import { useState } from 'react';
import { verifyMfaLogin } from '../lib/auth';

export default function MfaChallengeGate({onDone}:{onDone:()=>void}){
  const [code,setCode]=useState('');
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');
  const verify=async()=>{setBusy(true);setMsg('');try{await verifyMfaLogin(code);onDone()}catch(e:any){setMsg(e?.message||'رمز التحقق غير صحيح.')}finally{setBusy(false)}};
  return <div className="admin-login"><div className="login-card"><h1>التحقق بخطوتين</h1><p className="muted">أدخل رمز تطبيق المصادقة لإكمال فتح صلاحيات المالك.</p><label>رمز التحقق<input autoFocus inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={e=>setCode(e.target.value.replace(/\D/g,'').slice(0,6))}/></label>{msg&&<p className="info-box">{msg}</p>}<button className="btn" disabled={busy||code.length!==6} onClick={()=>void verify()}>{busy?'جاري التحقق...':'فتح لوحة الإدارة'}</button></div></div>;
}
