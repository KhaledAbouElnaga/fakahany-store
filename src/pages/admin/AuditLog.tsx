import { useEffect, useMemo, useState } from 'react';
import { loadAdminAuditLogs } from '../../lib/storeApi';
import type { AdminAuditLog } from '../../types';

const ACTIONS:Record<string,string>={insert:'إضافة',update:'تعديل',delete:'حذف'};
const ENTITIES:Record<string,string>={products:'منتج',categories:'قسم',selling_units:'وحدة بيع',delivery_areas:'منطقة توصيل',shop_settings:'إعدادات المتجر',staff_profiles:'حساب موظف',order_statuses:'حالة طلب'};

export default function AuditLog(){
  const [logs,setLogs]=useState<AdminAuditLog[]|null>(null);
  const [q,setQ]=useState('');
  const [error,setError]=useState('');
  const load=()=>loadAdminAuditLogs().then(setLogs).catch(e=>setError(e?.message||'تعذر تحميل سجل النشاط.'));
  useEffect(()=>{void load()},[]);
  const filtered=useMemo(()=>logs?.filter(x=>!q||(`${x.label} ${x.actor_email} ${x.entity_type}`).toLowerCase().includes(q.toLowerCase()))||[],[logs,q]);
  return <><div className="page-title"><h1>سجل النشاط</h1><button className="btn secondary" onClick={()=>void load()}>تحديث</button></div><p className="muted">يسجل التغييرات الإدارية المهمة فقط، ويتم تنظيفه تلقائيًا حسب مدة الاحتفاظ المحددة.</p><input className="admin-search" placeholder="ابحث في السجل" value={q} onChange={e=>setQ(e.target.value)}/>{error&&<p className="error-text">{error}</p>}{logs===null?<div className="panel">جاري التحميل...</div>:<div className="table-wrap"><table className="mobile-card-table"><thead><tr><th>الوقت</th><th>المستخدم</th><th>العملية</th><th>العنصر</th><th>الاسم</th></tr></thead><tbody>{filtered.map(x=><tr key={x.id}><td data-label="الوقت">{new Date(x.created_at).toLocaleString('ar-EG')}</td><td data-label="المستخدم">{x.actor_email||'—'}</td><td data-label="العملية">{ACTIONS[x.action]||x.action}</td><td data-label="العنصر">{ENTITIES[x.entity_type]||x.entity_type}</td><td data-label="الاسم">{x.label||'—'}</td></tr>)}</tbody></table></div>}</>;
}
