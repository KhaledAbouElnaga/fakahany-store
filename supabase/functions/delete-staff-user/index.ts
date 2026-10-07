import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{"content-type":"application/json"}});

Deno.serve(async(req:Request)=>{
  if(req.method!=="POST")return json({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL");
  const anon=Deno.env.get("SUPABASE_ANON_KEY");
  const service=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const authorization=req.headers.get("Authorization")||"";
  if(!url||!anon||!service||!authorization)return json({error:"Unauthorized"},401);

  const userClient=createClient(url,anon,{global:{headers:{Authorization:authorization}},auth:{persistSession:false}});
  const adminClient=createClient(url,service,{auth:{persistSession:false}});

  const ownerCheck=await userClient.rpc("is_admin");
  if(ownerCheck.error||ownerCheck.data!==true)return json({error:"Owner authorization required"},403);
  const callerProfile=await userClient.rpc("current_staff_profile");
  const callerStoreId=callerProfile.data?.store_id;
  if(callerProfile.error||!callerStoreId)return json({error:"Store context unavailable"},403);

  const userResult=await userClient.auth.getUser();
  const callerId=userResult.data.user?.id;
  if(!callerId)return json({error:"Unauthorized"},401);

  let body:{user_id?:string}={};
  try{body=await req.json()}catch{return json({error:"Invalid request"},400)}
  const targetId=String(body.user_id||"");
  if(!targetId||targetId===callerId)return json({error:"Invalid target"},400);

  const target=await adminClient.from("staff_profiles").select("user_id,store_id,role,email").eq("user_id",targetId).maybeSingle();
  if(target.error)return json({error:"Unable to read target account"},500);
  if(!target.data)return json({error:"Account not found"},404);
  if(target.data.store_id!==callerStoreId)return json({error:"Cross-store operation denied"},403);
  if(target.data.role==="owner")return json({error:"Owner accounts cannot be deleted here"},400);

  const deleted=await adminClient.auth.admin.deleteUser(targetId);
  if(deleted.error)return json({error:deleted.error.message},400);

  await adminClient.from("admins").delete().eq("user_id",targetId).eq("store_id",callerStoreId);
  await adminClient.from("staff_profiles").delete().eq("user_id",targetId).eq("store_id",callerStoreId);
  await adminClient.from("staff_invites").delete().eq("store_id",callerStoreId).eq("email",target.data.email);

  return json({success:true});
});
