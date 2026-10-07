import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,"Content-Type":"application/json"}});

async function listFiles(client:any,bucket:string,prefix:string):Promise<string[]>{
  const out:string[]=[];
  const {data,error}=await client.storage.from(bucket).list(prefix,{limit:1000,sortBy:{column:"name",order:"asc"}});
  if(error)throw error;
  for(const item of data||[]){
    const path=prefix?prefix+"/"+item.name:item.name;
    if(item.metadata)out.push(path);
    else out.push(...await listFiles(client,bucket,path));
  }
  return out;
}

Deno.serve(async req=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!anon||!service)return json({error:"Server configuration missing"},500);

  const auth=req.headers.get("Authorization")||"";
  if(!auth.startsWith("Bearer "))return json({error:"Unauthorized"},401);

  const userClient=createClient(url,anon,{global:{headers:{Authorization:auth}}});
  const adminClient=createClient(url,service);

  const {data:{user},error:userError}=await userClient.auth.getUser();
  if(userError||!user)return json({error:"Unauthorized"},401);

  const allowed=await userClient.rpc("is_platform_admin");
  if(allowed.error||allowed.data!==true)return json({error:"Platform owner authorization required"},403);

  let body:any={};
  try{body=await req.json()}catch{return json({error:"Invalid request body"},400)}
  const storeId=String(body.store_id||"");
  const confirmSlug=String(body.confirm_slug||"").trim().toLowerCase();
  const confirmationCode=String(body.confirmation_code||"").trim();
  if(!storeId||!confirmSlug||!confirmationCode)return json({error:"بيانات الحذف أو كود التأكيد غير مكتملة"},400);

  const authorization=await userClient.rpc("platform_authorize_store_delete",{
    store_id_input:storeId,
    confirm_slug_input:confirmSlug,
    code_input:confirmationCode
  });
  if(authorization.error){
    console.error("delete authorization failed",authorization.error.message);
    return json({error:authorization.error.message},400);
  }

  const backup=await userClient.rpc("platform_create_backup",{
    store_id_input:storeId,
    label_input:"نسخة تلقائية قبل الحذف النهائي",
    kind_input:"pre_delete"
  });
  if(backup.error){
    console.error("backup before delete failed",backup.error.message);
    return json({error:"تعذر إنشاء النسخة الاحتياطية قبل الحذف: "+backup.error.message},500);
  }

  let deletedFiles=0;
  try{
    const files=await listFiles(adminClient,"store-images",storeId);
    for(let i=0;i<files.length;i+=100){
      const batch=files.slice(i,i+100);
      const removed=await adminClient.storage.from("store-images").remove(batch);
      if(removed.error)throw removed.error;
      deletedFiles+=batch.length;
    }
  }catch(e){
    const message=e instanceof Error?e.message:String(e);
    console.error("storage cleanup failed",message);
    return json({error:"تعذر تنظيف ملفات المتجر: "+message},500);
  }

  const removed=await userClient.rpc("platform_delete_store_record",{store_id_input:storeId,confirm_slug_input:confirmSlug});
  if(removed.error){
    console.error("store record delete failed",removed.error.message);
    return json({error:removed.error.message},400);
  }

  return json({ok:true,deleted_files:deletedFiles});
});
