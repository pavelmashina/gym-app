
-- Secure pg_cron -> pg_net -> Supabase Edge push delivery.
-- The secret values MUST be provisioned to Supabase Vault separately:
-- gym_push_cron_token, gym_vapid_public_key, gym_vapid_private_key.
-- Never add actual secret values to this migration or Git.
create extension if not exists pg_net with schema extensions;
create schema if not exists private;
CREATE OR REPLACE FUNCTION public.gym_verify_push_cron_token(p_token text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select exists(
  select 1 from vault.decrypted_secrets s
  where s.name='gym_push_cron_token'
    and extensions.digest(coalesce(p_token,''),'sha256')
        =extensions.digest(s.decrypted_secret,'sha256')
 );
$function$
;

CREATE OR REPLACE FUNCTION public.gym_push_vapid_credentials()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select jsonb_build_object(
   'public',max(case when name='gym_vapid_public_key' then decrypted_secret end),
   'private',max(case when name='gym_vapid_private_key' then decrypted_secret end)
 ) from vault.decrypted_secrets where name in ('gym_vapid_public_key','gym_vapid_private_key');
$function$
;

CREATE OR REPLACE FUNCTION public.gym_pending_idle_reminders()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select coalesce(jsonb_agg(jsonb_build_object(
   'session_id',o.session_id,'user_id',o.user_id,
   'workout_name',sw.workout_name
 )),'[]'::jsonb)
 from (
   select session_id,user_id from private.workout_inactivity_outbox
   where sent_at is null order by created_at asc limit 150
 ) o
 join public.workout_sessions ws on ws.id=o.session_id and ws.status='active'
 join public.scheduled_workouts sw on sw.id=ws.scheduled_workout_id;
$function$
;

CREATE OR REPLACE FUNCTION public.gym_mark_idle_reminder_sent(p_session_id uuid, p_error text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 update private.workout_inactivity_outbox
 set sent_at=case when p_error is null then now() else sent_at end,
     last_error=p_error
 where session_id=p_session_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION private.dispatch_workout_notifications()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare cron_token text;
begin
 select decrypted_secret into cron_token from vault.decrypted_secrets where name='gym_push_cron_token';
 if cron_token is null then raise exception 'Push cron secret not configured'; end if;
 perform net.http_post(
   url:='https://sjggdpyficjkpcmybbfr.supabase.co/functions/v1/send-workout-reminders',
   body:='{}'::jsonb,
   headers:=jsonb_build_object('Content-Type','application/json','x-workout-key',cron_token),
   timeout_milliseconds:=15000
 );
end;
$function$
;

revoke all on function public.gym_verify_push_cron_token(text) from public,anon,authenticated;
grant execute on function public.gym_verify_push_cron_token(text) to service_role;
revoke all on function public.gym_push_vapid_credentials() from public,anon,authenticated;
grant execute on function public.gym_push_vapid_credentials() to service_role;
revoke all on function public.gym_pending_idle_reminders() from public,anon,authenticated;
grant execute on function public.gym_pending_idle_reminders() to service_role;
revoke all on function public.gym_mark_idle_reminder_sent(uuid,text) from public,anon,authenticated;
grant execute on function public.gym_mark_idle_reminder_sent(uuid,text) to service_role;
revoke all on function private.dispatch_workout_notifications() from public,anon,authenticated;
select cron.schedule('gym-push-dispatch','* * * * *',
 'select private.dispatch_workout_notifications();');
