import { supabase, supabaseConfigured } from './supabase';
import type { PlatformAuditEntry, PlatformBackup, PlatformNotification, PlatformOverview, PlatformPlan, PlatformSettings, PlatformStore, PlatformSupportStatus, SupportTicket } from '../types';

const PLATFORM_UNLOCK_KEY='fakahany-platform-unlocked-until';
const PLATFORM_UNLOCK_MS=30*60*1000;

export function platformAccessUnlocked():boolean{
  const until=Number(sessionStorage.getItem(PLATFORM_UNLOCK_KEY)||0);
  if(!Number.isFinite(until)||until<=Date.now()){
    sessionStorage.removeItem(PLATFORM_UNLOCK_KEY);
    return false;
  }
  return true;
}
function unlockPlatformAccess(){
  sessionStorage.setItem(PLATFORM_UNLOCK_KEY,String(Date.now()+PLATFORM_UNLOCK_MS));
}
export function lockPlatformAccess(){
  sessionStorage.removeItem(PLATFORM_UNLOCK_KEY);
}

export async function isPlatformAdmin():Promise<boolean>{
  if(!supabaseConfigured||!supabase)return true;
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)return false;
  const {data,error}=await supabase.rpc('is_platform_admin');
  return !error&&Boolean(data);
}

export async function signInPlatform(email:string,password:string):Promise<void>{
  if(!supabaseConfigured||!supabase){unlockPlatformAccess();return;}
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error)throw error;
  if(!await isPlatformAdmin()){
    lockPlatformAccess();
    throw new Error('هذا الحساب ليس لديه صلاحية إدارة المنصة.');
  }
  unlockPlatformAccess();
}

export async function signOutPlatform():Promise<void>{
  lockPlatformAccess();
  if(!supabaseConfigured||!supabase)return;
  await endPlatformSupport().catch(()=>{});
  await supabase.auth.signOut();
}

export async function listPlatformStores():Promise<PlatformStore[]>{
  if(!supabaseConfigured||!supabase)return [];
  const {data,error}=await supabase.rpc('platform_list_stores');
  if(error)throw error;
  return (Array.isArray(data)?data:[]) as PlatformStore[];
}

export async function getPlatformOverview():Promise<PlatformOverview>{
  if(!supabaseConfigured||!supabase)return {total_stores:0,active_stores:0,suspended_stores:0,stores_active_7d:0,stores_inactive_30d:0,orders_30d:0,revenue_30d:0,products_total:0,staff_total:0,errors_24h:0,visits_30d:0,storage_bytes:0};
  const {data,error}=await supabase.rpc('platform_get_overview');
  if(error)throw error;
  return data as PlatformOverview;
}

export async function listPlatformPlans():Promise<PlatformPlan[]>{
  if(!supabaseConfigured||!supabase)return [];
  const {data,error}=await supabase.rpc('platform_list_plans');
  if(error)throw error;
  return (Array.isArray(data)?data:[]) as PlatformPlan[];
}

export async function getPlatformSettings():Promise<PlatformSettings>{
  if(!supabaseConfigured||!supabase)return {base_domain:'',default_trial_days:14,support_session_minutes:30};
  const {data,error}=await supabase.rpc('platform_get_settings');
  if(error)throw error;
  return data as PlatformSettings;
}

export async function savePlatformSettings(settings:PlatformSettings):Promise<void>{
  if(!supabaseConfigured||!supabase)return;
  const {error}=await supabase.rpc('platform_set_settings',{
    base_domain_input:settings.base_domain.trim().toLowerCase(),
    default_trial_days_input:settings.default_trial_days,
    support_session_minutes_input:settings.support_session_minutes
  });
  if(error)throw error;
}

