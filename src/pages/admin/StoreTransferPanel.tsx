import { useState } from 'react';
import { saveCategory, saveDeliveryArea, saveProduct, saveSettings, saveUnit } from '../../lib/storeApi';
import { downloadText } from '../../lib/utils';
import type { StoreSnapshot } from '../../types';

export default function StoreTransferPanel({data,refresh}:{data:StoreSnapshot,refresh:()=>Promise<void>}){
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');

  const exportTemplate=()=>{
    const payload={format:'fakahany-store-template',version:1,exported_at:new Date().toISOString(),settings:{...data.settings,setup_completed:true,public_site_url:''},categories:data.categories,units:data.units,deliveryAreas:data.deliveryAreas,products:data.products};
    downloadText(`store-template-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(payload,null,2),'application/json;charset=utf-8');
  };

  const importTemplate=async(file?:File)=>{
    if(!file)return;
    setBusy(true);setMsg('');
    try{
      const x=JSON.parse(await file.text());
      if(x?.format!=='fakahany-store-template'||x?.version!==1)throw new Error('ملف القالب غير صحيح.');
      if(!x.settings||!Array.isArray(x.categories)||!Array.isArray(x.units)||!Array.isArray(x.deliveryAreas)||!Array.isArray(x.products))throw new Error('بيانات القالب ناقصة.');
      await saveSettings({...x.settings,id:'main',setup_completed:true});
      for(const item of x.categories)await saveCategory(item);
      for(const item of x.units)await saveUnit(item);
      for(const item of x.deliveryAreas)await saveDeliveryArea(item);
      for(const item of x.products)await saveProduct(item);
      await refresh();setMsg('تم استيراد قالب المتجر ودمجه بنجاح.');
    }catch(e:any){setMsg(e?.message||'تعذر استيراد القالب.')}finally{setBusy(false)}
  };

  return <section className="panel"><h3>تصدير / استنساخ المتجر</h3><p className="muted">صدر الإعدادات والأقسام والمنتجات في ملف واحد، ثم استورده في نسخة أخرى من النظام. الاستيراد يدمج البيانات ولا يحذف بيانات موجودة تلقائيًا.</p><div className="page-actions"><button className="btn secondary" onClick={exportTemplate}>تصدير قالب المتجر</button><label className="file-btn">استيراد قالب<input type="file" accept=".json,application/json" disabled={busy} onChange={e=>void importTemplate(e.target.files?.[0])}/></label></div><small className="muted block">ملاحظة: روابط الصور تنتقل كما هي. عند استنساخ المتجر لمشروع Supabase مستقل يفضل إعادة رفع الصور من المشروع الجديد.</small>{msg&&<p className={msg.startsWith('تم')?'success-text':'error-text'}>{msg}</p>}</section>;
}
