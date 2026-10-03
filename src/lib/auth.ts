import { supabase, supabaseConfigured } from './supabase';

const DEMO_KEY = 'fakahany-demo-admin';

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
  const { data, error } = await supabase.rpc('is_admin');
  if (error) return false;
  return Boolean(data);
}

export async function signInAdmin(email: string, password: string) {
  if (!supabaseConfigured || !supabase) { sessionStorage.setItem(DEMO_KEY, '1'); return; }
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  const ok = await isAdmin();
  if (!ok) { await supabase.auth.signOut(); throw new Error('هذا الحساب ليس لديه صلاحية مدير.'); }
}

export async function signOutAdmin() {
  if (!supabaseConfigured || !supabase) { sessionStorage.removeItem(DEMO_KEY); return; }
  await supabase.auth.signOut();
}

export async function createFirstAdmin(email: string, password: string) {
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

export async function changeAdminPassword(password: string) {
  if (password.length < 8) throw new Error('كلمة المرور الجديدة يجب أن تكون 8 أحرف على الأقل.');
  if (!supabaseConfigured || !supabase) return;
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw error;
}

export async function currentAdminEmail() {
  if (!supabaseConfigured || !supabase) return 'وضع تجريبي';
  const { data } = await supabase.auth.getUser();
  return data.user?.email || '';
}
