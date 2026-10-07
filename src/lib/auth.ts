import { supabase, supabaseConfigured } from './supabase';
import type { StaffProfile, StaffRole } from '../types';

const DEMO_KEY = 'fakahany-demo-admin';

export function validateStrongPassword(password:string){
  if(password.length<12)throw new Error('كلمة المرور يجب أن تكون 12 حرفًا على الأقل.');
  if(!/[a-z]/.test(password)||!/[A-Z]/.test(password)||!/[0-9]/.test(password)||!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>/?`~]/.test(password)){
    throw new Error('كلمة المرور يجب أن تحتوي على حرف كبير وحرف صغير ورقم ورمز.');
  }
}

export async function adminExists(): Promise<boolean> {
  if (!supabaseConfigured || !supabase) return true;
  const { data, error } = await supabase.rpc('admin_exists');
  if (error) throw error;
  return Boolean(data);
}

export async function isAdmin(): Promise<boolean> {
  if (!supabaseConfigured || !supabase) return sessionStorage.getItem(DEMO_KEY) === '1';
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return false;
  const staff=await supabase.rpc('is_staff');
  if(!staff.error)return Boolean(staff.data);
  const legacy=await supabase.rpc('is_admin');
  return !legacy.error&&Boolean(legacy.data);
}

export async function signInAdmin(email: string, password: string) {
  if (!supabaseConfigured || !supabase) { sessionStorage.setItem(DEMO_KEY, '1'); return; }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;

  let ok=await isAdmin();
  if(!ok){
    const raw=localStorage.getItem('fakahany-pending-staff-invite');
    if(raw){
      try{
        const pending=JSON.parse(raw);
        const claim=await supabase.rpc('claim_staff_invite',{code_input:pending.code,display_name_input:pending.name||''});
        if(!claim.error){localStorage.removeItem('fakahany-pending-staff-invite');ok=await isAdmin();}
      }catch{}
    }
  }

  if (!ok) { await supabase.auth.signOut(); throw new Error('هذا الحساب ليس لديه صلاحية دخول للوحة الإدارة.'); }
  try{await supabase.rpc('record_staff_login');}catch{}
}

export async function signOutAdmin() {
  if (!supabaseConfigured || !supabase) { sessionStorage.removeItem(DEMO_KEY); return; }
  await supabase.auth.signOut();
}

export async function signOutOtherSessions() {
  if (!supabaseConfigured || !supabase) return;
  const {error}=await supabase.auth.signOut({scope:'others'});
  if(error)throw error;
}

export async function createFirstAdmin(email: string, password: string) {
  validateStrongPassword(password);
  if (!supabaseConfigured || !supabase) { sessionStorage.setItem(DEMO_KEY, '1'); return; }
  const exists = await adminExists();
  if (exists) throw new Error('تم إنشاء المدير الأول بالفعل.');
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  if (!data.session) throw new Error('تم إنشاء الحساب. افتح رسالة التأكيد في بريدك ثم ارجع وسجل الدخول، وبعدها اضغط خيار تفعيل المدير الأول.');
  const { error: claimError } = await supabase.rpc('claim_first_admin');
  if (claimError) throw claimError;
}

export async function claimFirstAdminAfterLogin() {
  if (!supabaseConfigured || !supabase) return;
  const { error } = await supabase.rpc('claim_first_admin');
  if (error) throw error;
}

export async function changeAdminPassword(currentPassword:string,newPassword:string) {
  validateStrongPassword(newPassword);
  if (!supabaseConfigured || !supabase) return;
  const {data:userData}=await supabase.auth.getUser();
  const email=userData.user?.email||'';
  if(!email)throw new Error('تعذر التحقق من حساب المدير.');
  const verify=await supabase.auth.signInWithPassword({email,password:currentPassword});
  if(verify.error)throw new Error('كلمة المرور الحالية غير صحيحة.');
  const { error } = await supabase.auth.updateUser({ password:newPassword });
  if (error) throw error;
}

export async function currentAdminEmail() {
  if (!supabaseConfigured || !supabase) return 'وضع تجريبي';
  const { data } = await supabase.auth.getUser();
  return data.user?.email || '';
}


export async function currentStaffProfile():Promise<StaffProfile|null>{
  if(!supabaseConfigured||!supabase){
    return {user_id:'demo',email:'وضع تجريبي',display_name:'المدير',job_title:'مالك',role:'owner',active:true,permissions:['*'],created_at:'',updated_at:''};
  }
  const {data,error}=await supabase.rpc('current_staff_profile');
  if(!error&&data)return data as StaffProfile;
  const {data:user}=await supabase.auth.getUser();
  const legacy=await supabase.rpc('is_admin');
  if(!legacy.error&&legacy.data&&user.user){
    return {user_id:user.user.id,email:user.user.email||'',display_name:'المالك',job_title:'مالك',role:'owner',active:true,permissions:['*'],created_at:'',updated_at:''};
  }
  return null;
}

export function hasStaffPermission(profile:StaffProfile|null,permission:string){
  if(!profile||!profile.active)return false;
  return profile.role==='owner'||profile.permissions.includes('*')||profile.permissions.includes(permission);
}

export async function joinStaffWithInvite(email:string,password:string,code:string,displayName:string){
  if(!supabaseConfigured||!supabase){sessionStorage.setItem(DEMO_KEY,'1');return;}
  if(!code.trim())throw new Error('اكتب كود الدعوة.');
  localStorage.setItem('fakahany-pending-staff-invite',JSON.stringify({code:code.trim(),name:displayName.trim()}));

  let session=(await supabase.auth.signInWithPassword({email,password})).data.session;
  if(!session){
    validateStrongPassword(password);
    const signed=await supabase.auth.signUp({email,password});
    if(signed.error)throw signed.error;
    session=signed.data.session;
  }

  if(!session)throw new Error('تم إنشاء الحساب. فعّل البريد الإلكتروني ثم ارجع وسجل الدخول بنفس البيانات لإكمال الدعوة.');

  const {error}=await supabase.rpc('claim_staff_invite',{code_input:code.trim(),display_name_input:displayName.trim()});
  if(error)throw error;
  localStorage.removeItem('fakahany-pending-staff-invite');
}

export async function loadStaffProfiles():Promise<StaffProfile[]>{
  if(!supabaseConfigured||!supabase)return [await currentStaffProfile()].filter(Boolean) as StaffProfile[];
  const {data,error}=await supabase.from('staff_profiles').select('*').order('created_at');
  if(error)throw error;
  return (data||[]) as StaffProfile[];
}

export async function createStaffInvite(email:string,jobTitle:string,permissions:string[]):Promise<{code:string;expires_at:string}>{
  if(!supabaseConfigured||!supabase)return {code:'DEMO-CODE',expires_at:new Date(Date.now()+7*86400000).toISOString()};
  const cleanTitle=jobTitle.trim();
  if(!cleanTitle)throw new Error('اكتب المسمى الوظيفي.');
  if(!permissions.length)throw new Error('اختر صلاحية واحدة على الأقل.');
  const {data,error}=await supabase.rpc('create_custom_staff_invite',{email_input:email,job_title_input:cleanTitle,permissions_input:permissions});
  if(error)throw error;
  return data as {code:string;expires_at:string};
}

export async function updateStaffMember(userId:string,jobTitle:string,permissions:string[],active:boolean):Promise<void>{
  if(!supabaseConfigured||!supabase)return;
  if(!jobTitle.trim())throw new Error('اكتب المسمى الوظيفي.');
  if(!permissions.length)throw new Error('اختر صلاحية واحدة على الأقل.');
  const {error}=await supabase.rpc('update_custom_staff_member',{user_id_input:userId,job_title_input:jobTitle.trim(),permissions_input:permissions,active_input:active});
  if(error)throw error;
}
