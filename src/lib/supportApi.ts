import { supabase, supabaseConfigured } from './supabase';
import type { SupportTicket } from '../types';

export async function createSupportTicket(input:{subject:string;message:string;priority:'normal'|'high'}):Promise<string>{
  if(!supabaseConfigured||!supabase)throw new Error('طلبات الدعم تحتاج اتصال Supabase.');
  const {data,error}=await supabase.rpc('create_support_ticket',{
    subject_input:input.subject.trim(),
    message_input:input.message.trim(),
    priority_input:input.priority
  });
  if(error)throw error;
  return String(data||'');
}

export async function listStoreSupportTickets():Promise<SupportTicket[]>{
  if(!supabaseConfigured||!supabase)return [];
  const {data,error}=await supabase.rpc('list_store_support_tickets');
  if(error)throw error;
  return (Array.isArray(data)?data:[]) as SupportTicket[];
}
