import { FormEvent, useEffect, useState } from 'react';
import { createPlatformBackup, deletePlatformBackup, listPlatformBackups, restorePlatformBackup } from '../lib/platformApi';
import type { PlatformBackup, PlatformStore } from '../types';

function bytes(n:number){
  if(!n)return '0 KB';
  if(n<1024*1024)return (n/1024).toFixed(1)+' KB';
  return (n/1024/1024).toFixed(1)+' MB';
}
function when(value:string){
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'—':d.toLocaleString('ar-EG',{dateStyle:'medium',timeStyle:'short'});
}
function backupLabel(backup:PlatformBackup){
  return backup.label||(
    backup.kind==='manual'?'نسخة يدوية':
    backup.kind==='scheduled'?'نسخة يومية تلقائية':
    backup.kind==='pre_restore'?'قبل الاسترجاع':'قبل الحذف'
  );
}

export default function PlatformBackupManager({store,onClose,onDone}:{store:PlatformStore;onClose:()=>void;onDone?:(message:string)=>void}){
  const [backups,setBackups]=useState<PlatformBackup[]>([]);
  const [label,setLabel]=useState('');
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');
  const [error,setError]=useState('');
  const [deletingBackup,setDeletingBackup]=useState<PlatformBackup|null>(null);
  const [password,setPassword]=useState('');

  const refresh=async()=>{
    try{setBackups(await listPlatformBackups(store.id))}
    catch(e:any){setError(e?.message||'تعذر تحميل النسخ الاحتياطية.')}
  };
  useEffect(()=>{void refresh()},[store.id]);

  const createBackup=async()=>{
    setBusy(true);setMsg('');setError('');
    try{
      await createPlatformBackup(store.id,label.trim());
      setLabel('');await refresh();setMsg('تم إنشاء النسخة الاحتياطية.');onDone?.('تم إنشاء نسخة احتياطية للمتجر.');
    }catch(e:any){setError(e?.message||'تعذر إنشاء النسخة الاحتياطية.')}finally{setBusy(false)}
  };

  const restore=async(backup:PlatformBackup)=>{
    if(!confirm(`استرجاع نسخة ${when(backup.created_at)}؟ سيتم إنشاء نسخة تلقائية من الوضع الحالي أولًا، ثم استبدال بيانات المتجر التشغيلية.`))return;
    setBusy(true);setMsg('');setError('');
    try{
      await restorePlatformBackup(backup.id);
      await refresh();setMsg('تم استرجاع النسخة بنجاح.');onDone?.('تم استرجاع النسخة الاحتياطية.');
    }catch(e:any){setError(e?.message||'تعذر استرجاع النسخة.')}finally{setBusy(false)}
  };

  const startDelete=(backup:PlatformBackup)=>{
    setMsg('');setError('');setPassword('');setDeletingBackup(backup);
  };
  const cancelDelete=()=>{
    setPassword('');setDeletingBackup(null);setError('');
  };
  const confirmDelete=async(e:FormEvent)=>{
    e.preventDefault();
    if(!deletingBackup||!password.trim())return;
    const target=deletingBackup;
    setBusy(true);setMsg('');setError('');
    try{
      await deletePlatformBackup(target.id,password);
      setPassword('');
      setDeletingBackup(null);
      setMsg('تم حذف النسخة الاحتياطية المحددة بنجاح.');
      onDone?.('تم حذف النسخة الاحتياطية المحددة فقط.');
      await refresh();
    }catch(e:any){
      setPassword('');
      setError(e?.message||'تعذر حذف النسخة الاحتياطية. لم يتم تأكيد نجاح الحذف.');
    }finally{setBusy(false)}
  };

  return <div className="modal-backdrop"><div className="modal-card large platform-backup-modal" role="dialog" aria-modal="true" aria-labelledby="backup-manager-heading">
    <div className="modal-head"><div><h2 id="backup-manager-heading">النسخ الاحتياطية — {store.name}</h2><p className="muted">تقدر تنشئ نسخة، تسترجعها، أو تحذف نسخة محددة بعد إدخال كلمة مرور حساب إدارة المنصة.</p></div><button type="button" disabled={busy} onClick={onClose} aria-label="إغلاق">✕</button></div>
    <div className="platform-backup-create"><input value={label} maxLength={180} onChange={e=>setLabel(e.target.value)} placeholder="اسم اختياري للنسخة" aria-label="اسم النسخة الاختياري"/><button className="btn" disabled={busy||!!deletingBackup} onClick={()=>void createBackup()}>{busy?'جاري التنفيذ...':'+ إنشاء نسخة الآن'}</button></div>
    {msg&&<p className="success-text" role="status">{msg}</p>}
    {error&&<p className="error-text" role="alert">{error}</p>}
    <div className="platform-backup-list">
      {!backups.length&&<div className="empty-state">لا توجد نسخ احتياطية بعد.</div>}
      {backups.map(b=><div key={b.id} className="platform-backup-row">
        <div><b>{backupLabel(b)}</b><span>{when(b.created_at)} · {bytes(b.size_bytes)}</span></div>
        <div className="platform-backup-row-actions">
          <button className="btn secondary" type="button" disabled={busy||!!deletingBackup} onClick={()=>void restore(b)}>استرجاع</button>
          <button className="btn platform-backup-delete-btn" type="button" disabled={busy||!!deletingBackup} onClick={()=>startDelete(b)} aria-label={`حذف النسخة ${backupLabel(b)}`}>حذف</button>
        </div>
      </div>)}
    </div>
    {deletingBackup&&<form className="platform-backup-delete-confirm" onSubmit={e=>void confirmDelete(e)}>
      <div className="platform-backup-delete-heading">
        <h3>تأكيد حذف نسخة احتياطية</h3>
        <p>هتحذف نسخة <strong>{backupLabel(deletingBackup)}</strong> بتاريخ <strong>{when(deletingBackup.created_at)}</strong> نهائيًا.</p>
        <p>الحذف لن يمس بيانات المتجر الحالية أو أي نسخ أخرى، لكن النسخة المحذوفة لن ينفع تسترجعها.</p>
      </div>
      <label htmlFor="backup-delete-owner-password">كلمة مرور حسابك في إدارة المنصة</label>
      <input id="backup-delete-owner-password" autoFocus type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="اكتب كلمة المرور للتأكيد" maxLength={512} required/>
      <div className="platform-backup-delete-actions">
        <button className="btn secondary" type="button" disabled={busy} onClick={cancelDelete}>إلغاء</button>
        <button className="btn platform-backup-delete-btn" type="submit" disabled={busy||!password.trim()}>{busy?'جاري التحقق من كلمة المرور...':'تأكيد حذف النسخة'}</button>
      </div>
    </form>}
    <div className="modal-actions"><button className="btn secondary" type="button" disabled={busy} onClick={onClose}>إغلاق</button></div>
  </div></div>;
}
