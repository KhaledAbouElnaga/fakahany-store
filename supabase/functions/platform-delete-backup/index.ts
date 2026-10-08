import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors={
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods":"POST, OPTIONS"
};
const json=(body:unknown,status=200)=>new Response(JSON.stringify(body),{
  status,headers:{...cors,"Content-Type":"application/json","Cache-Control":"no-store"}
});

Deno.serve(async(req)=>{
  if(req.method==="OPTIONS")return new Response("ok",{headers:cors});
  if(req.method!=="POST")return json({error:"Method not allowed"},405);

  const url=Deno.env.get("SUPABASE_URL")||"";
  const anon=Deno.env.get("SUPABASE_ANON_KEY")||"";
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")||"";
  if(!url||!anon||!service)return json({error:"إعداد الخادم غير مكتمل"},500);

  const bearer=req.headers.get("Authorization")||"";
  if(!/^Bearer\s+\S+$/i.test(bearer))return json({error:"يلزم تسجيل الدخول إلى إدارة المنصة"},401);

  const currentClient=createClient(url,anon,{
    global:{headers:{Authorization:bearer}},
    auth:{persistSession:false,autoRefreshToken:false}
  });
  const {data:{user},error:userError}=await currentClient.auth.getUser();
  if(userError||!user?.id||!user.email)return json({error:"انتهت جلسة تسجيل الدخول"},401);

  const authorized=await currentClient.rpc("is_platform_admin");
  if(authorized.error||authorized.data!==true)return json({error:"هذا الإجراء متاح لمالك المنصة فقط"},403);

  let body:any;
  try{body=await req.json()}catch{return json({error:"بيانات الطلب غير صالحة"},400)}
  const backupId=String(body?.backup_id||"").trim();
  const password=String(body?.password||"");
  if(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(backupId)
      ||password.length<1||password.length>512){
    return json({error:"حدد النسخة الاحتياطية وأدخل كلمة مرور حساب إدارة المنصة"},400);
  }

  // Validate the user's CURRENT password independently, without altering the
  // dashboard session or forwarding the password to any SQL function.
  const reauthClient=createClient(url,anon,{
    auth:{persistSession:false,autoRefreshToken:false}
  });
  const {data:passwordResult,error:passwordError}=await reauthClient.auth.signInWithPassword({
    email:user.email,password
  });
  if(passwordError||passwordResult.user?.id!==user.id){
    return json({error:"كلمة المرور غير صحيحة. استخدم كلمة مرور حساب إدارة المنصة."},403);
  }

  // This RPC is denied to anon/authenticated. Only this server-side service
  // role can delete the specific backup and add a platform audit entry.
  const admin=createClient(url,service,{
    auth:{persistSession:false,autoRefreshToken:false}
  });
  const {data,error}=await admin.rpc("platform_delete_backup_verified",{
    backup_id_input:backupId,
    actor_user_id_input:user.id
  });
  if(error){
    console.error("password-verified backup deletion failed",error.code,error.message);
    return json({error:error.message||"تعذر حذف النسخة الاحتياطية"},400);
  }
  return json(data||{ok:true});
});
