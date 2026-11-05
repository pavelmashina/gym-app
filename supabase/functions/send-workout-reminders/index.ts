import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import {createClient} from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

function json(body:unknown,status=200){return new Response(JSON.stringify(body),{status,headers:{"Content-Type":"application/json"}});}
function localParts(zone:string) {
  const parts=new Intl.DateTimeFormat("en-CA",{timeZone:zone,year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",hourCycle:"h23"}).formatToParts(new Date());
  const read=(type:string)=>parts.find(x=>x.type===type)?.value||"";
  return {date:`${read("year")}-${read("month")}-${read("day")}`,hour:Number(read("hour"))};
}

Deno.serve(async(request:Request)=>{
  if(request.method!=="POST")return json({error:"Method not allowed"},405);
  const url=Deno.env.get("SUPABASE_URL"),serviceKey=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if(!url||!serviceKey)return json({error:"Backend credentials missing"},503);
  const admin=createClient(url,serviceKey,{auth:{persistSession:false}});
  const token=request.headers.get("x-workout-key")||"";
  if(!token)return json({error:"Unauthorized"},401);
  const {data:authorized,error:authError}=await admin.rpc("gym_verify_push_cron_token",{p_token:token});
  if(authError||!authorized)return json({error:"Unauthorized"},401);

  const {data:credentials,error:credError}=await admin.rpc("gym_push_vapid_credentials");
  if(credError||!credentials?.public||!credentials?.private)return json({error:"VAPID configuration unavailable"},503);
  webpush.setVapidDetails("https://github.com/pavelmashina/gym-app",credentials.public,credentials.private);

  const {data:subscribers,error:subscriberError}=await admin.from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth").eq("is_active",true);
  if(subscriberError)return json({error:"Unable to read push subscribers"},500);
  if(!subscribers?.length)return json({ok:true,sent:0,subscribers:0});

  const userIds=[...new Set(subscribers.map(x=>x.user_id))];
  const {data:settings,error:settingsError}=await admin.from("user_app_settings")
    .select("user_id,workout_push,timezone").in("user_id",userIds);
  if(settingsError)return json({error:"Unable to read notification settings"},500);
  const settingsByUser=new Map((settings||[]).map(row=>[row.user_id,row]));
  const allowed=userId=>settingsByUser.get(userId)?.workout_push!==false;
  let sent=0,failed=0;

  async function notify(userId:string,title:string,body:string){
    if(!allowed(userId))return 0;
    let delivered=0;
    for(const target of subscribers.filter(row=>row.user_id===userId)){
      try{
        await webpush.sendNotification({endpoint:target.endpoint,keys:{p256dh:target.p256dh,auth:target.auth}},
          JSON.stringify({title,body,url:"/gym-app/"}));
        delivered++;sent++;
      }catch(error){
        failed++;
        const code=Number((error as {statusCode?:number})?.statusCode||0);
        if(code===404||code===410){
          await admin.from("push_subscriptions").update({is_active:false,updated_at:new Date().toISOString()}).eq("id",target.id);
        }
      }
    }
    return delivered;
  }

  // The DB outbox is populated by the minute-level server job; never depend on a foreground browser.
  const {data:pending,error:pendingError}=await admin.rpc("gym_pending_idle_reminders");
  if(pendingError)return json({error:"Unable to load inactive workouts"},500);
  for(const item of (Array.isArray(pending)?pending:[])){
    if(!userIds.includes(item.user_id))continue;
    const targets=subscribers.filter(row=>row.user_id===item.user_id);
    if(!allowed(item.user_id)){await admin.rpc("gym_mark_idle_reminder_sent",{p_session_id:item.session_id});continue;}
    if(!targets.length)continue;
    const before=sent;
    await notify(item.user_id,"Тренировка ждёт вас",`Вы не записывали результаты уже 30 минут. ${item.workout_name||"Вернитесь к тренировке или завершите её."}`);
    if(sent>before)await admin.rpc("gym_mark_idle_reminder_sent",{p_session_id:item.session_id});
  }

  // Existing daily morning reminders: one delivery per scheduled workout and local day.
  for(const userId of userIds){
    if(!allowed(userId))continue;
    const zone=settingsByUser.get(userId)?.timezone||"Europe/Moscow";
    let local;
    try{local=localParts(zone);}catch{local=localParts("Europe/Moscow");}
    if(local.hour!==8)continue;
    const {data:userPrograms}=await admin.from("user_programs")
      .select("id").eq("user_id",userId).eq("status","active");
    const ids=(userPrograms||[]).map(x=>x.id);
    if(!ids.length)continue;
    const {data:workouts}=await admin.from("scheduled_workouts")
      .select("id,workout_name,scheduled_date,status").in("user_program_id",ids)
      .eq("status","scheduled").eq("scheduled_date",local.date)
      .order("sequence_number",{ascending:true}).limit(1);
    const workout=workouts?.[0];
    if(!workout)continue;
    const {data:existing}=await admin.from("notification_delivery_log").select("id")
      .eq("user_id",userId).eq("scheduled_workout_id",workout.id)
      .eq("notification_type","workout_today").eq("local_date",local.date).maybeSingle();
    if(existing)continue;
    const before=sent;
    await notify(userId,"Тренировка сегодня",
      workout.workout_name?`${workout.workout_name} запланирована на сегодня.`:"Сегодня запланирована тренировка.");
    if(sent>before)await admin.from("notification_delivery_log").upsert({
      user_id:userId,scheduled_workout_id:workout.id,notification_type:"workout_today",local_date:local.date
    },{onConflict:"user_id,scheduled_workout_id,notification_type,local_date"});
  }
  return json({ok:true,sent,failed,subscribers:subscribers.length});
});
