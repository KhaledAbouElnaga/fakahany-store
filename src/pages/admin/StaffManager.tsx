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
  const [editing,setEditing]=useState<StaffProfile|null>(null);
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
    setEditing(member);
    setEditTitle(member.job_title||member.display_name||'موظف');
    setEditPermissions(member.permissions.includes('*')?['*']:[...member.permissions]);
    setMsg('');
  };

  const saveEdit=async()=>{
    if(!editing)return;
    setBusy(true);setMsg('');
    try{
      await updateStaffMember(editing.user_id,editTitle,editPermissions,editing.active);
      setEditing(null);await reload();setMsg('تم تحديث بيانات الموظف وصلاحياته.');
    }catch(e:any){setMsg(e?.message||'تعذر تحديث الموظف.')}finally{setBusy(false)}
  };

  const toggleActive=async(member:StaffProfile)=>{
    setBusy(true);setMsg('');
    try{
      await updateStaffMember(member.user_id,member.job_title||'موظف',member.permissions,!member.active);
      await reload();setMsg(member.active?'تم إيقاف حساب الموظف.':'تم تفعيل حساب الموظف.');
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
      <p className="muted">اضغط «تعديل» لفتح الصلاحيات كاملة بدل عرضها كلها داخل الجدول.</p>
      <div className="table-wrap"><table className="mobile-card-table staff-admin-table"><thead><tr><th>الموظف</th><th>المسمى الوظيفي</th><th>الصلاحيات</th><th>الحالة</th><th>الإجراء</th></tr></thead><tbody>{staff.map(member=>{
        const owner=member.role==='owner'||member.permissions.includes('*');
        const count=owner?PERMISSIONS.length:PERMISSIONS.filter(([key])=>member.permissions.includes(key)).length;
        return <tr key={member.user_id}>
          <td data-label="الموظف"><b>{member.display_name||member.email||'—'}</b><small className="block muted" dir="ltr">{member.email}</small></td>
          <td data-label="المسمى الوظيفي"><b>{member.job_title||(owner?'مالك':'موظف')}</b></td>
          <td data-label="الصلاحيات"><span className="permission-count">{owner?'كل الصلاحيات':count+' من '+PERMISSIONS.length}</span></td>
          <td data-label="الحالة"><span className={member.active?'staff-status active':'staff-status'}>{member.active?'مفعل':'موقوف'}</span></td>
          <td data-label="الإجراء">{owner?<span className="muted">حساب مالك</span>:<div className="inline-actions"><button className="btn secondary small-admin-btn" disabled={busy} onClick={()=>beginEdit(member)}>تعديل</button><button className="btn secondary small-admin-btn" disabled={busy} onClick={()=>void toggleActive(member)}>{member.active?'إيقاف':'تفعيل'}</button></div>}</td>
        </tr>;
      })}</tbody></table></div>
    </section>

    {editing&&<div className="modal-backdrop" onClick={()=>!busy&&setEditing(null)}>
      <div className="modal-card staff-edit-modal" onClick={e=>e.stopPropagation()}>
        <div className="modal-head"><div><h2>تعديل الموظف</h2><small className="muted" dir="ltr">{editing.email}</small></div><button disabled={busy} onClick={()=>setEditing(null)}>✕</button></div>
        <label>المسمى الوظيفي<input value={editTitle} onChange={e=>setEditTitle(e.target.value)} placeholder="مثال: مسؤول الطلبات"/></label>
        <h4>الصلاحيات</h4>
        <PermissionPicker value={editPermissions} onChange={setEditPermissions} disabled={busy}/>
        <div className="modal-actions"><button className="btn secondary" disabled={busy} onClick={()=>setEditing(null)}>إلغاء</button><button className="btn" disabled={busy||!editTitle.trim()||!editPermissions.length} onClick={()=>void saveEdit()}>{busy?'جاري الحفظ...':'حفظ التعديلات'}</button></div>
      </div>
    </div>}

    {msg&&<p className={msg.startsWith('تم')?'success-text':'error-text'}>{msg}</p>}
  </>;
}
