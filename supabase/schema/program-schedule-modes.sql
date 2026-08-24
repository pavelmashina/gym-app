alter table public.programs
  add column if not exists schedule_mode text not null default 'custom';

alter table public.programs
  drop constraint if exists programs_schedule_mode_check;

alter table public.programs
  add constraint programs_schedule_mode_check
  check (schedule_mode in ('custom', 'weekly_mwf', 'weekly_tts', 'cycle_2_2'));

create or replace function public.create_program_with_schedule(p_program jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_program_id uuid;
  v_schedule_mode text := coalesce(nullif(btrim(p_program ->> 'schedule_mode'), ''), 'custom');
begin
  if v_schedule_mode not in ('custom', 'weekly_mwf', 'weekly_tts', 'cycle_2_2') then
    raise exception 'Invalid schedule mode' using errcode = '22023';
  end if;

  v_program_id := public.create_program_with_structure(p_program);

  update public.programs
  set schedule_mode = v_schedule_mode,
      updated_at = now()
  where id = v_program_id
    and owner_id = (select auth.uid());

  if not found then
    raise exception 'Program not found or access denied' using errcode = '42501';
  end if;

  return v_program_id;
end;
$$;

create or replace function public.update_program_with_schedule(p_program_id uuid, p_program jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_program_id uuid;
  v_schedule_mode text := coalesce(nullif(btrim(p_program ->> 'schedule_mode'), ''), 'custom');
begin
  if v_schedule_mode not in ('custom', 'weekly_mwf', 'weekly_tts', 'cycle_2_2') then
    raise exception 'Invalid schedule mode' using errcode = '22023';
  end if;

  v_program_id := public.update_program_with_structure(p_program_id, p_program);

  update public.programs
  set schedule_mode = v_schedule_mode,
      updated_at = now()
  where id = v_program_id
    and owner_id = (select auth.uid());

  if not found then
    raise exception 'Program not found or access denied' using errcode = '42501';
  end if;

  return v_program_id;
end;
$$;

create or replace function public.start_program(p_program_id uuid, p_start_date date)
returns uuid
language plpgsql
set search_path = ''
as $$
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
  v_schedule_mode text;
  v_isodow integer;
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

  select p.id, p.schedule_mode
    into v_found_program, v_schedule_mode
  from public.programs p
  where p.id = p_program_id and p.status <> 'archived';

  if v_found_program is null then
    raise exception 'Program not found or unavailable' using errcode = 'P0002';
  end if;

  v_isodow := extract(isodow from p_start_date)::integer;
  if v_schedule_mode = 'weekly_mwf' and v_isodow not in (1, 3, 5) then
    raise exception 'First workout must be Monday, Wednesday or Friday' using errcode = '22023';
  end if;
  if v_schedule_mode = 'weekly_tts' and v_isodow not in (2, 4, 6) then
    raise exception 'First workout must be Tuesday, Thursday or Saturday' using errcode = '22023';
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
    select
      pw.week_number,
      w.id as workout_id,
      w.name as workout_name,
      w.rest_days_after
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

    if v_schedule_mode = 'weekly_mwf' then
      loop
        v_current_date := v_current_date + 1;
        exit when extract(isodow from v_current_date)::integer in (1, 3, 5);
      end loop;
    elsif v_schedule_mode = 'weekly_tts' then
      loop
        v_current_date := v_current_date + 1;
        exit when extract(isodow from v_current_date)::integer in (2, 4, 6);
      end loop;
    else
      v_current_date := v_current_date + (1 + coalesce(v_workout.rest_days_after, 1));
    end if;
  end loop;

  if v_sequence = 0 then
    raise exception 'Program has no workouts' using errcode = '22023';
  end if;

  return v_user_program_id;
end;
$$;

revoke all on function public.create_program_with_schedule(jsonb) from public, anon;
revoke all on function public.update_program_with_schedule(uuid, jsonb) from public, anon;
revoke all on function public.start_program(uuid, date) from public, anon;
grant execute on function public.create_program_with_schedule(jsonb) to authenticated;
grant execute on function public.update_program_with_schedule(uuid, jsonb) to authenticated;
grant execute on function public.start_program(uuid, date) to authenticated;
