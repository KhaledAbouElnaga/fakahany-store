import { useEffect, useState } from 'react';
import { createPlatformBackup, listPlatformBackups, restorePlatformBackup } from '../lib/platformApi';
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

export default function PlatformBackupManager({store,onClose,onDone}:{store:PlatformStore;onClose:()=>void;onDone?:(message:string)=>void}){
  const [backups,setBackups]=useState<PlatformBackup[]>([]);
  const [label,setLabel]=useState('');
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');

  const refresh=async()=>{
    try{setBackups(await listPlatformBackups(store.id))}
    catch(e:any){setMsg(e?.message||'تعذر تحميل النسخ الاحتياطية.')}
  };
  useEffect(()=>{void refresh()},[store.id]);

  const createBackup=async()=>{
    setBusy(true);setMsg('');
    try{
      await createPlatformBackup(store.id,label.trim());
      setLabel('');await refresh();setMsg('تم إنشاء النسخة الاحتياطية.');onDone?.('تم إنشاء نسخة احتياطية للمتجر.');
    }catch(e:any){setMsg(e?.message||'تعذر إنشاء النسخة الاحتياطية.')}finally{setBusy(false)}
  };

  const restore=async(backup:PlatformBackup)=>{
    if(!confirm(`استرجاع نسخة ${when(backup.created_at)}؟ سيتم إنشاء نسخة تلقائية من الوضع الحالي أولًا، ثم استبدال بيانات المتجر التشغيلية.`))return;
    setBusy(true);setMsg('');
    try{
      await restorePlatformBackup(backup.id);
      await refresh();setMsg('تم استرجاع النسخة بنجاح.');onDone?.('تم استرجاع النسخة الاحتياطية.');
    }catch(e:any){setMsg(e?.message||'تعذر استرجاع النسخة.')}finally{setBusy(false)}
  };

  return <div className="modal-backdrop"><div className="modal-card large platform-backup-modal">
    <div className="modal-head"><div><h2>النسخ الاحتياطية — {store.name}</h2><p className="muted">تشمل إعدادات المتجر والكتالوج والطلبات والمخزون، ولا تغيّر حسابات الدخول أو ملكية المتجر.</p></div><button onClick={onClose}>✕</button></div>
    <div className="platform-backup-create"><input value={label} maxLength={180} onChange={e=>setLabel(e.target.value)} placeholder="اسم اختياري للنسخة"/><button className="btn" disabled={busy} onClick={()=>void createBackup()}>{busy?'جاري التنفيذ...':'+ إنشاء نسخة الآن'}</button></div>
    {msg&&<p className={msg.includes('تم')?'success-text':'error-text'}>{msg}</p>}
    <div className="platform-backup-list">
      {!backups.length&&<div className="empty-state">لا توجد نسخ احتياطية بعد.</div>}
      {backups.map(b=><div key={b.id} className="platform-backup-row">
        <div><b>{b.label|| (b.kind==='manual'?'نسخة يدوية':b.kind==='scheduled'?'نسخة يومية تلقائية':b.kind==='pre_restore'?'قبل الاسترجاع':'قبل الحذف')}</b><span>{when(b.created_at)} · {bytes(b.size_bytes)}</span></div>
        <button className="btn secondary" disabled={busy} onClick={()=>void restore(b)}>استرجاع</button>
      </div>)}
    </div>
    <div className="modal-actions"><button className="btn secondary" onClick={onClose}>إغلاق</button></div>
  </div></div>;
}
