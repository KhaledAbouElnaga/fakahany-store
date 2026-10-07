import { useEffect, useState } from 'react';
import { createStaffInvite, loadStaffProfiles, updateStaffMember } from '../../lib/auth';
import type { StaffProfile } from '../../types';

const PERMISSIONS=[
  ['orders.view','مشاهدة الطلبات'],
  ['orders.manage','إدارة الطلبات وتغيير حالتها وتعديلها'],
  ['products.manage','إدارة المنتجات والأقسام والوحدات'],
  ['inventory.manage','إدارة المخزون وتعديل الكميات'],
  ['prices.manage','تعديل الأسعار وجدولة الأسعار'],
  ['reports.view','مشاهدة التقارير والإحصائيات'],
  ['settings.manage','إدارة إعدادات المتجر'],
] as const;

function PermissionPicker({value,onChange,disabled=false}:{value:string[],onChange:(v:string[])=>void,disabled?:boolean}){
  const toggle=(key:string,checked:boolean)=>onChange(checked?[...new Set([...value,key])]:value.filter(x=>x!==key));
  return <div className="permission-grid">{PERMISSIONS.map(([key,label])=><label key={key} className="permission-item">
    <input type="checkbox" checked={value.includes(key)||value.includes('*')} disabled={disabled||value.includes('*')} onChange={e=>toggle(key,e.target.checked)}/>
    <span>{label}</span>
  </label>)}</div>;
}

export default function StaffManager(){
  const [staff,setStaff]=useState<StaffProfile[]|null>(null);
  const [email,setEmail]=useState('');
  const [jobTitle,setJobTitle]=useState('');
  const [permissions,setPermissions]=useState<string[]>([]);
  const [invite,setInvite]=useState<{code:string;expires_at:string}|null>(null);
  const [msg,setMsg]=useState('');
  const [busy,setBusy]=useState(false);
  const [editing,setEditing]=useState<string|null>(null);
  const [editTitle,setEditTitle]=useState('');
  const [editPermissions,setEditPermissions]=useState<string[]>([]);

  const reload=async()=>setStaff(await loadStaffProfiles());
  useEffect(()=>{void reload().catch(e=>setMsg(e?.message||'تعذر تحميل الموظفين.'))},[]);

  const makeInvite=async()=>{
    setBusy(true);setMsg('');setInvite(null);
    try{
      const x=await createStaffInvite(email,jobTitle,permissions);
      setInvite(x);setEmail('');setJobTitle('');setPermissions([]);
      setMsg('تم إنشاء الدعوة بالصلاحيات التي اخترتها. أرسل الكود للموظف مع رابط صفحة الإدارة.');
    }catch(e:any){setMsg(e?.message||'تعذر إنشاء الدعوة.')}finally{setBusy(false)}
  };

  const beginEdit=(member:StaffProfile)=>{
    setEditing(member.user_id);setEditTitle(member.job_title||member.display_name||'موظف');setEditPermissions(member.permissions.includes('*')?['*']:[...member.permissions]);setMsg('');
  };

  const saveEdit=async(member:StaffProfile,nextActive=member.active)=>{
    setBusy(true);setMsg('');
    try{
      const title=editing===member.user_id?editTitle:(member.job_title||'موظف');
      const perms=editing===member.user_id?editPermissions:member.permissions;
      await updateStaffMember(member.user_id,title,perms,nextActive);
      setEditing(null);await reload();setMsg('تم تحديث بيانات الموظف وصلاحياته.');
    }catch(e:any){setMsg(e?.message||'تعذر تحديث الموظف.')}finally{setBusy(false)}
  };

  if(!staff)return <div className="panel">جاري تحميل الموظفين...</div>;

  return <>
    <div className="page-title"><h1>الموظفون والصلاحيات</h1></div>
    <section className="panel">
      <h3>دعوة موظف جديد</h3>
      <p className="muted">أنت تحدد المسمى الوظيفي والصلاحيات يدويًا. الكود صالح لمدة 7 أيام ويعمل فقط مع البريد الإلكتروني المحدد.</p>
      <div className="form-grid">
        <label>البريد الإلكتروني<input type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label>
        <label>المسمى الوظيفي<input value={jobTitle} onChange={e=>setJobTitle(e.target.value)} placeholder="مثال: مسؤول الطلبات"/></label>
      </div>
      <h4>الصلاحيات</h4>
      <PermissionPicker value={permissions} onChange={setPermissions}/>
      <button className="btn" disabled={busy||!email||!jobTitle.trim()||!permissions.length} onClick={()=>void makeInvite()}>إنشاء كود دعوة</button>
      {invite&&<div className="invite-code-box"><small>كود الدعوة</small><strong dir="ltr">{invite.code}</strong><button className="btn secondary" onClick={()=>void navigator.clipboard.writeText(invite.code)}>نسخ الكود</button></div>}
    </section>

    <section className="panel">
      <h3>الحسابات الحالية</h3>
      <div className="table-wrap"><table><thead><tr><th>الموظف</th><th>المسمى الوظيفي</th><th>الصلاحيات</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{staff.map(member=>{
        const owner=member.role==='owner'||member.permissions.includes('*');
        const isEditing=editing===member.user_id;
        return <tr key={member.user_id}>
          <td><b>{member.display_name||member.email||'—'}</b><small className="block muted" dir="ltr">{member.email}</small></td>
          <td>{isEditing&&!owner?<input value={editTitle} onChange={e=>setEditTitle(e.target.value)}/>:<b>{member.job_title|| (owner?'مالك':'موظف')}</b>}</td>
          <td>{owner?<span>كل الصلاحيات</span>:isEditing?<PermissionPicker value={editPermissions} onChange={setEditPermissions} disabled={busy}/>:<small>{PERMISSIONS.filter(([key])=>member.permissions.includes(key)).map(([,label])=>label).join('، ')||'بدون صلاحيات'}</small>}</td>
          <td>{member.active?'مفعل':'موقوف'}</td>
          <td>{owner?<span className="muted">حساب مالك</span>:isEditing?<div className="inline-actions"><button className="btn small-admin-btn" disabled={busy||!editTitle.trim()||!editPermissions.length} onClick={()=>void saveEdit(member)}>حفظ</button><button className="btn secondary small-admin-btn" disabled={busy} onClick={()=>setEditing(null)}>إلغاء</button></div>:<div className="inline-actions"><button className="btn secondary small-admin-btn" disabled={busy} onClick={()=>beginEdit(member)}>تعديل</button><button className="btn secondary small-admin-btn" disabled={busy} onClick={()=>void saveEdit(member,!member.active)}>{member.active?'إيقاف':'تفعيل'}</button></div>}</td>
        </tr>;
      })}</tbody></table></div>
    </section>
    {msg&&<p className={msg.startsWith('تم')?'success-text':'error-text'}>{msg}</p>}
  </>;
}
