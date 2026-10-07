import { supabase, supabaseConfigured } from './supabase';
import type { StorePlanStatus } from '../types';

export async function getCurrentStorePlanStatus():Promise<StorePlanStatus|null>{
  if(!supabaseConfigured||!supabase)return null;
  const {data,error}=await supabase.rpc('current_store_plan_status');
  if(error)throw error;
  return data as StorePlanStatus;
}
