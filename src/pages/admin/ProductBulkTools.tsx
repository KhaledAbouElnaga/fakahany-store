import { useMemo, useState } from 'react';
import type { Category, Product } from '../../types';
import { bulkUpdateProductFields, newProduct, saveProduct } from '../../lib/storeApi';
import { uid } from '../../lib/utils';

type Props={products:Product[];categories:Category[];onDone:()=>Promise<void>};

function parseCsv(text:string){
  const rows:string[][]=[]; let row:string[]=[]; let cell=''; let quoted=false;
  for(let i=0;i<text.length;i++){
    const ch=text[i];
    if(ch==='"'){
      if(quoted&&text[i+1]==='"'){cell+='"';i++} else quoted=!quoted;
    }else if(ch===','&&!quoted){row.push(cell.trim());cell=''}
    else if((ch==='\n'||ch==='\r')&&!quoted){
      if(ch==='\r'&&text[i+1]==='\n')i++;
      row.push(cell.trim());cell='';
      if(row.some(Boolean))rows.push(row);row=[];
    }else cell+=ch;
  }
  row.push(cell.trim()); if(row.some(Boolean))rows.push(row);
  return rows;
}

async function readTable(file:File):Promise<string[][]>{
  if(file.name.toLowerCase().endsWith('.csv')) return parseCsv(await file.text());
  const w=window as any;
  if(!w.XLSX){
    await new Promise<void>((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js';
      s.onload=()=>resolve(); s.onerror=()=>reject(new Error('تعذر تحميل قارئ ملفات إكسل.'));
      document.head.appendChild(s);
    });
  }
  const buf=await file.arrayBuffer();
  const wb=w.XLSX.read(buf,{type:'array'});
  const sheet=wb.Sheets[wb.SheetNames[0]];
  return w.XLSX.utils.sheet_to_json(sheet,{header:1,defval:''}) as string[][];
}

const truthy=(v:string)=>['1','true','yes','نعم','متاح'].includes(String(v).trim().toLowerCase());

