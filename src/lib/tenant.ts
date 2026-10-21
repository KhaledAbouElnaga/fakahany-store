import { requestedStoreSlug, scopedStoreHref } from './storeLinks';
import { supabase, supabaseConfigured } from './supabase';
import type { TenantInfo } from '../types';

let currentTenant:TenantInfo|null=null;
let currentTenantKey='';
let pending:Promise<TenantInfo>|null=null;
let pendingKey='';

function requestedSlug(){
  return typeof window==='undefined'?'':requestedStoreSlug(window.location);
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
    if(slug && tenant.slug.toLowerCase()!==slug)throw new Error('لم يتم العثور على المتجر المطلوب.');
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
  return typeof window==='undefined'?path:scopedStoreHref(path,window.location);
}
