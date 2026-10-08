import { supabase, supabaseConfigured } from './supabase';
import { validateStrongPassword } from './passwordPolicy';

export type PendingSignup={name:string;slug:string};

const PENDING_KEY='fakahany-self-signup';

export function savePendingSignup(value:PendingSignup){
  localStorage.setItem(PENDING_KEY,JSON.stringify(value));
}
export function loadPendingSignup():PendingSignup|null{
  try{
    const raw=localStorage.getItem(PENDING_KEY);
    if(!raw)return null;
    const x=JSON.parse(raw);
    if(!x?.name||!x?.slug)return null;
    return {name:String(x.name),slug:String(x.slug)};
  }catch{return null}
}
export function clearPendingSignup(){
  localStorage.removeItem(PENDING_KEY);
}

export async function signUpStoreOwner(email:string,password:string,pending:PendingSignup){
  validateStrongPassword(password);
  if(!supabaseConfigured||!supabase)throw new Error('التسجيل يحتاج اتصال Supabase.');
  savePendingSignup(pending);
  const {data,error}=await supabase.auth.signUp({
    email:email.trim().toLowerCase(),
    password,
    options:{emailRedirectTo:location.origin+'/signup?complete=1'}
  });
  if(error)throw error;
  return data;
}

export async function finalizeSelfServiceStore(pending:PendingSignup):Promise<{store_id:string;slug:string;name:string}>{
  if(!supabaseConfigured||!supabase)throw new Error('إنشاء المتجر يحتاج اتصال Supabase.');
  const {data,error}=await supabase.rpc('self_service_create_store',{
    name_input:pending.name.trim(),
    slug_input:pending.slug.trim().toLowerCase()
  });
  if(error)throw error;
  clearPendingSignup();
  return data as {store_id:string;slug:string;name:string};
}
