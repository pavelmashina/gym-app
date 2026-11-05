
-- Applied on 2026-11-05. Completion-day overrides and inactivity safeguards.
-- Keep original ended_at unchanged for immutable audit trail; statistics use completed_on.
alter table public.workout_sessions add column if not exists completed_on date;
alter table public.workout_sessions add column if not exists last_activity_at timestamptz;
alter table public.workout_sessions add column if not exists inactivity_reminded_at timestamptz;
alter table public.workout_sessions add column if not exists auto_completed boolean not null default false;
update public.workout_sessions set last_activity_at=coalesce(updated_at,started_at,now())
  where last_activity_at is null;
alter table public.workout_sessions alter column last_activity_at set default now();
alter table public.workout_sessions alter column last_activity_at set not null;
create index if not exists workout_sessions_active_idle_idx
  on public.workout_sessions(status,started_at,last_activity_at) where status='active';
create schema if not exists private;
create table if not exists private.workout_inactivity_outbox (
 session_id uuid primary key references public.workout_sessions(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 created_at timestamptz not null default now(),
 sent_at timestamptz,
 last_error text
);
revoke all on schema private from public,anon,authenticated;
revoke all on private.workout_inactivity_outbox from public,anon,authenticated;
CREATE OR REPLACE FUNCTION public.touch_workout_session_on_set_change()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare v_session_id uuid;
begin
  select wse.workout_session_id into v_session_id
  from public.workout_session_exercises wse where wse.id = coalesce(new.workout_session_exercise_id, old.workout_session_exercise_id);
  update public.workout_sessions ws set last_activity_at=now()
  where ws.id=v_session_id and ws.status='active';
  return coalesce(new,old);
end;
$function$
;

CREATE OR REPLACE FUNCTION public.change_completed_workout_date(p_session_id uuid, p_new_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_new_date is null or p_new_date > current_date then raise exception 'Date must be today or earlier' using errcode='22023'; end if;
  update public.workout_sessions
  set completed_on=p_new_date,updated_at=now()
  where id=p_session_id and user_id=(select auth.uid()) and status='completed';
  if not found then raise exception 'Completed workout not found' using errcode='P0002'; end if;
  return p_session_id;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.mark_scheduled_workout_completed(p_scheduled_workout_id uuid, p_completed_on date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_session uuid;
  v_row record;
  v_previous record;
  v_result_reps integer;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_completed_on is null or p_completed_on > current_date then raise exception 'Completion date cannot be in the future' using errcode='22023'; end if;
  -- Uses all existing start-workout guards (ownership, date and single-active-session).
  v_session := public.start_workout(p_scheduled_workout_id);
  for v_row in
    select ps.id, ps.reps, ps.set_number, e.exercise_id, e.exercise_name_snapshot
    from public.performed_sets ps
    join public.workout_session_exercises e on e.id=ps.workout_session_exercise_id
    where e.workout_session_id=v_session
  loop
    select old_set.weight,old_set.reps into v_previous
    from public.performed_sets old_set
    join public.workout_session_exercises old_ex on old_ex.id=old_set.workout_session_exercise_id
    join public.workout_sessions old_ws on old_ws.id=old_ex.workout_session_id
    where old_ws.user_id=(select auth.uid()) and old_ws.status='completed' and old_ws.id<>v_session
      and old_set.set_number=v_row.set_number and old_set.set_type='working' and old_set.completed=true
      and ((v_row.exercise_id is not null and old_ex.exercise_id=v_row.exercise_id)
        or (v_row.exercise_id is null and old_ex.exercise_id is null and old_ex.exercise_name_snapshot=v_row.exercise_name_snapshot))
    order by old_ws.ended_at desc limit 1;
    v_result_reps:=coalesce(v_previous.reps,v_row.reps);
    update public.performed_sets
    set weight=v_previous.weight,reps=v_result_reps,completed=(v_result_reps is not null),
        completed_at=case when v_result_reps is not null then now() else null end
    where id=v_row.id;
    v_previous:=null;
  end loop;
  perform public.complete_workout(v_session);
  update public.workout_sessions set completed_on=p_completed_on where id=v_session and user_id=(select auth.uid());
  return v_session;
end;
$function$
;

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
 where ws.status='active'
 and now()-ws.last_activity_at>=interval '30 minutes'
 and now()-ws.started_at < interval '3 hours'
 on conflict(session_id) do nothing;

 for v_workout in
  select ws.id,ws.scheduled_workout_id,ws.user_id
  from public.workout_sessions ws
  where ws.status='active'
    and now()-ws.started_at>=interval '3 hours'
  for update skip locked
 loop
  update public.workout_sessions ws
   set status='completed',ended_at=now(),completed_on=current_date,
       active_duration_seconds=ws.active_duration_seconds + greatest(0,floor(extract(epoch from now()-ws.started_at))::int),
       paused_at=null,auto_completed=true,updated_at=now()
   where ws.id=v_workout.id and ws.status='active';
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

drop trigger if exists gym_workout_activity_sets on public.performed_sets;
create trigger gym_workout_activity_sets after insert or update or delete on public.performed_sets
  for each row execute function public.touch_workout_session_on_set_change();
revoke all on function public.change_completed_workout_date(uuid,date) from public,anon;
grant execute on function public.change_completed_workout_date(uuid,date) to authenticated;
revoke all on function public.mark_scheduled_workout_completed(uuid,date) from public,anon;
grant execute on function public.mark_scheduled_workout_completed(uuid,date) to authenticated;
revoke all on function private.process_workout_timeouts() from public,anon,authenticated;
create extension if not exists pg_cron with schema pg_catalog;
select cron.schedule('gym-workout-idle-and-auto-finish','* * * * *',
 'select private.process_workout_timeouts();');
