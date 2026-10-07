import { supabase, supabaseConfigured } from './supabase';
import type { TenantInfo } from '../types';

let currentTenant:TenantInfo|null=null;
let pending:Promise<TenantInfo>|null=null;

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

export async function resolveTenant(force=false):Promise<TenantInfo>{
  if(currentTenant&&!force)return currentTenant;
  if(pending&&!force)return pending;

  pending=(async()=>{
    if(!supabaseConfigured||!supabase){
      currentTenant={id:'demo-store',slug:'demo',name:'المتجر التجريبي',custom_domain:null,status:'active',plan:'demo'};
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
    return tenant;
  })();

  try{return await pending}
  finally{pending=null}
}

export async function requireTenantId(){
  return (await resolveTenant()).id;
}

export function getResolvedTenant(){
  return currentTenant;
}

export function clearResolvedTenant(){
  currentTenant=null;
  pending=null;
}
