-- Mobile drag-and-drop reorder for an active workout session.
-- `session` changes only the current WorkoutSession snapshot.
-- `program` also applies the source order to future scheduled copies of the same ProgramWorkout.
-- Completed/skipped/cancelled workouts and historical WorkoutSessions are never rewritten.
-- The old one-step move RPC is intentionally retired by this milestone.

drop function if exists public.move_workout_session_exercise(uuid, integer);

create or replace function public.reorder_workout_session_exercises(
  p_workout_session_id uuid,
  p_ordered_exercise_ids uuid[],
  p_scope text default 'session'
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_scheduled_workout_id uuid;
  v_user_program_id uuid;
  v_source_program_workout_id uuid;
  v_count integer;
  v_distinct_count integer;
  v_item uuid;
  v_position integer := 0;
  v_source_order uuid[];
  v_future record;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_scope not in ('session', 'program') then raise exception 'Invalid reorder scope' using errcode = '22023'; end if;
  if p_ordered_exercise_ids is null or cardinality(p_ordered_exercise_ids) = 0 then raise exception 'Exercise order is required' using errcode = '22023'; end if;

  select ws.scheduled_workout_id, sw.user_program_id, sw.source_program_workout_id
    into v_scheduled_workout_id, v_user_program_id, v_source_program_workout_id
  from public.workout_sessions ws
  join public.scheduled_workouts sw on sw.id = ws.scheduled_workout_id
  where ws.id = p_workout_session_id and ws.user_id = v_user_id and ws.status = 'active';

  if v_scheduled_workout_id is null then raise exception 'Active workout session not found or access denied' using errcode = 'P0002'; end if;

  select count(*) into v_count from public.workout_session_exercises where workout_session_id = p_workout_session_id;
  select count(distinct value) into v_distinct_count from unnest(p_ordered_exercise_ids) as value;
  if cardinality(p_ordered_exercise_ids) <> v_count or v_distinct_count <> v_count then
    raise exception 'Exercise order must contain every session exercise exactly once' using errcode = '22023';
  end if;

  if exists (
    select 1 from unnest(p_ordered_exercise_ids) as requested(id)
    where not exists (
      select 1 from public.workout_session_exercises wse
      where wse.id = requested.id and wse.workout_session_id = p_workout_session_id
    )
  ) then raise exception 'Exercise order contains an invalid session exercise' using errcode = '22023'; end if;

  update public.workout_session_exercises set position = position + 1000 where workout_session_id = p_workout_session_id;
  v_position := 0;
  foreach v_item in array p_ordered_exercise_ids loop
    v_position := v_position + 1;
    update public.workout_session_exercises set position = v_position where id = v_item and workout_session_id = p_workout_session_id;
  end loop;

  if p_scope = 'program' then
    if v_source_program_workout_id is null then raise exception 'This workout is not linked to a reusable program workout' using errcode = '22023'; end if;

    select array_agg(swe.source_program_workout_exercise_id order by requested.ordinality)
      into v_source_order
    from unnest(p_ordered_exercise_ids) with ordinality as requested(id, ordinality)
    join public.workout_session_exercises wse on wse.id = requested.id
    join public.scheduled_workout_exercises swe on swe.id = wse.source_scheduled_workout_exercise_id;

    if v_source_order is null or cardinality(v_source_order) <> v_count or exists (select 1 from unnest(v_source_order) source_id where source_id is null) then
      raise exception 'Unable to map this session order back to the program snapshot' using errcode = '22023';
    end if;

    for v_future in
      select sw.id from public.scheduled_workouts sw
      where sw.user_program_id = v_user_program_id
        and sw.source_program_workout_id = v_source_program_workout_id
        and sw.status = 'scheduled'
        and sw.id <> v_scheduled_workout_id
        and sw.scheduled_date >= current_date
      order by sw.sequence_number
    loop
      if (select count(*) from public.scheduled_workout_exercises swe where swe.scheduled_workout_id = v_future.id) <> v_count then continue; end if;
      update public.scheduled_workout_exercises set position = position + 1000 where scheduled_workout_id = v_future.id;
      v_position := 0;
      foreach v_item in array v_source_order loop
        v_position := v_position + 1;
        update public.scheduled_workout_exercises set position = v_position
        where scheduled_workout_id = v_future.id and source_program_workout_exercise_id = v_item;
      end loop;
    end loop;
  end if;

  return p_workout_session_id;
end;
$function$;

revoke all on function public.reorder_workout_session_exercises(uuid, uuid[], text) from public, anon;
grant execute on function public.reorder_workout_session_exercises(uuid, uuid[], text) to authenticated;