import { supabase, supabaseConfigured } from './supabase';
import type { PlatformStore } from '../types';

export async function isPlatformAdmin():Promise<boolean>{
  if(!supabaseConfigured||!supabase)return true;
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)return false;
  const {data,error}=await supabase.rpc('is_platform_admin');
  return !error&&Boolean(data);
}

export async function signInPlatform(email:string,password:string):Promise<void>{
  if(!supabaseConfigured||!supabase)return;
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error)throw error;
  if(!await isPlatformAdmin()){
    await supabase.auth.signOut();
    throw new Error('هذا الحساب ليس لديه صلاحية إدارة المنصة.');
  }
}

export async function signOutPlatform():Promise<void>{
  if(!supabaseConfigured||!supabase)return;
  await supabase.auth.signOut();
}

export async function listPlatformStores():Promise<PlatformStore[]>{
  if(!supabaseConfigured||!supabase)return [];
  const {data,error}=await supabase.rpc('platform_list_stores');
  if(error)throw error;
  return (Array.isArray(data)?data:[]) as PlatformStore[];
}

export async function createPlatformStore(input:{name:string;slug:string;ownerEmail:string;customDomain?:string}):Promise<{store_id:string;slug:string;invite_code:string;owner_email:string}>{
  if(!supabaseConfigured||!supabase)throw new Error('إنشاء المتاجر يحتاج Supabase.');
  const {data,error}=await supabase.rpc('platform_create_store',{
    name_input:input.name.trim(),
    slug_input:input.slug.trim().toLowerCase(),
    owner_email_input:input.ownerEmail.trim().toLowerCase(),
    custom_domain_input:(input.customDomain||'').trim().toLowerCase()
  });
  if(error)throw error;
  return data as {store_id:string;slug:string;invite_code:string;owner_email:string};
}

export async function setPlatformStoreStatus(storeId:string,status:'active'|'suspended'):Promise<void>{
  if(!supabaseConfigured||!supabase)return;
  const {error}=await supabase.rpc('platform_set_store_status',{store_id_input:storeId,status_input:status});
  if(error)throw error;
}

export async function setPlatformStoreDomain(storeId:string,domain:string):Promise<void>{
  if(!supabaseConfigured||!supabase)return;
  const {error}=await supabase.rpc('platform_set_store_domain',{store_id_input:storeId,domain_input:domain.trim().toLowerCase()});
  if(error)throw error;
}
