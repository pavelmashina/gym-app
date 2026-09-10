-- Workout session lifecycle: pause/resume, duration accounting and start safeguards.
-- This file mirrors production migration workout_pause_and_start_guards.

alter table public.workout_sessions
  add column if not exists paused_at timestamptz;

create or replace function public.pause_workout(p_scheduled_workout_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.workout_sessions ws
  set active_duration_seconds = ws.active_duration_seconds + greatest(0, floor(extract(epoch from (now() - ws.started_at)))::integer),
      paused_at = now(), updated_at = now()
  where ws.user_id=v_user_id and ws.scheduled_workout_id=p_scheduled_workout_id and ws.status='active' and ws.paused_at is null
  returning ws.id into v_session_id;
  if v_session_id is null then
    select ws.id into v_session_id from public.workout_sessions ws
    where ws.user_id=v_user_id and ws.scheduled_workout_id=p_scheduled_workout_id and ws.status='active' and ws.paused_at is not null limit 1;
  end if;
  if v_session_id is null then raise exception 'Active workout session not found' using errcode='P0002'; end if;
  return v_session_id;
end;
$$;

create or replace function public.resume_workout(p_scheduled_workout_id uuid)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  update public.workout_sessions ws
  set started_at=now(), paused_at=null, updated_at=now()
  where ws.user_id=v_user_id and ws.scheduled_workout_id=p_scheduled_workout_id and ws.status='active' and ws.paused_at is not null
  returning ws.id into v_session_id;
  if v_session_id is null then raise exception 'Paused workout session not found' using errcode='P0002'; end if;
  return v_session_id;
end;
$$;

grant execute on function public.pause_workout(uuid) to authenticated;
grant execute on function public.resume_workout(uuid) to authenticated;

-- Production complete_workout additionally accumulates only the current active segment
-- into active_duration_seconds and clears paused_at.
-- Production start_workout additionally requires an active program, rejects future
-- scheduled dates, and preserves the existing one-active-session-per-user invariant.
-- pause_program refuses to pause a program while it still has a live workout session.
