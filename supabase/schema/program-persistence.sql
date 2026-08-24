-- Atomic program creation RPC + private program cover storage.

create or replace function public.create_program_with_structure(p_program jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_owner_id uuid := auth.uid();
  v_program_id uuid;
  v_week_id uuid;
  v_workout_id uuid;
  v_workout_exercise_id uuid;
  v_week jsonb;
  v_workout jsonb;
  v_exercise jsonb;
  v_set jsonb;
  v_workouts jsonb;
  v_exercises jsonb;
  v_sets jsonb;
  v_weeks jsonb := p_program -> 'weeks';
  v_week_idx bigint;
  v_workout_idx bigint;
  v_exercise_idx bigint;
  v_set_idx bigint;
  v_name text := btrim(coalesce(p_program ->> 'name', ''));
  v_workout_name text;
  v_week_count integer;
  v_exercise_id uuid;
  v_reps integer;
begin
  if v_owner_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if p_program is null or jsonb_typeof(p_program) <> 'object' then
    raise exception 'Program payload must be an object' using errcode = '22023';
  end if;

  if v_name = '' or char_length(v_name) > 80 then
    raise exception 'Program name must contain 1 to 80 characters' using errcode = '22023';
  end if;

  begin
    v_week_count := (p_program ->> 'week_count')::integer;
  exception when others then
    raise exception 'Week count must be an integer' using errcode = '22023';
  end;

  if v_week_count < 1 or v_week_count > 52 then
    raise exception 'Week count must be between 1 and 52' using errcode = '22023';
  end if;

  if jsonb_typeof(v_weeks) <> 'array' or jsonb_array_length(v_weeks) <> v_week_count then
    raise exception 'Weeks array must match week_count' using errcode = '22023';
  end if;

  insert into public.programs (
    owner_id, name, description, week_count, categories,
    training_place, equipment, level, status
  )
  values (
    v_owner_id,
    v_name,
    nullif(btrim(coalesce(p_program ->> 'description', '')), ''),
    v_week_count,
    case
      when jsonb_typeof(p_program -> 'categories') = 'array'
        then array(select jsonb_array_elements_text(p_program -> 'categories'))
      else '{}'::text[]
    end,
    nullif(btrim(coalesce(p_program ->> 'training_place', '')), ''),
    nullif(btrim(coalesce(p_program ->> 'equipment', '')), ''),
    nullif(btrim(coalesce(p_program ->> 'level', '')), ''),
    'active'
  )
  returning id into v_program_id;

  for v_week, v_week_idx in
    select value, ordinality
    from jsonb_array_elements(v_weeks) with ordinality as items(value, ordinality)
  loop
    v_workouts := v_week -> 'workouts';
    if jsonb_typeof(v_workouts) <> 'array' or jsonb_array_length(v_workouts) = 0 then
      raise exception 'Every week must contain at least one workout' using errcode = '22023';
    end if;

    insert into public.program_weeks (program_id, week_number, position)
    values (v_program_id, v_week_idx::smallint, v_week_idx::smallint)
    returning id into v_week_id;

    for v_workout, v_workout_idx in
      select value, ordinality
      from jsonb_array_elements(v_workouts) with ordinality as items(value, ordinality)
    loop
      v_workout_name := btrim(coalesce(v_workout ->> 'name', ''));
      v_exercises := v_workout -> 'exercises';

      if v_workout_name = '' or char_length(v_workout_name) > 80 then
        raise exception 'Workout name must contain 1 to 80 characters' using errcode = '22023';
      end if;
      if jsonb_typeof(v_exercises) <> 'array' or jsonb_array_length(v_exercises) = 0 then
        raise exception 'Every workout must contain at least one exercise' using errcode = '22023';
      end if;

      insert into public.program_workouts (week_id, name, position)
      values (v_week_id, v_workout_name, v_workout_idx::smallint)
      returning id into v_workout_id;

      for v_exercise, v_exercise_idx in
        select value, ordinality
        from jsonb_array_elements(v_exercises) with ordinality as items(value, ordinality)
      loop
        begin
          v_exercise_id := (v_exercise ->> 'exercise_id')::uuid;
        exception when others then
          raise exception 'Invalid exercise id' using errcode = '22023';
        end;

        insert into public.program_workout_exercises (workout_id, exercise_id, position)
        values (v_workout_id, v_exercise_id, v_exercise_idx::smallint)
        returning id into v_workout_exercise_id;

        v_sets := coalesce(v_exercise -> 'sets', '[]'::jsonb);
        if jsonb_typeof(v_sets) <> 'array' then
          raise exception 'Exercise sets must be an array' using errcode = '22023';
        end if;

        for v_set, v_set_idx in
          select value, ordinality
          from jsonb_array_elements(v_sets) with ordinality as items(value, ordinality)
        loop
          if v_set ->> 'reps' is null or btrim(v_set ->> 'reps') = '' then
            v_reps := null;
          else
            begin
              v_reps := (v_set ->> 'reps')::integer;
            exception when others then
              raise exception 'Reps must be an integer' using errcode = '22023';
            end;
            if v_reps < 1 or v_reps > 999 then
              raise exception 'Reps must be between 1 and 999' using errcode = '22023';
            end if;
          end if;

          insert into public.program_exercise_sets (workout_exercise_id, set_number, reps)
          values (v_workout_exercise_id, v_set_idx::smallint, v_reps);
        end loop;
      end loop;
    end loop;
  end loop;

  return v_program_id;
end;
$function$;

revoke all on function public.create_program_with_structure(jsonb) from public;
revoke all on function public.create_program_with_structure(jsonb) from anon;
grant execute on function public.create_program_with_structure(jsonb) to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'program-covers', 'program-covers', false, 5242880,
  array['image/jpeg','image/png','image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "program_covers_select_own" on storage.objects;
create policy "program_covers_select_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'program-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "program_covers_insert_own" on storage.objects;
create policy "program_covers_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'program-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "program_covers_update_own" on storage.objects;
create policy "program_covers_update_own" on storage.objects
for update to authenticated
using (
  bucket_id = 'program-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'program-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "program_covers_delete_own" on storage.objects;
create policy "program_covers_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'program-covers'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