export async function createPlatformStore(input:{name:string;slug:string;ownerEmail:string;plan:string}):Promise<{store_id:string;slug:string;invite_code:string;owner_email:string;plan:string}>{
  if(!supabaseConfigured||!supabase)throw new Error('إنشاء المتاجر يحتاج Supabase.');
  const {data,error}=await supabase.rpc('platform_create_store',{
    name_input:input.name.trim(),
    slug_input:input.slug.trim().toLowerCase(),
    owner_email_input:input.ownerEmail.trim().toLowerCase(),
    custom_domain_input:'',
    plan_input:input.plan
  });
  if(error)throw error;
  return data as {store_id:string;slug:string;invite_code:string;owner_email:string;plan:string};
}

export async function setPlatformStoreStatus(storeId:string,status:'active'|'suspended'):Promise<void>{
  if(!supabaseConfigured||!supabase)return;
  const {error}=await supabase.rpc('platform_set_store_status',{store_id_input:storeId,status_input:status});
  if(error)throw error;
}

export async function setPlatformStorePlan(storeId:string,plan:string):Promise<void>{
  if(!supabaseConfigured||!supabase)return;
  const {error}=await supabase.rpc('platform_set_store_plan',{store_id_input:storeId,plan_input:plan});
  if(error)throw error;
}

export async function setPlatformSubscription(storeId:string,status:'trial'|'active'|'past_due'|'paused',paidUntil:string|null,note=''):Promise<void>{
  if(!supabaseConfigured||!supabase)return;
  const {error}=await supabase.rpc('platform_set_subscription',{
    store_id_input:storeId,
    status_input:status,
    paid_until_input:paidUntil||null,
    note_input:note
  });
  if(error)throw error;
}

export async function startPlatformSupport(storeId:string):Promise<PlatformSupportStatus>{
  if(!supabaseConfigured||!supabase)return {active:true,store_id:storeId,expires_at:new Date(Date.now()+30*60000).toISOString()};
  const {data,error}=await supabase.rpc('platform_start_support',{store_id_input:storeId});
  if(error)throw error;
  return {active:true,...(data as any)} as PlatformSupportStatus;
}

export async function endPlatformSupport():Promise<void>{
  if(!supabaseConfigured||!supabase)return;
  const {error}=await supabase.rpc('platform_end_support');
  if(error)throw error;
}

export async function getPlatformSupportStatus():Promise<PlatformSupportStatus>{
  if(!supabaseConfigured||!supabase)return {active:false};
  const {data,error}=await supabase.rpc('platform_support_status');
  if(error)throw error;
  return (data||{active:false}) as PlatformSupportStatus;
}

export async function transferPlatformStoreOwner(storeId:string,email:string):Promise<{code:string;email:string;expires_at:string}>{
  if(!supabaseConfigured||!supabase)throw new Error('نقل الملكية يحتاج Supabase.');
  const {data,error}=await supabase.rpc('platform_transfer_owner',{store_id_input:storeId,email_input:email.trim().toLowerCase()});
  if(error)throw error;
  return data as {code:string;email:string;expires_at:string};
}

export async function exportPlatformStore(storeId:string):Promise<unknown>{
  if(!supabaseConfigured||!supabase)return {};
  const {data,error}=await supabase.rpc('platform_export_store',{store_id_input:storeId});
  if(error)throw error;
  return data;
}

export async function requestPlatformDeleteCode():Promise<{email:string}>{
  if(!supabaseConfigured||!supabase)throw new Error('إرسال كود التأكيد يحتاج Supabase.');
  const {data:{user}}=await supabase.auth.getUser();
  if(!user?.email)throw new Error('لا يوجد بريد إلكتروني لحساب إدارة المنصة.');
  const {error}=await supabase.auth.reauthenticate();
  if(error)throw error;
  return {email:user.email};
}

async function functionsErrorMessage(error:any):Promise<string>{
  let message=error?.message||'تعذر تنفيذ العملية.';
  try{
    const response=error?.context;
    if(response&&typeof response.clone==='function'){
      const payload=await response.clone().json();
      if(payload?.error)message=String(payload.error);
    }
  }catch{}
  return message;
}

