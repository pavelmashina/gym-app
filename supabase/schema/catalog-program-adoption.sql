-- Convert a shared catalog program into a user-owned reusable program template.
-- Catalog exercise names may not match the canonical exercise catalog, so the original
-- name/prescription are preserved as snapshots through Program -> ScheduledWorkout -> WorkoutSession.

alter table public.programs
  add column if not exists source_catalog_program_id uuid references public.catalog_programs(id) on delete set null;

create unique index if not exists programs_owner_source_catalog_unique
  on public.programs (owner_id, source_catalog_program_id)
  where source_catalog_program_id is not null;

alter table public.program_workout_exercises
  alter column exercise_id drop not null,
  add column if not exists exercise_name_snapshot text,
  add column if not exists prescription_snapshot text;

alter table public.program_workout_exercises
  drop constraint if exists program_workout_exercises_workout_id_exercise_id_key;

alter table public.program_workout_exercises
  drop constraint if exists program_workout_exercises_exercise_identity_check;
alter table public.program_workout_exercises
  add constraint program_workout_exercises_exercise_identity_check
  check (exercise_id is not null or nullif(btrim(exercise_name_snapshot), '') is not null);

alter table public.scheduled_workout_exercises
  alter column exercise_id drop not null,
  add column if not exists exercise_name_snapshot text,
  add column if not exists prescription_snapshot text;

alter table public.scheduled_workout_exercises
  drop constraint if exists scheduled_workout_exercises_exercise_identity_check;
alter table public.scheduled_workout_exercises
  add constraint scheduled_workout_exercises_exercise_identity_check
  check (exercise_id is not null or nullif(btrim(exercise_name_snapshot), '') is not null);

alter table public.workout_session_exercises
  alter column exercise_id drop not null,
  add column if not exists exercise_name_snapshot text,
  add column if not exists prescription_snapshot text;

alter table public.workout_session_exercises
  drop constraint if exists workout_session_exercises_exercise_identity_check;
alter table public.workout_session_exercises
  add constraint workout_session_exercises_exercise_identity_check
  check (exercise_id is not null or nullif(btrim(exercise_name_snapshot), '') is not null);

