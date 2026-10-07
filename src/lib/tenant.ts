import { supabase, supabaseConfigured } from './supabase';
import type { TenantInfo } from '../types';

let currentTenant:TenantInfo|null=null;
let currentTenantKey='';
let pending:Promise<TenantInfo>|null=null;
let pendingKey='';

function requestedSlug(){
  if(typeof window==='undefined')return '';
  const params=new URLSearchParams(window.location.search);
  const explicit=(params.get('store')||'').trim().toLowerCase();
  if(explicit){
    sessionStorage.setItem('fakahany-preview-store',explicit);
    return explicit;
  }
  const host=window.location.hostname.toLowerCase();
  if(host==='localhost'||host==='127.0.0.1'||host.endsWith('.pages.dev')){
    return (sessionStorage.getItem('fakahany-preview-store')||'').trim().toLowerCase();
  }
  return '';
}

function tenantRequestKey(){
  if(typeof window==='undefined')return 'server';
  return window.location.host.toLowerCase()+'|'+requestedSlug();
}

export async function resolveTenant(force=false):Promise<TenantInfo>{
  const key=tenantRequestKey();
  if(currentTenant&&!force&&currentTenantKey===key)return currentTenant;
  if(pending&&!force&&pendingKey===key)return pending;

  pendingKey=key;
  pending=(async()=>{
    if(!supabaseConfigured||!supabase){
      currentTenant={id:'demo-store',slug:'demo',name:'المتجر التجريبي',custom_domain:null,status:'active',plan:'demo'};
      currentTenantKey=key;
      return currentTenant;
    }

    const host=typeof window==='undefined'?'':window.location.host;
    const slug=requestedSlug();
    const {data,error}=await supabase.rpc('resolve_store_context',{host_input:host,slug_input:slug});
    if(error)throw error;
    if(!data||typeof data!=='object'||!('id' in data))throw new Error('لم يتم العثور على المتجر المطلوب.');

    const tenant=data as TenantInfo;
    if(tenant.status==='suspended')throw new Error('هذا المتجر موقوف مؤقتًا.');
    currentTenant=tenant;
    currentTenantKey=key;
    return tenant;
  })();

  try{return await pending}
  finally{
    pending=null;
    pendingKey='';
  }
}

export async function requireTenantId(){
  return (await resolveTenant()).id;
}

export function getResolvedTenant(){
  return currentTenant;
}

export function clearResolvedTenant(options?:{forgetPreview?:boolean}){
  currentTenant=null;
  currentTenantKey='';
  pending=null;
  pendingKey='';
  if(options?.forgetPreview&&typeof window!=='undefined'){
    sessionStorage.removeItem('fakahany-preview-store');
  }
}

export function tenantHref(path:string){
  if(typeof window==='undefined')return path;
  const host=window.location.hostname.toLowerCase();
  const slug=(new URLSearchParams(window.location.search).get('store')||sessionStorage.getItem('fakahany-preview-store')||currentTenant?.slug||'').trim().toLowerCase();
  if(!slug||(!(host==='localhost'||host==='127.0.0.1'||host.endsWith('.pages.dev'))))return path;
  const separator=path.includes('?')?'&':'?';
  return path+separator+'store='+encodeURIComponent(slug);
}
