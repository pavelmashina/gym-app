-- Already applied in production: pause suppresses both reminder and auto-finish.
-- Resuming refreshes the inactivity timer and discards stale queued reminders.
CREATE OR REPLACE FUNCTION private.process_workout_timeouts()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_workout record;v_count integer:=0;
begin
 insert into private.workout_inactivity_outbox(session_id,user_id)
 select ws.id,ws.user_id
 from public.workout_sessions ws
 where ws.status='active' and ws.paused_at is null
 and now()-ws.last_activity_at>=interval '30 minutes'
 and now()-ws.started_at < interval '3 hours'
 on conflict(session_id) do nothing;

 for v_workout in
  select ws.id,ws.scheduled_workout_id,ws.user_id
  from public.workout_sessions ws
  where ws.status='active' and ws.paused_at is null
    and now()-ws.started_at>=interval '3 hours'
  for update skip locked
 loop
  update public.workout_sessions ws
   set status='completed',ended_at=now(),completed_on=current_date,
       active_duration_seconds=ws.active_duration_seconds + greatest(0,floor(extract(epoch from now()-ws.started_at))::int),
       paused_at=null,auto_completed=true,updated_at=now()
   where ws.id=v_workout.id and ws.status='active' and ws.paused_at is null;
  if found then
    update public.scheduled_workouts set status='completed' where id=v_workout.scheduled_workout_id and status='scheduled';
    update public.user_programs up set status='completed',completed_at=now(),updated_at=now()
      where up.id=(select sw.user_program_id from public.scheduled_workouts sw where sw.id=v_workout.scheduled_workout_id)
        and up.status in ('active','paused')
        and not exists(select 1 from public.scheduled_workouts sw2
          where sw2.user_program_id=up.id and sw2.status='scheduled');
    v_count:=v_count+1;
  end if;
 end loop;
 return v_count;
end;
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
 join public.workout_sessions ws on ws.id=o.session_id and ws.status='active' and ws.paused_at is null
 join public.scheduled_workouts sw on sw.id=ws.scheduled_workout_id;
$function$
;

CREATE OR REPLACE FUNCTION public.workout_resume_resets_inactivity_clock()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
  if old.paused_at is not null and new.paused_at is null and new.status='active' then
    new.last_activity_at=now();
    delete from private.workout_inactivity_outbox where session_id=new.id and sent_at is null;
  end if;
  return new;
end;
$function$
;
drop trigger if exists gym_reset_idle_on_resume on public.workout_sessions;
create trigger gym_reset_idle_on_resume before update of paused_at on public.workout_sessions
  for each row execute function public.workout_resume_resets_inactivity_clock();
revoke all on function public.workout_resume_resets_inactivity_clock() from public,anon,authenticated;
