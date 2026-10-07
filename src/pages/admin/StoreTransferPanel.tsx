import { useState } from 'react';
import { deleteCategory, deleteDeliveryArea, deleteProduct, deleteUnit, saveCategory, saveDeliveryArea, saveProduct, saveSettings, saveUnit } from '../../lib/storeApi';
import { downloadText, uid } from '../../lib/utils';
import type { StoreSnapshot } from '../../types';

type ImportPreview={raw:any;fileName:string;version:number;counts:{categories:number;units:number;areas:number;products:number}};

export default function StoreTransferPanel({data,refresh}:{data:StoreSnapshot,refresh:()=>Promise<void>}){
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');
  const [preview,setPreview]=useState<ImportPreview|null>(null);

  const exportTemplate=()=>{
    const payload={
      format:'fakahany-store-template',
      version:2,
      schema:'catalog-v2',
      exported_at:new Date().toISOString(),
      settings:{...data.settings,setup_completed:true,public_site_url:''},
      categories:data.categories,
      units:data.units,
      deliveryAreas:data.deliveryAreas,
      products:data.products
    };
    downloadText(`store-template-v2-${new Date().toISOString().slice(0,10)}.json`,JSON.stringify(payload,null,2),'application/json;charset=utf-8');
  };

  const selectFile=async(file?:File)=>{
    if(!file)return;
    setMsg('');
    try{
      const x=JSON.parse(await file.text());
      if(x?.format!=='fakahany-store-template'||![1,2].includes(Number(x?.version)))throw new Error('ملف القالب غير صحيح أو إصدار غير مدعوم.');
      if(!x.settings||!Array.isArray(x.categories)||!Array.isArray(x.units)||!Array.isArray(x.deliveryAreas)||!Array.isArray(x.products))throw new Error('بيانات القالب ناقصة.');
      setPreview({raw:x,fileName:file.name,version:Number(x.version),counts:{categories:x.categories.length,units:x.units.length,areas:x.deliveryAreas.length,products:x.products.length}});
    }catch(e:any){setPreview(null);setMsg(e?.message||'تعذر قراءة القالب.')}
  };

  const remap=(x:any)=>{
    const categoryMap=new Map<string,string>();
    const categories=x.categories.map((item:any)=>{const id=uid();categoryMap.set(String(item.id),id);return {...item,id}});
    const units=x.units.map((item:any)=>({...item,id:uid()}));
    const deliveryAreas=x.deliveryAreas.map((item:any)=>({...item,id:uid()}));
    const products=x.products.map((item:any)=>{
      const id=uid();
      return {
        ...item,
        id,
        category_id:item.category_id?categoryMap.get(String(item.category_id))||null:null,
        options:(Array.isArray(item.options)?item.options:[]).map((o:any)=>({...o,id:uid(),product_id:id}))
      };
    });
    return {categories,units,deliveryAreas,products};
  };

  const applyImport=async(mode:'merge'|'replace')=>{
    if(!preview)return;
    if(mode==='replace'&&!confirm('استبدال الكتالوج الحالي؟ سيتم حذف المنتجات والأقسام والوحدات ومناطق التوصيل الحالية، لكن الطلبات القديمة لن تُحذف.'))return;
    setBusy(true);setMsg('');
    try{
      const x=preview.raw;
      if(mode==='replace'){
        for(const p of data.products)await deleteProduct(p.id);
        for(const a of data.deliveryAreas)await deleteDeliveryArea(a.id);
        for(const c of data.categories)await deleteCategory(c.id);
        for(const u of data.units)await deleteUnit(u.id);
      }
      const mapped=remap(x);
      const importedSettings={...data.settings,...x.settings,id:'main',setup_completed:true,public_site_url:data.settings.public_site_url};
      await saveSettings(importedSettings);
      for(const item of mapped.categories)await saveCategory(item);
      for(const item of mapped.units)await saveUnit(item);
      for(const item of mapped.deliveryAreas)await saveDeliveryArea(item);
      for(const item of mapped.products)await saveProduct(item);
      await refresh();
      setPreview(null);
      setMsg(mode==='replace'?'تم استبدال الكتالوج بالقالب المستورد.':'تم دمج القالب بدون تعارض في IDs.');
    }catch(e:any){setMsg(e?.message||'تعذر استيراد القالب.')}finally{setBusy(false)}
  };

  return <section className="panel"><h3>تصدير / استنساخ المتجر</h3><p className="muted">الإصدار الحالي للقالب: <b>v2</b>. يدعم استيراد ملفات v1 القديمة أيضًا، ويعيد Mapping للـIDs لتجنب التعارضات.</p>
    <div className="page-actions"><button className="btn secondary" onClick={exportTemplate}>تصدير قالب v2</button><label className="file-btn">اختيار قالب للاستيراد<input type="file" accept=".json,application/json" disabled={busy} onChange={e=>void selectFile(e.target.files?.[0])}/></label></div>
    {preview&&<div className="import-preview"><div><b>{preview.fileName}</b><small>إصدار {preview.version}</small></div><div className="import-counts"><span>{preview.counts.products} منتج</span><span>{preview.counts.categories} قسم</span><span>{preview.counts.units} وحدة</span><span>{preview.counts.areas} منطقة</span></div><p>اختر طريقة الاستيراد بعد مراجعة الأعداد. الدمج يحافظ على الموجود، والاستبدال يمسح الكتالوج الحالي فقط قبل الاستيراد.</p><div className="page-actions"><button className="btn secondary" disabled={busy} onClick={()=>setPreview(null)}>إلغاء</button><button className="btn secondary" disabled={busy} onClick={()=>void applyImport('merge')}>دمج</button><button className="btn danger-action" disabled={busy} onClick={()=>void applyImport('replace')}>استبدال الكتالوج</button></div></div>}
    <small className="muted block">روابط الصور تنتقل كما هي. عند الاستنساخ إلى Supabase مستقل يفضّل إعادة رفع الصور داخل المشروع الجديد.</small>
    {msg&&<p className={msg.startsWith('تم')?'success-text':'error-text'}>{msg}</p>}
  </section>;
}