create or replace function public.adopt_catalog_program(p_catalog_program_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_catalog public.catalog_programs%rowtype;
  v_program_id uuid;
  v_week_id uuid;
  v_workout_id uuid;
  v_workout_exercise_id uuid;
  v_week jsonb;
  v_workout jsonb;
  v_exercise jsonb;
  v_week_pos bigint;
  v_workout_pos bigint;
  v_exercise_pos bigint;
  v_exercise_id uuid;
  v_name text;
  v_prescription text;
  v_set_count integer;
  v_reps integer;
  v_match text[];
  v_set_number integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  select * into v_catalog
  from public.catalog_programs
  where id = p_catalog_program_id and published = true;

  if v_catalog.id is null then
    raise exception 'Catalog program not found or unavailable' using errcode = 'P0002';
  end if;

  select p.id into v_program_id
  from public.programs p
  where p.owner_id = v_user_id
    and p.source_catalog_program_id = p_catalog_program_id
    and p.status <> 'archived'
  limit 1;

  if v_program_id is not null then
    return v_program_id;
  end if;

  insert into public.programs (
    owner_id, name, description, week_count, categories,
    training_place, equipment, level, status, schedule_mode,
    source_catalog_program_id
  ) values (
    v_user_id, left(v_catalog.name, 80), v_catalog.description,
    greatest(1, least(52, v_catalog.week_count)), v_catalog.categories,
    v_catalog.training_place, null, v_catalog.level, 'active', 'custom', v_catalog.id
  ) returning id into v_program_id;

  for v_week, v_week_pos in
    select value, ordinality
    from jsonb_array_elements(coalesce(v_catalog.source_payload -> 'weeks', '[]'::jsonb)) with ordinality
  loop
    insert into public.program_weeks (program_id, week_number, position)
    values (
      v_program_id,
      greatest(1, least(52, coalesce(nullif(v_week ->> 'number','')::integer, v_week_pos::integer))),
      v_week_pos::smallint
    ) returning id into v_week_id;

    for v_workout, v_workout_pos in
      select value, ordinality
      from jsonb_array_elements(coalesce(v_week -> 'workouts', '[]'::jsonb)) with ordinality
    loop
      insert into public.program_workouts (week_id, name, position, rest_days_after)
      values (
        v_week_id,
        left(coalesce(nullif(btrim(v_workout ->> 'name'), ''), 'Тренировка ' || v_workout_pos), 80),
        v_workout_pos::smallint,
        1
      ) returning id into v_workout_id;

      for v_exercise, v_exercise_pos in
        select value, ordinality
        from jsonb_array_elements(coalesce(v_workout -> 'exercises', '[]'::jsonb)) with ordinality
      loop
        v_name := nullif(btrim(v_exercise ->> 'name'), '');
        v_prescription := nullif(btrim(v_exercise ->> 'prescription'), '');
        if v_name is null then continue; end if;

        select e.id into v_exercise_id
        from public.exercises e
        where lower(btrim(e.name)) = lower(v_name)
        order by e.id
        limit 1;

        insert into public.program_workout_exercises (
          workout_id, exercise_id, exercise_name_snapshot, prescription_snapshot, position
        ) values (
          v_workout_id, v_exercise_id, v_name, v_prescription, v_exercise_pos::smallint
        ) returning id into v_workout_exercise_id;

        v_set_count := 1;
        v_reps := null;

        if v_prescription is not null then
          v_match := regexp_match(v_prescription, '(\d+)\s*[\*xх×]\s*(\d+)', 'i');
          if v_match is not null then
            v_set_count := greatest(1, least(20, v_match[1]::integer));
            v_reps := greatest(1, least(999, v_match[2]::integer));
          else
            v_match := regexp_match(v_prescription, '(\d+)\s*(?:подход(?:а|ов)?|круг(?:а|ов)?)', 'i');
            if v_match is not null then
              v_set_count := greatest(1, least(20, v_match[1]::integer));
            end if;
            v_match := regexp_match(v_prescription, 'по\s*(\d+)', 'i');
            if v_match is not null then
              v_reps := greatest(1, least(999, v_match[1]::integer));
            elsif v_prescription ~ '^\s*\d+\s*-\s*\d+' then
              v_match := regexp_match(v_prescription, '^\s*(\d+)');
              v_reps := greatest(1, least(999, v_match[1]::integer));
            elsif v_prescription ~* '^\s*\d+\s*(?:$|раз|повтор|повт|шаг)' then
              v_match := regexp_match(v_prescription, '^\s*(\d+)');
              v_reps := greatest(1, least(999, v_match[1]::integer));
            end if;
          end if;
        end if;

        for v_set_number in 1..v_set_count loop
          insert into public.program_exercise_sets (workout_exercise_id, set_number, reps)
          values (v_workout_exercise_id, v_set_number::smallint, v_reps);
        end loop;

        v_exercise_id := null;
      end loop;
    end loop;
  end loop;

  if not exists (
    select 1 from public.program_weeks pw
    join public.program_workouts w on w.week_id = pw.id
    where pw.program_id = v_program_id
  ) then
    raise exception 'Catalog program has no workouts' using errcode = '22023';
  end if;

  return v_program_id;
end;
$$;

revoke all on function public.adopt_catalog_program(uuid) from public, anon;
grant execute on function public.adopt_catalog_program(uuid) to authenticated;

-- Snapshot propagation into the personal schedule.
create or replace function public.start_program(p_program_id uuid, p_start_date date)
returns uuid
language plpgsql
security invoker
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
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_start_date is null then raise exception 'Start date is required' using errcode = '22023'; end if;
  if p_start_date < current_date then raise exception 'Start date cannot be in the past' using errcode = '22023'; end if;

  select p.id, p.schedule_mode into v_found_program, v_schedule_mode
  from public.programs p where p.id = p_program_id and p.status <> 'archived';
  if v_found_program is null then raise exception 'Program not found or unavailable' using errcode = 'P0002'; end if;

  v_isodow := extract(isodow from p_start_date)::integer;
  if v_schedule_mode = 'weekly_mwf' and v_isodow not in (1,3,5) then raise exception 'First workout must be Monday, Wednesday or Friday' using errcode = '22023'; end if;
  if v_schedule_mode = 'weekly_tts' and v_isodow not in (2,4,6) then raise exception 'First workout must be Tuesday, Thursday or Saturday' using errcode = '22023'; end if;

  if exists (select 1 from public.user_programs up where up.user_id=v_user_id and up.program_id=p_program_id and up.status in ('active','paused')) then
    raise exception 'Program is already active' using errcode = '23505';
  end if;

  insert into public.user_programs (user_id, program_id, status, start_date)
  values (v_user_id, p_program_id, 'active', p_start_date)
  returning id into v_user_program_id;

  for v_workout in
    select pw.week_number, w.id workout_id, w.name workout_name, w.rest_days_after
    from public.program_weeks pw join public.program_workouts w on w.week_id=pw.id
    where pw.program_id=p_program_id order by pw.position,w.position
  loop
    v_sequence := v_sequence + 1;
    insert into public.scheduled_workouts (user_program_id, source_program_workout_id, sequence_number, week_number, workout_name, scheduled_date, status)
    values (v_user_program_id, v_workout.workout_id, v_sequence::smallint, v_workout.week_number, v_workout.workout_name, v_current_date, 'scheduled')
    returning id into v_scheduled_workout_id;

    for v_exercise in
      select pwe.id source_id, pwe.exercise_id, pwe.exercise_name_snapshot, pwe.prescription_snapshot, pwe.position
      from public.program_workout_exercises pwe where pwe.workout_id=v_workout.workout_id order by pwe.position
    loop
      insert into public.scheduled_workout_exercises (
        scheduled_workout_id, source_program_workout_exercise_id, exercise_id,
        exercise_name_snapshot, prescription_snapshot, position
      ) values (
        v_scheduled_workout_id, v_exercise.source_id, v_exercise.exercise_id,
        v_exercise.exercise_name_snapshot, v_exercise.prescription_snapshot, v_exercise.position
      ) returning id into v_scheduled_exercise_id;

      for v_set in
        select pes.set_number, pes.reps from public.program_exercise_sets pes
        where pes.workout_exercise_id=v_exercise.source_id order by pes.set_number
      loop
        insert into public.scheduled_sets (scheduled_workout_exercise_id, set_number, planned_reps)
        values (v_scheduled_exercise_id, v_set.set_number, v_set.reps);
      end loop;
    end loop;

    if v_schedule_mode='weekly_mwf' then
      loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (1,3,5); end loop;
    elsif v_schedule_mode='weekly_tts' then
      loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (2,4,6); end loop;
    else
      v_current_date:=v_current_date+(1+coalesce(v_workout.rest_days_after,1));
    end if;
  end loop;

  if v_sequence=0 then raise exception 'Program has no workouts' using errcode='22023'; end if;
  return v_user_program_id;
end;
$$;

-- Snapshot propagation into an actual WorkoutSession.
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
  v_set_count integer;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;

  select sw.id, sw.status into v_scheduled
  from public.scheduled_workouts sw join public.user_programs up on up.id=sw.user_program_id
  where sw.id=p_scheduled_workout_id and up.user_id=v_user_id;
  if v_scheduled.id is null then raise exception 'Scheduled workout not found or access denied' using errcode='P0002'; end if;

  select ws.id into v_session_id from public.workout_sessions ws
  where ws.user_id=v_user_id and ws.scheduled_workout_id=p_scheduled_workout_id and ws.status='active' limit 1;
  if v_session_id is not null then return v_session_id; end if;
  if exists(select 1 from public.workout_sessions ws where ws.user_id=v_user_id and ws.status='active') then raise exception 'Another workout is already active' using errcode='23505'; end if;
  if v_scheduled.status='completed' or exists(select 1 from public.workout_sessions ws where ws.user_id=v_user_id and ws.scheduled_workout_id=p_scheduled_workout_id and ws.status='completed') then raise exception 'Workout is already completed' using errcode='23505'; end if;
  if v_scheduled.status in ('skipped','cancelled') then raise exception 'Skipped or cancelled workout cannot be started' using errcode='22023'; end if;

  insert into public.workout_sessions(user_id,scheduled_workout_id,status)
  values(v_user_id,p_scheduled_workout_id,'active') returning id into v_session_id;

  for v_exercise in
    select swe.id source_id, swe.exercise_id, swe.exercise_name_snapshot, swe.prescription_snapshot, swe.position
    from public.scheduled_workout_exercises swe
    where swe.scheduled_workout_id=p_scheduled_workout_id order by swe.position
  loop
    insert into public.workout_session_exercises(
      workout_session_id,source_scheduled_workout_exercise_id,exercise_id,
      exercise_name_snapshot,prescription_snapshot,position
    ) values (
      v_session_id,v_exercise.source_id,v_exercise.exercise_id,
      v_exercise.exercise_name_snapshot,v_exercise.prescription_snapshot,v_exercise.position
    ) returning id into v_session_exercise_id;

    v_set_count := 0;
    for v_set in
      select ss.id source_id, ss.set_number, ss.planned_reps from public.scheduled_sets ss
      where ss.scheduled_workout_exercise_id=v_exercise.source_id order by ss.set_number
    loop
      v_set_count := v_set_count + 1;
      insert into public.performed_sets(workout_session_exercise_id,source_scheduled_set_id,set_number,set_type,planned_reps,reps)
      values(v_session_exercise_id,v_set.source_id,v_set.set_number,'working',v_set.planned_reps,v_set.planned_reps);
    end loop;

    if v_set_count = 0 then
      insert into public.performed_sets(workout_session_exercise_id,set_number,set_type)
      values(v_session_exercise_id,1,'working');
    end if;
  end loop;

  return v_session_id;
end;
$$;

revoke all on function public.start_program(uuid,date) from public,anon;
revoke all on function public.start_workout(uuid) from public,anon;
grant execute on function public.start_program(uuid,date) to authenticated;
grant execute on function public.start_workout(uuid) to authenticated;
