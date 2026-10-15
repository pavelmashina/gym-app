-- A standalone schedule envelope reuses session/history APIs but has no program.
alter table public.scheduled_workouts alter column user_program_id drop not null;
alter table public.scheduled_workouts add column if not exists standalone_owner_id uuid references auth.users(id);
alter table public.scheduled_workouts add constraint scheduled_workouts_origin_check check (
  (user_program_id is not null and standalone_owner_id is null) or
  (user_program_id is null and standalone_owner_id is not null and source_program_workout_id is null)
);
create index scheduled_workouts_standalone_owner_idx on public.scheduled_workouts(standalone_owner_id) where standalone_owner_id is not null;
create policy scheduled_workouts_standalone_own on public.scheduled_workouts
  for all to authenticated
  using (standalone_owner_id = (select auth.uid()))
  with check (standalone_owner_id = (select auth.uid()) and user_program_id is null and source_program_workout_id is null);

create or replace function public.start_standalone_workout(p_local_date date default current_date)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_schedule uuid;
  v_existing record;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_local_date is null or abs(p_local_date - current_date) > 1 then
    raise exception 'Invalid local date' using errcode='22023';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_user::text, 0));
  select ws.scheduled_workout_id, sw.standalone_owner_id into v_existing
    from public.workout_sessions ws join public.scheduled_workouts sw on sw.id=ws.scheduled_workout_id
    where ws.user_id=v_user and ws.status='active';
  if found then
    if v_existing.standalone_owner_id=v_user then return v_existing.scheduled_workout_id; end if;
    raise exception 'Another workout is already active' using errcode='23505';
  end if;
  insert into public.scheduled_workouts(standalone_owner_id,workout_name,scheduled_date,sequence_number,week_number)
    values(v_user,'Разовая тренировка',p_local_date,1,1) returning id into v_schedule;
  -- The existing unique active-session index also guards races with program starts.
  insert into public.workout_sessions(user_id,scheduled_workout_id) values(v_user,v_schedule);
  return v_schedule;
end;
$$;
revoke all on function public.start_standalone_workout(date) from public, anon;
grant execute on function public.start_standalone_workout(date) to authenticated;

create or replace function public.add_standalone_exercise(p_session_id uuid, p_exercise_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
  v_position integer;
  v_name text;
begin
  if auth.uid() is null then raise exception 'Authentication required' using errcode='42501'; end if;
  perform 1 from public.workout_sessions ws join public.scheduled_workouts sw on sw.id=ws.scheduled_workout_id
    where ws.id=p_session_id and ws.user_id=auth.uid() and ws.status='active' and ws.paused_at is null
      and sw.standalone_owner_id=auth.uid() and sw.user_program_id is null for update of ws;
  if not found then raise exception 'Active standalone session not found' using errcode='42501'; end if;
  select name into v_name from public.exercise_catalog_v2 where id=p_exercise_id;
  if not found then raise exception 'Exercise not available' using errcode='22023'; end if;
  select coalesce(max(position),0)+1 into v_position from public.workout_session_exercises where workout_session_id=p_session_id;
  insert into public.workout_session_exercises(workout_session_id,exercise_id,exercise_name_snapshot,position)
    values(p_session_id,p_exercise_id,v_name,v_position) returning id into v_id;
  -- No planned sets, weights or repetitions are copied.
  return v_id;
end;
$$;
revoke all on function public.add_standalone_exercise(uuid,uuid) from public, anon;
grant execute on function public.add_standalone_exercise(uuid,uuid) to authenticated;