export default function ProductBulkTools({products,categories,onDone}:Props){
  const [selected,setSelected]=useState<string[]>([]);
  const [percent,setPercent]=useState(10);
  const [targetCategory,setTargetCategory]=useState('');
  const [busy,setBusy]=useState(false);
  const [msg,setMsg]=useState('');
  const allSelected=selected.length===products.length&&products.length>0;
  const sorted=useMemo(()=>[...products].sort((a,b)=>a.name_ar.localeCompare(b.name_ar,'ar')),[products]);

  const applyBulk=async(fields:Parameters<typeof bulkUpdateProductFields>[1],success:string)=>{
    if(!selected.length)return setMsg('اختر منتجًا واحدًا على الأقل.');
    setBusy(true);setMsg('');
    try{await bulkUpdateProductFields(selected,fields);await onDone();setMsg(success);}
    catch(e:any){setMsg(e?.message||'تعذر تنفيذ التعديل الجماعي.')}finally{setBusy(false)}
  };

  const applyPercent=async(sign:1|-1)=>{
    if(!selected.length)return setMsg('اختر منتجًا واحدًا على الأقل.');
    if(percent<=0||percent>100)return setMsg('اكتب نسبة بين 1 و100.');
    setBusy(true);setMsg('');
    try{
      for(const p of products.filter(x=>selected.includes(x.id))){
        const factor=1+(sign*percent/100);
        const next={...structuredClone(p),options:p.options.map(o=>({...o,price:Math.max(0,Math.round(Number(o.price)*factor*100)/100)}))};
        await saveProduct(next);
      }
      await onDone(); setMsg('تم تعديل الأسعار بنجاح.');
    }catch(e:any){setMsg(e?.message||'تعذر تعديل الأسعار.')}finally{setBusy(false)}
  };

  const importFile=async(file?:File)=>{
    if(!file)return;
    setBusy(true);setMsg('');
    try{
      const rows=await readTable(file);
      if(rows.length<2)throw new Error('الملف لا يحتوي على بيانات.');
      const headers=rows[0].map(x=>String(x).trim().toLowerCase());
      const index=(...names:string[])=>headers.findIndex(h=>names.includes(h));
      const nameI=index('اسم المنتج','name','name_ar','المنتج');
      const descI=index('الوصف','description','description_ar');
      const catI=index('القسم','category');
      const optionI=index('الخيار','الوحدة','option','unit');
      const priceI=index('السعر','price');
      const oldI=index('السعر القديم','old_price');
      const availableI=index('متاح','available');
      const stockI=index('المخزون','stock','stock_qty');
      if(nameI<0||priceI<0)throw new Error('يجب أن يحتوي الملف على عمود «اسم المنتج» وعمود «السعر».');

      const grouped=new Map<string,string[][]>();
      for(const r of rows.slice(1)){
        const name=String(r[nameI]||'').trim(); if(!name)continue;
        grouped.set(name,[...(grouped.get(name)||[]),r]);
      }

      for(const [name,group] of grouped){
        const existing=products.find(p=>p.name_ar.trim()===name);
        const first=group[0];
        const p=existing?structuredClone(existing):newProduct(products.length+1);
        p.name_ar=name;
        if(descI>=0&&first[descI]!==undefined)p.description_ar=String(first[descI]||'');
        if(catI>=0){
          const catName=String(first[catI]||'').trim();
          p.category_id=categories.find(c=>c.name_ar.trim()===catName)?.id||p.category_id;
        }
        if(availableI>=0)p.available=truthy(String(first[availableI]||''));
        const options=group.map((r,i)=>{
          const optionName=optionI>=0?String(r[optionI]||'كيلو').trim()||'كيلو':'كيلو';
          const price=Number(String(r[priceI]||'0').replace(',','.'))||0;
          const old=oldI>=0&&String(r[oldI]||'').trim()!==''?Number(String(r[oldI]).replace(',','.')):null;
          const stock=stockI>=0&&String(r[stockI]||'').trim()!==''?Number(r[stockI]):null;
          const oldOption=existing?.options.find(o=>o.name_ar===optionName);
          return {id:oldOption?.id||uid(),product_id:p.id,name_ar:optionName,price,old_price:Number.isFinite(old as number)?old:null,available:true,track_stock:stock!==null,stock_qty:stock,display_order:i+1};
        });
        p.options=options;
        await saveProduct(p);
      }
      await onDone(); setMsg(`تم استيراد ${grouped.size} منتج بنجاح.`);
    }catch(e:any){setMsg(e?.message||'تعذر استيراد الملف.')}finally{setBusy(false)}
  };

  return <div className="panel bulk-tools">
    <h3>تعديل جماعي واستيراد المنتجات</h3>
    <div className="bulk-price-row">
      <label>نسبة التعديل<input type="number" min="1" max="100" value={percent} onChange={e=>setPercent(Number(e.target.value))}/></label>
      <button className="btn secondary" disabled={busy} onClick={()=>void applyPercent(1)}>زيادة الأسعار</button>
      <button className="btn secondary" disabled={busy} onClick={()=>void applyPercent(-1)}>خفض الأسعار</button>
      <label className="file-btn">استيراد من ملف إكسل أو جدول<input type="file" accept=".csv,.xlsx,.xls" onChange={e=>void importFile(e.target.files?.[0])}/></label>
    </div>
    <div className="bulk-action-grid">
      <button className="btn secondary" disabled={busy||!selected.length} onClick={()=>void applyBulk({available:true},'تم جعل المنتجات المحددة متاحة.')}>متاح</button>
      <button className="btn secondary" disabled={busy||!selected.length} onClick={()=>void applyBulk({available:false},'تم إيقاف المنتجات المحددة.')}>غير متاح</button>
      <button className="btn secondary" disabled={busy||!selected.length} onClick={()=>void applyBulk({hidden:false},'تم إظهار المنتجات المحددة.')}>إظهار</button>
      <button className="btn secondary" disabled={busy||!selected.length} onClick={()=>void applyBulk({hidden:true},'تم إخفاء المنتجات المحددة.')}>إخفاء</button>
      <button className="btn secondary" disabled={busy||!selected.length} onClick={()=>void applyBulk({featured:true},'تم تمييز المنتجات المحددة.')}>مميزة</button>
      <button className="btn secondary" disabled={busy||!selected.length} onClick={()=>void applyBulk({featured:false},'تم إلغاء تمييز المنتجات المحددة.')}>إلغاء التمييز</button>
      <div className="bulk-category-action"><select value={targetCategory} onChange={e=>setTargetCategory(e.target.value)}><option value="">اختر قسمًا</option><option value="__none__">بدون قسم</option>{categories.map(cat=><option key={cat.id} value={cat.id}>{cat.name_ar}</option>)}</select><button className="btn secondary" disabled={busy||!selected.length||!targetCategory} onClick={()=>void applyBulk({category_id:targetCategory==='__none__'?null:targetCategory},'تم تغيير قسم المنتجات المحددة.')}>نقل للقسم</button></div>
    </div>
    <p className="muted">الاستيراد يدعم ملفات إكسل وملفات الجدول. الأعمدة الأساسية: اسم المنتج، السعر. ويمكن إضافة القسم، الوصف، الخيار، السعر القديم، المخزون.</p>
    <p className="muted bulk-selected-count">المحدد حاليًا: <b>{selected.length}</b> منتج</p><label className="select-all"><input type="checkbox" checked={allSelected} onChange={e=>setSelected(e.target.checked?products.map(p=>p.id):[])}/> تحديد كل المنتجات</label>
    <div className="bulk-product-list">{sorted.map(p=><label key={p.id}><input type="checkbox" checked={selected.includes(p.id)} onChange={e=>setSelected(v=>e.target.checked?[...v,p.id]:v.filter(id=>id!==p.id))}/>{p.name_ar}</label>)}</div>
    {msg&&<p className={msg.includes('بنجاح')?'success-text':'info-text'}>{msg}</p>}
  </div>;
}
