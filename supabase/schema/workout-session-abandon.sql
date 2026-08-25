-- Abandoned workout lifecycle.
-- An abandoned WorkoutSession becomes historical, while its ScheduledWorkout becomes skipped.
-- Skipped/cancelled scheduled workouts cannot be started again.

create or replace function public.start_workout(p_scheduled_workout_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_session_exercise_id uuid;
  v_scheduled record;
  v_exercise record;
  v_set record;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select sw.id, sw.status into v_scheduled
  from public.scheduled_workouts sw
  join public.user_programs up on up.id = sw.user_program_id
  where sw.id = p_scheduled_workout_id and up.user_id = v_user_id;
  if v_scheduled.id is null then raise exception 'Scheduled workout not found or access denied' using errcode = 'P0002'; end if;

  select ws.id into v_session_id from public.workout_sessions ws
  where ws.user_id = v_user_id and ws.scheduled_workout_id = p_scheduled_workout_id and ws.status = 'active' limit 1;
  if v_session_id is not null then return v_session_id; end if;

  if exists (select 1 from public.workout_sessions ws where ws.user_id = v_user_id and ws.status = 'active') then
    raise exception 'Another workout is already active' using errcode = '23505';
  end if;
  if v_scheduled.status = 'completed' or exists (select 1 from public.workout_sessions ws where ws.user_id = v_user_id and ws.scheduled_workout_id = p_scheduled_workout_id and ws.status = 'completed') then
    raise exception 'Workout is already completed' using errcode = '23505';
  end if;
  if v_scheduled.status in ('skipped','cancelled') then
    raise exception 'Skipped or cancelled workout cannot be started' using errcode = '22023';
  end if;

  insert into public.workout_sessions (user_id, scheduled_workout_id, status)
  values (v_user_id, p_scheduled_workout_id, 'active') returning id into v_session_id;

  for v_exercise in
    select swe.id as source_id, swe.exercise_id, swe.position
    from public.scheduled_workout_exercises swe
    where swe.scheduled_workout_id = p_scheduled_workout_id order by swe.position
  loop
    insert into public.workout_session_exercises (workout_session_id, source_scheduled_workout_exercise_id, exercise_id, position)
    values (v_session_id, v_exercise.source_id, v_exercise.exercise_id, v_exercise.position)
    returning id into v_session_exercise_id;

    for v_set in
      select ss.id as source_id, ss.set_number, ss.planned_reps
      from public.scheduled_sets ss
      where ss.scheduled_workout_exercise_id = v_exercise.source_id order by ss.set_number
    loop
      insert into public.performed_sets (workout_session_exercise_id, source_scheduled_set_id, set_number, set_type, planned_reps, reps)
      values (v_session_exercise_id, v_set.source_id, v_set.set_number, 'working', v_set.planned_reps, v_set.planned_reps);
    end loop;
  end loop;

  return v_session_id;
end;
$$;

create or replace function public.abandon_workout(p_workout_session_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_scheduled_workout_id uuid;
  v_user_program_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  update public.workout_sessions ws
  set status = 'abandoned',
      ended_at = now(),
      active_duration_seconds = greatest(
        ws.active_duration_seconds,
        floor(extract(epoch from (now() - ws.started_at)))::integer
      ),
      updated_at = now()
  where ws.id = p_workout_session_id
    and ws.user_id = v_user_id
    and ws.status = 'active'
  returning ws.scheduled_workout_id into v_scheduled_workout_id;

  if v_scheduled_workout_id is null then
    raise exception 'Active workout session not found or access denied' using errcode = 'P0002';
  end if;

  update public.scheduled_workouts sw
  set status = 'skipped'
  where sw.id = v_scheduled_workout_id
  returning sw.user_program_id into v_user_program_id;

  if v_user_program_id is not null and not exists (
    select 1
    from public.scheduled_workouts sw
    where sw.user_program_id = v_user_program_id
      and sw.status = 'scheduled'
  ) then
    update public.user_programs up
    set status = 'completed',
        completed_at = now(),
        updated_at = now()
    where up.id = v_user_program_id
      and up.user_id = v_user_id
      and up.status in ('active','paused');
  end if;

  return p_workout_session_id;
end;
$$;

revoke all on function public.start_workout(uuid) from public, anon;
revoke all on function public.abandon_workout(uuid) from public, anon;
grant execute on function public.start_workout(uuid) to authenticated;
grant execute on function public.abandon_workout(uuid) to authenticated;
