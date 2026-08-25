-- Reorder exercises inside the current WorkoutSession only.
-- This does not modify the source program or ScheduledWorkout snapshot.

create or replace function public.move_workout_session_exercise(p_session_exercise_id uuid, p_direction integer)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_current_position smallint;
  v_neighbor_id uuid;
  v_neighbor_position smallint;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_direction not in (-1, 1) then
    raise exception 'Direction must be -1 or 1' using errcode = '22023';
  end if;

  select wse.workout_session_id, wse.position
    into v_session_id, v_current_position
  from public.workout_session_exercises wse
  join public.workout_sessions ws on ws.id = wse.workout_session_id
  where wse.id = p_session_exercise_id
    and ws.user_id = v_user_id
    and ws.status = 'active';

  if v_session_id is null then
    raise exception 'Active workout exercise not found or access denied' using errcode = 'P0002';
  end if;

  if p_direction = -1 then
    select wse.id, wse.position into v_neighbor_id, v_neighbor_position
    from public.workout_session_exercises wse
    where wse.workout_session_id = v_session_id
      and wse.position < v_current_position
    order by wse.position desc
    limit 1;
  else
    select wse.id, wse.position into v_neighbor_id, v_neighbor_position
    from public.workout_session_exercises wse
    where wse.workout_session_id = v_session_id
      and wse.position > v_current_position
    order by wse.position asc
    limit 1;
  end if;

  if v_neighbor_id is null then
    return p_session_exercise_id;
  end if;

  if exists (
    select 1 from public.workout_session_exercises
    where workout_session_id = v_session_id and position = 32000
  ) then
    raise exception 'Unable to reorder workout exercises safely' using errcode = '54000';
  end if;

  update public.workout_session_exercises
  set position = 32000
  where id = p_session_exercise_id;

  update public.workout_session_exercises
  set position = v_current_position
  where id = v_neighbor_id;

  update public.workout_session_exercises
  set position = v_neighbor_position
  where id = p_session_exercise_id;

  return p_session_exercise_id;
end;
$$;

revoke all on function public.move_workout_session_exercise(uuid, integer) from public, anon;
grant execute on function public.move_workout_session_exercise(uuid, integer) to authenticated;
