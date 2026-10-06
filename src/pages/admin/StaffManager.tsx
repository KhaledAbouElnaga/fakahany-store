import { useEffect, useState } from 'react';
import { createStaffInvite, loadStaffProfiles, updateStaffMember } from '../../lib/auth';
import type { StaffProfile, StaffRole } from '../../types';

const roleLabel:Record<StaffRole,string>={
  owner:'مالك',
  manager:'مدير',
  orders:'موظف طلبات',
  inventory:'موظف مخزون',
  viewer:'مشاهدة فقط'
};

export default function StaffManager(){
  const [staff,setStaff]=useState<StaffProfile[]|null>(null);
  const [email,setEmail]=useState('');
  const [role,setRole]=useState<Exclude<StaffRole,'owner'>>('orders');
  const [invite,setInvite]=useState<{code:string;expires_at:string}|null>(null);
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);

  const reload=async()=>setStaff(await loadStaffProfiles());
  useEffect(()=>{void reload().catch(e=>setMsg(e?.message||'تعذر تحميل الموظفين.'))},[]);

  const makeInvite=async()=>{
    setBusy(true);setMsg('');setInvite(null);
    try{const x=await createStaffInvite(email,role);setInvite(x);setMsg('تم إنشاء الدعوة. أرسل الكود للموظف مع رابط صفحة الإدارة.');}
    catch(e:any){setMsg(e?.message||'تعذر إنشاء الدعوة.')}finally{setBusy(false)}
  };

  const change=async(member:StaffProfile,nextRole:StaffRole,nextActive=member.active)=>{
    setBusy(true);setMsg('');
    try{await updateStaffMember(member.user_id,nextRole,nextActive);await reload();setMsg('تم تحديث صلاحيات الموظف.');}
    catch(e:any){setMsg(e?.message||'تعذر تحديث الموظف.')}finally{setBusy(false)}
  };

  if(!staff)return <div className="panel">جاري تحميل الموظفين...</div>;

  return <>
    <div className="page-title"><h1>الموظفون والصلاحيات</h1></div>
    <section className="panel">
      <h3>دعوة موظف جديد</h3>
      <p className="muted">الكود صالح لمدة 7 أيام ويعمل فقط مع البريد الإلكتروني المحدد.</p>
      <div className="form-grid">
        <label>البريد الإلكتروني<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label>
        <label>الدور<select value={role} onChange={e=>setRole(e.target.value as Exclude<StaffRole,'owner'>)}>
          <option value="manager">مدير</option>
          <option value="orders">موظف طلبات</option>
          <option value="inventory">موظف مخزون</option>
          <option value="viewer">مشاهدة فقط</option>
        </select></label>
      </div>
      <button className="btn" disabled={busy||!email} onClick={()=>void makeInvite()}>إنشاء كود دعوة</button>
      {invite&&<div className="invite-code-box"><small>كود الدعوة</small><strong dir="ltr">{invite.code}</strong><button className="btn secondary" onClick={()=>void navigator.clipboard.writeText(invite.code)}>نسخ الكود</button></div>}
    </section>

    <section className="panel">
      <h3>الحسابات الحالية</h3>
      <div className="table-wrap"><table><thead><tr><th>الموظف</th><th>الدور</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{staff.map(member=><tr key={member.user_id}>
        <td><b>{member.display_name||member.email||'—'}</b><small className="block muted" dir="ltr">{member.email}</small></td>
        <td><select value={member.role} disabled={busy} onChange={e=>void change(member,e.target.value as StaffRole)}>{Object.entries(roleLabel).map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></td>
        <td>{member.active?'مفعل':'موقوف'}</td>
        <td>{member.role==='owner'?<span className="muted">حساب مالك</span>:<button className="btn secondary small-admin-btn" disabled={busy} onClick={()=>void change(member,member.role,!member.active)}>{member.active?'إيقاف':'تفعيل'}</button>}</td>
      </tr>)}</tbody></table></div>
    </section>
    {msg&&<p className={msg.startsWith('تم')?'success-text':'error-text'}>{msg}</p>}
  </>;
}
