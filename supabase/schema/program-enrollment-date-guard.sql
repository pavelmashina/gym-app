-- Keep program enrollment date validation on the server as well as in the UI.
-- Apply after program-enrollment.sql.

create or replace function public.start_program(p_program_id uuid, p_start_date date)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_user_program_id uuid;
  v_scheduled_workout_id uuid;
  v_scheduled_exercise_id uuid;
  v_current_date date := p_start_date;
  v_sequence integer := 0;
  v_workout record;
  v_exercise record;
  v_set record;
  v_found_program uuid;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_start_date is null then
    raise exception 'Start date is required' using errcode = '22023';
  end if;
  if p_start_date < current_date then
    raise exception 'Start date cannot be in the past' using errcode = '22023';
  end if;

  select p.id into v_found_program
  from public.programs p
  where p.id = p_program_id and p.status <> 'archived';

  if v_found_program is null then
    raise exception 'Program not found or unavailable' using errcode = 'P0002';
  end if;

  if exists (
    select 1 from public.user_programs up
    where up.user_id = v_user_id
      and up.program_id = p_program_id
      and up.status in ('active','paused')
  ) then
    raise exception 'Program is already active' using errcode = '23505';
  end if;

  insert into public.user_programs (user_id, program_id, status, start_date)
  values (v_user_id, p_program_id, 'active', p_start_date)
  returning id into v_user_program_id;

  for v_workout in
    select pw.week_number, w.id as workout_id, w.name as workout_name, w.rest_days_after
    from public.program_weeks pw
    join public.program_workouts w on w.week_id = pw.id
    where pw.program_id = p_program_id
    order by pw.position, w.position
  loop
    v_sequence := v_sequence + 1;

    insert into public.scheduled_workouts (
      user_program_id, source_program_workout_id, sequence_number,
      week_number, workout_name, scheduled_date, status
    ) values (
      v_user_program_id, v_workout.workout_id, v_sequence::smallint,
      v_workout.week_number, v_workout.workout_name, v_current_date, 'scheduled'
    ) returning id into v_scheduled_workout_id;

    for v_exercise in
      select pwe.id as source_id, pwe.exercise_id, pwe.position
      from public.program_workout_exercises pwe
      where pwe.workout_id = v_workout.workout_id
      order by pwe.position
    loop
      insert into public.scheduled_workout_exercises (
        scheduled_workout_id, source_program_workout_exercise_id, exercise_id, position
      ) values (
        v_scheduled_workout_id, v_exercise.source_id, v_exercise.exercise_id, v_exercise.position
      ) returning id into v_scheduled_exercise_id;

      for v_set in
        select pes.set_number, pes.reps
        from public.program_exercise_sets pes
        where pes.workout_exercise_id = v_exercise.source_id
        order by pes.set_number
      loop
        insert into public.scheduled_sets (
          scheduled_workout_exercise_id, set_number, planned_reps
        ) values (
          v_scheduled_exercise_id, v_set.set_number, v_set.reps
        );
      end loop;
    end loop;

    v_current_date := v_current_date + (1 + coalesce(v_workout.rest_days_after, 1));
  end loop;

  if v_sequence = 0 then
    raise exception 'Program has no workouts' using errcode = '22023';
  end if;

  return v_user_program_id;
end;
$function$;

revoke all on function public.start_program(uuid, date) from public;
revoke all on function public.start_program(uuid, date) from anon;
grant execute on function public.start_program(uuid, date) to authenticated;
