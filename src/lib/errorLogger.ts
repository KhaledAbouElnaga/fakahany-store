import { supabase, supabaseConfigured } from './supabase';
import { requireTenantId } from './tenant';

let lastMessage='';
let lastAt=0;

export async function logClientError(error:unknown,source='frontend'){
  if(!supabaseConfigured||!supabase)return;
  const message=error instanceof Error?error.message:String(error||'Unknown error');
  const safe=message.replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g,'[email]').replace(/\+?\d[\d\s-]{7,}/g,'[phone]');
  const now=Date.now();
  if(safe===lastMessage&&now-lastAt<10000)return;
  lastMessage=safe;lastAt=now;
  try{const storeId=await requireTenantId();await supabase.rpc('log_client_error',{store_id_input:storeId,message_input:safe,path_input:location.pathname,source_input:source})}catch{}
}
