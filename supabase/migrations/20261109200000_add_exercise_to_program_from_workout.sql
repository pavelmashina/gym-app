-- Issue #61, second part: an exercise added during a workout from a program goes where the user
-- chooses.
--   'session' (default): only this workout, as before.
--   'program': also into the program. The exercise is appended to the template workout, to this
--   workout's plan and to every workout made from the same template workout that has not started
--   yet (status 'scheduled', no session of any status), the same set #59 rebuilds after a program
--   edit. So the next workouts get it, and later program edits keep it. Completed, skipped and
--   started workouts and every finished result stay as they are.
-- Either way the exercise starts with one empty working set, as start_workout gives every exercise
-- without planned sets. In the program it gets one set without planned reps, as the program editor
-- gives a new exercise.

drop function if exists public.add_session_exercise(uuid, uuid);

create or replace function public.add_session_exercise(p_session_id uuid, p_exercise_id uuid, p_scope text default 'session')
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_scheduled_workout_id uuid;
  v_template_workout_id uuid;
  v_name text;
  v_template_exercise_id uuid;
  v_target record;
  v_planned_exercise_id uuid;
  v_planned_set_id uuid;
  v_source_exercise_id uuid;
  v_source_set_id uuid;
  v_id uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_scope is null or p_scope not in ('session', 'program') then
    raise exception 'Invalid add scope' using errcode = '22023';
  end if;
  -- The lock lines up two quick taps, so they cannot take the same position.
  select ws.scheduled_workout_id, sw.source_program_workout_id
    into v_scheduled_workout_id, v_template_workout_id
  from public.workout_sessions ws
  left join public.scheduled_workouts sw on sw.id = ws.scheduled_workout_id
  where ws.id = p_session_id and ws.user_id = v_user_id and ws.status = 'active' and ws.paused_at is null
  for update of ws;
  if not found then
    raise exception 'Active workout session not found or access denied' using errcode = '42501';
  end if;
  if p_scope = 'program' and not exists (
    select 1
    from public.program_workouts w
    join public.program_weeks pw on pw.id = w.week_id
    join public.programs p on p.id = pw.program_id
    where w.id = v_template_workout_id and p.owner_id = v_user_id
  ) then
    raise exception 'This workout is not linked to a program workout' using errcode = '22023';
  end if;
  -- Published catalog exercises and the user's own ones: the same list the exercise picker shows.
  select name into v_name from public.exercise_catalog_v2 where id = p_exercise_id;
  if not found then
    raise exception 'Exercise not available' using errcode = '22023';
  end if;

  if p_scope = 'program' then
    insert into public.program_workout_exercises (workout_id, exercise_id, exercise_name_snapshot, position)
      select v_template_workout_id, p_exercise_id, v_name, coalesce(max(pwe.position), 0) + 1
      from public.program_workout_exercises pwe where pwe.workout_id = v_template_workout_id
      returning id into v_template_exercise_id;
    insert into public.program_exercise_sets (workout_exercise_id, set_number, reps)
      values (v_template_exercise_id, 1, null);

    for v_target in
      select sw.id
      from public.scheduled_workouts sw
      join public.user_programs up on up.id = sw.user_program_id
      where up.user_id = v_user_id
        and sw.source_program_workout_id = v_template_workout_id
        and (
          sw.id = v_scheduled_workout_id
          or (up.status in ('active', 'paused') and sw.status = 'scheduled'
              and not exists (select 1 from public.workout_sessions s where s.scheduled_workout_id = sw.id))
        )
    loop
      insert into public.scheduled_workout_exercises (scheduled_workout_id, source_program_workout_exercise_id, exercise_id, exercise_name_snapshot, position)
        select v_target.id, v_template_exercise_id, p_exercise_id, v_name, coalesce(max(swe.position), 0) + 1
        from public.scheduled_workout_exercises swe where swe.scheduled_workout_id = v_target.id
        returning id into v_planned_exercise_id;
      insert into public.scheduled_sets (scheduled_workout_exercise_id, set_number, planned_reps)
        values (v_planned_exercise_id, 1, null)
        returning id into v_planned_set_id;
      if v_target.id = v_scheduled_workout_id then
        v_source_exercise_id := v_planned_exercise_id;
        v_source_set_id := v_planned_set_id;
      end if;
    end loop;
  end if;

  -- Linked to this workout's plan when it went into the program, so it can later be moved
  -- in all such workouts too.
  insert into public.workout_session_exercises (workout_session_id, source_scheduled_workout_exercise_id, exercise_id, exercise_name_snapshot, position)
    select p_session_id, v_source_exercise_id, p_exercise_id, v_name, coalesce(max(wse.position), 0) + 1
    from public.workout_session_exercises wse where wse.workout_session_id = p_session_id
    returning id into v_id;
  insert into public.performed_sets (workout_session_exercise_id, source_scheduled_set_id, set_number, set_type)
    values (v_id, v_source_set_id, 1, 'working');
  return v_id;
end;
$$;

revoke all on function public.add_session_exercise(uuid, uuid, text) from public, anon;
grant execute on function public.add_session_exercise(uuid, uuid, text) to authenticated;
