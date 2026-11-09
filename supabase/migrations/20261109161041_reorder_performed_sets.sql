-- Issue #60: the sets of an exercise in an active workout can be dragged into a new order.
-- The order lives in performed_sets.set_number. One call rewrites every number of the exercise
-- in one transaction, so a dropped connection never leaves the order half-saved.
-- Warm-up sets always come before working sets; the call refuses any other order.
-- Completed and abandoned sessions are never rewritten.

create or replace function public.reorder_performed_sets(
  p_workout_session_exercise_id uuid,
  p_ordered_set_ids uuid[]
)
returns void
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
  v_top integer;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_ordered_set_ids is null or cardinality(p_ordered_set_ids) = 0 then
    raise exception 'Set order is required' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.workout_session_exercises wse
    join public.workout_sessions ws on ws.id = wse.workout_session_id
    where wse.id = p_workout_session_exercise_id and ws.user_id = v_user_id and ws.status = 'active'
  ) then
    raise exception 'Active workout session not found or access denied' using errcode = 'P0002';
  end if;

  select count(*), max(set_number) into v_count, v_top
  from public.performed_sets
  where workout_session_exercise_id = p_workout_session_exercise_id;

  if cardinality(p_ordered_set_ids) <> v_count
    or (select count(distinct requested.id) from unnest(p_ordered_set_ids) as requested(id)) <> v_count
    or exists (
      select 1 from unnest(p_ordered_set_ids) as requested(id)
      where not exists (
        select 1 from public.performed_sets ps
        where ps.id = requested.id and ps.workout_session_exercise_id = p_workout_session_exercise_id
      )
    ) then
    raise exception 'Set order must contain every set of the exercise exactly once' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_ordered_set_ids) with ordinality as warmup(id, pos)
    join public.performed_sets warmup_set on warmup_set.id = warmup.id and warmup_set.set_type = 'warmup'
    join unnest(p_ordered_set_ids) with ordinality as working(id, pos) on working.pos < warmup.pos
    join public.performed_sets working_set on working_set.id = working.id and working_set.set_type = 'working'
  ) then
    raise exception 'Warm-up sets must come before working sets' using errcode = '22023';
  end if;

  -- (exercise, set_number) is unique and checked row by row: first lift every set above the
  -- current numbers, then number them 1..n. Neither step can meet a number still in use.
  update public.performed_sets ps
  set set_number = v_top + requested.pos
  from unnest(p_ordered_set_ids) with ordinality as requested(id, pos)
  where ps.id = requested.id and ps.workout_session_exercise_id = p_workout_session_exercise_id;

  update public.performed_sets ps
  set set_number = requested.pos
  from unnest(p_ordered_set_ids) with ordinality as requested(id, pos)
  where ps.id = requested.id and ps.workout_session_exercise_id = p_workout_session_exercise_id;
end;
$function$;

revoke all on function public.reorder_performed_sets(uuid, uuid[]) from public, anon;
grant execute on function public.reorder_performed_sets(uuid, uuid[]) to authenticated, service_role;