export type PlatformDeleteResult={
  ok:boolean;
  deleted_files:number;
  accounts_deleted:number;
  accounts_protected:number;
  auth_cleanup_incomplete:boolean;
  auth_cleanup_errors:string[];
};

export async function deletePlatformStore(storeId:string,confirmSlug:string,confirmationCode:string):Promise<PlatformDeleteResult>{
  if(!supabaseConfigured||!supabase)return;
  const {data:{session}}=await supabase.auth.getSession();
  if(!session)throw new Error('انتهت جلسة تسجيل الدخول.');
  const {data,error}=await supabase.functions.invoke('platform-delete-store',{
    body:{store_id:storeId,confirm_slug:confirmSlug,confirmation_code:confirmationCode.trim()},
    headers:{Authorization:`Bearer ${session.access_token}`}
  });
  if(error)throw new Error(await functionsErrorMessage(error));
  if(data?.error)throw new Error(String(data.error));
  return data as PlatformDeleteResult;
}

export function platformStoreUrl(origin:string,store:Pick<PlatformStore,'slug'>,settings:PlatformSettings){
  const base=settings.base_domain.trim().replace(/^https?:\/\//i,'').replace(/\/$/,'');
  return base?`https://${store.slug}.${base}`:`${origin}/?store=${encodeURIComponent(store.slug)}`;
}

export function platformAdminUrl(origin:string,store:Pick<PlatformStore,'slug'>){
  return `${origin}/admin?store=${encodeURIComponent(store.slug)}`;
}


export async function createPlatformBackup(storeId:string,label=''):Promise<PlatformBackup>{
  if(!supabaseConfigured||!supabase)throw new Error('النسخ الاحتياطي يحتاج Supabase.');
  const {data,error}=await supabase.rpc('platform_create_backup',{store_id_input:storeId,label_input:label,kind_input:'manual'});
  if(error)throw error;
  return data as PlatformBackup;
}

export async function listPlatformBackups(storeId:string):Promise<PlatformBackup[]>{
  if(!supabaseConfigured||!supabase)return [];
  const {data,error}=await supabase.rpc('platform_list_backups',{store_id_input:storeId});
  if(error)throw error;
  return (Array.isArray(data)?data:[]) as PlatformBackup[];
}

export async function restorePlatformBackup(backupId:string):Promise<void>{
  if(!supabaseConfigured||!supabase)return;
  const {error}=await supabase.rpc('platform_restore_backup',{backup_id_input:backupId});
  if(error)throw error;
}

export async function listPlatformNotifications():Promise<PlatformNotification[]>{
  if(!supabaseConfigured||!supabase)return [];
  const {data,error}=await supabase.rpc('platform_list_notifications');
  if(error)throw error;
  return (Array.isArray(data)?data:[]) as PlatformNotification[];
}

export async function listPlatformAudit(limit=150):Promise<PlatformAuditEntry[]>{
  if(!supabaseConfigured||!supabase)return [];
  const {data,error}=await supabase.rpc('platform_list_audit',{limit_input:limit});
  if(error)throw error;
  return (Array.isArray(data)?data:[]) as PlatformAuditEntry[];
}

export async function listPlatformSupportTickets():Promise<SupportTicket[]>{
  if(!supabaseConfigured||!supabase)return [];
  const {data,error}=await supabase.rpc('platform_list_support_tickets');
  if(error)throw error;
  return (Array.isArray(data)?data:[]) as SupportTicket[];
}

export async function replyPlatformSupportTicket(ticketId:string,status:SupportTicket['status'],reply:string):Promise<void>{
  if(!supabaseConfigured||!supabase)return;
  const {error}=await supabase.rpc('platform_reply_support_ticket',{
    ticket_id_input:ticketId,
    status_input:status,
    reply_input:reply
  });
  if(error)throw error;
}
