-- Issue #61: an exercise can be added to any active workout, not only to a standalone one.
-- add_standalone_exercise stays for app builds that are still cached on phones.

create or replace function public.add_session_exercise(p_session_id uuid, p_exercise_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
  v_position integer;
  v_name text;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  -- The lock lines up two quick taps, so they cannot take the same position.
  perform 1 from public.workout_sessions ws
    where ws.id = p_session_id and ws.user_id = auth.uid() and ws.status = 'active' and ws.paused_at is null
    for update;
  if not found then
    raise exception 'Active workout session not found or access denied' using errcode = '42501';
  end if;
  -- Published catalog exercises and the user's own ones: the same list the exercise picker shows.
  select name into v_name from public.exercise_catalog_v2 where id = p_exercise_id;
  if not found then
    raise exception 'Exercise not available' using errcode = '22023';
  end if;
  select coalesce(max(position), 0) + 1 into v_position
    from public.workout_session_exercises where workout_session_id = p_session_id;
  insert into public.workout_session_exercises (workout_session_id, exercise_id, exercise_name_snapshot, position)
    values (p_session_id, p_exercise_id, v_name, v_position)
    returning id into v_id;
  -- Only this workout changes: no sets are created, the program and its schedule stay as they are.
  return v_id;
end;
$$;

revoke all on function public.add_session_exercise(uuid, uuid) from public, anon;
grant execute on function public.add_session_exercise(uuid, uuid) to authenticated;
