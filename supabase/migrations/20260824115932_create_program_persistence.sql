create table public.programs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  description text,
  week_count smallint not null check (week_count between 1 and 52),
  categories text[] not null default '{}'::text[],
  training_place text,
  equipment text,
  level text,
  cover_path text,
  status text not null default 'active' check (status in ('draft', 'active', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index programs_owner_updated_idx on public.programs (owner_id, updated_at desc);

create table public.program_weeks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 52),
  position smallint not null check (position > 0),
  unique (program_id, week_number),
  unique (program_id, position)
);

create index program_weeks_program_idx on public.program_weeks (program_id, position);

create table public.program_workouts (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.program_weeks(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  position smallint not null check (position > 0),
  unique (week_id, position)
);

create index program_workouts_week_idx on public.program_workouts (week_id, position);

create table public.program_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.program_workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position smallint not null check (position > 0),
  unique (workout_id, position),
  unique (workout_id, exercise_id)
);

create index program_workout_exercises_workout_idx on public.program_workout_exercises (workout_id, position);
create index program_workout_exercises_exercise_idx on public.program_workout_exercises (exercise_id);

create table public.program_exercise_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.program_workout_exercises(id) on delete cascade,
  set_number smallint not null check (set_number > 0),
  reps smallint check (reps is null or reps between 1 and 999),
  unique (workout_exercise_id, set_number)
);

create index program_exercise_sets_exercise_idx on public.program_exercise_sets (workout_exercise_id, set_number);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger programs_set_updated_at
before update on public.programs
for each row execute function private.set_updated_at();

alter table public.programs enable row level security;
alter table public.program_weeks enable row level security;
alter table public.program_workouts enable row level security;
alter table public.program_workout_exercises enable row level security;
alter table public.program_exercise_sets enable row level security;

revoke all on table public.programs from anon, authenticated;
revoke all on table public.program_weeks from anon, authenticated;
revoke all on table public.program_workouts from anon, authenticated;
revoke all on table public.program_workout_exercises from anon, authenticated;
revoke all on table public.program_exercise_sets from anon, authenticated;

grant select, insert, update, delete on table public.programs to authenticated;
grant select, insert, update, delete on table public.program_weeks to authenticated;
grant select, insert, update, delete on table public.program_workouts to authenticated;
grant select, insert, update, delete on table public.program_workout_exercises to authenticated;
grant select, insert, update, delete on table public.program_exercise_sets to authenticated;

create policy programs_select_own on public.programs for select to authenticated
using ((select auth.uid()) = owner_id);
create policy programs_insert_own on public.programs for insert to authenticated
with check ((select auth.uid()) = owner_id);
create policy programs_update_own on public.programs for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);
create policy programs_delete_own on public.programs for delete to authenticated
using ((select auth.uid()) = owner_id);

create policy program_weeks_select_own on public.program_weeks for select to authenticated
using (exists (
  select 1 from public.programs p
  where p.id = program_weeks.program_id and p.owner_id = (select auth.uid())
));
create policy program_weeks_insert_own on public.program_weeks for insert to authenticated
with check (exists (
  select 1 from public.programs p
  where p.id = program_weeks.program_id and p.owner_id = (select auth.uid())
));
create policy program_weeks_update_own on public.program_weeks for update to authenticated
using (exists (
  select 1 from public.programs p
  where p.id = program_weeks.program_id and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.programs p
  where p.id = program_weeks.program_id and p.owner_id = (select auth.uid())
));
create policy program_weeks_delete_own on public.program_weeks for delete to authenticated
using (exists (
  select 1 from public.programs p
  where p.id = program_weeks.program_id and p.owner_id = (select auth.uid())
));

create policy program_workouts_select_own on public.program_workouts for select to authenticated
using (exists (
  select 1 from public.program_weeks pw
  join public.programs p on p.id = pw.program_id
  where pw.id = program_workouts.week_id and p.owner_id = (select auth.uid())
));
create policy program_workouts_insert_own on public.program_workouts for insert to authenticated
with check (exists (
  select 1 from public.program_weeks pw
  join public.programs p on p.id = pw.program_id
  where pw.id = program_workouts.week_id and p.owner_id = (select auth.uid())
));
create policy program_workouts_update_own on public.program_workouts for update to authenticated
using (exists (
  select 1 from public.program_weeks pw
  join public.programs p on p.id = pw.program_id
  where pw.id = program_workouts.week_id and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.program_weeks pw
  join public.programs p on p.id = pw.program_id
  where pw.id = program_workouts.week_id and p.owner_id = (select auth.uid())
));
create policy program_workouts_delete_own on public.program_workouts for delete to authenticated
using (exists (
  select 1 from public.program_weeks pw
  join public.programs p on p.id = pw.program_id
  where pw.id = program_workouts.week_id and p.owner_id = (select auth.uid())
));

create policy program_workout_exercises_select_own on public.program_workout_exercises for select to authenticated
using (exists (
  select 1 from public.program_workouts w
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where w.id = program_workout_exercises.workout_id and p.owner_id = (select auth.uid())
));
create policy program_workout_exercises_insert_own on public.program_workout_exercises for insert to authenticated
with check (exists (
  select 1 from public.program_workouts w
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where w.id = program_workout_exercises.workout_id and p.owner_id = (select auth.uid())
));
create policy program_workout_exercises_update_own on public.program_workout_exercises for update to authenticated
using (exists (
  select 1 from public.program_workouts w
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where w.id = program_workout_exercises.workout_id and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.program_workouts w
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where w.id = program_workout_exercises.workout_id and p.owner_id = (select auth.uid())
));
create policy program_workout_exercises_delete_own on public.program_workout_exercises for delete to authenticated
using (exists (
  select 1 from public.program_workouts w
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where w.id = program_workout_exercises.workout_id and p.owner_id = (select auth.uid())
));

create policy program_exercise_sets_select_own on public.program_exercise_sets for select to authenticated
using (exists (
  select 1 from public.program_workout_exercises pwe
  join public.program_workouts w on w.id = pwe.workout_id
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where pwe.id = program_exercise_sets.workout_exercise_id and p.owner_id = (select auth.uid())
));
create policy program_exercise_sets_insert_own on public.program_exercise_sets for insert to authenticated
with check (exists (
  select 1 from public.program_workout_exercises pwe
  join public.program_workouts w on w.id = pwe.workout_id
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where pwe.id = program_exercise_sets.workout_exercise_id and p.owner_id = (select auth.uid())
));
create policy program_exercise_sets_update_own on public.program_exercise_sets for update to authenticated
using (exists (
  select 1 from public.program_workout_exercises pwe
  join public.program_workouts w on w.id = pwe.workout_id
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where pwe.id = program_exercise_sets.workout_exercise_id and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.program_workout_exercises pwe
  join public.program_workouts w on w.id = pwe.workout_id
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where pwe.id = program_exercise_sets.workout_exercise_id and p.owner_id = (select auth.uid())
));
create policy program_exercise_sets_delete_own on public.program_exercise_sets for delete to authenticated
using (exists (
  select 1 from public.program_workout_exercises pwe
  join public.program_workouts w on w.id = pwe.workout_id
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where pwe.id = program_exercise_sets.workout_exercise_id and p.owner_id = (select auth.uid())
));

create or replace function public.create_program_with_structure(
  p_name text,
  p_description text,
  p_week_count smallint,
  p_categories text[],
  p_training_place text,
  p_equipment text,
  p_level text,
  p_structure jsonb
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_program_id uuid;
  v_week_id uuid;
  v_workout_id uuid;
  v_workout_exercise_id uuid;
  v_week jsonb;
  v_workout jsonb;
  v_exercise jsonb;
  v_set jsonb;
  v_week_position integer := 0;
  v_workout_position integer;
  v_exercise_position integer;
  v_set_position integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required';
  end if;

  if jsonb_typeof(p_structure) <> 'array' then
    raise exception 'Program structure must be a JSON array';
  end if;

  if jsonb_array_length(p_structure) <> p_week_count then
    raise exception 'Program week count does not match structure';
  end if;

  insert into public.programs (
    owner_id, name, description, week_count, categories,
    training_place, equipment, level, status
  )
  values (
    v_user_id,
    trim(p_name),
    nullif(trim(p_description), ''),
    p_week_count,
    coalesce(p_categories, '{}'::text[]),
    nullif(trim(p_training_place), ''),
    nullif(trim(p_equipment), ''),
    nullif(trim(p_level), ''),
    'active'
  )
  returning id into v_program_id;

  for v_week in select value from jsonb_array_elements(p_structure)
  loop
    v_week_position := v_week_position + 1;
    insert into public.program_weeks (program_id, week_number, position)
    values (
      v_program_id,
      coalesce((v_week ->> 'number')::smallint, v_week_position::smallint),
      v_week_position::smallint
    )
    returning id into v_week_id;

    v_workout_position := 0;
    for v_workout in select value from jsonb_array_elements(coalesce(v_week -> 'workouts', '[]'::jsonb))
    loop
      v_workout_position := v_workout_position + 1;
      insert into public.program_workouts (week_id, name, position)
      values (v_week_id, trim(v_workout ->> 'name'), v_workout_position::smallint)
      returning id into v_workout_id;

      v_exercise_position := 0;
      for v_exercise in select value from jsonb_array_elements(coalesce(v_workout -> 'exercises', '[]'::jsonb))
      loop
        v_exercise_position := v_exercise_position + 1;
        insert into public.program_workout_exercises (workout_id, exercise_id, position)
        values (
          v_workout_id,
          (v_exercise ->> 'id')::uuid,
          v_exercise_position::smallint
        )
        returning id into v_workout_exercise_id;

        v_set_position := 0;
        for v_set in select value from jsonb_array_elements(coalesce(v_exercise -> 'sets', '[]'::jsonb))
        loop
          v_set_position := v_set_position + 1;
          insert into public.program_exercise_sets (workout_exercise_id, set_number, reps)
          values (
            v_workout_exercise_id,
            v_set_position::smallint,
            case
              when nullif(trim(v_set ->> 'reps'), '') is null then null
              else (v_set ->> 'reps')::smallint
            end
          );
        end loop;
      end loop;
    end loop;
  end loop;

  return v_program_id;
end;
$$;

revoke all on function public.create_program_with_structure(text, text, smallint, text[], text, text, text, jsonb) from public;
revoke all on function public.create_program_with_structure(text, text, smallint, text[], text, text, text, jsonb) from anon;
grant execute on function public.create_program_with_structure(text, text, smallint, text[], text, text, text, jsonb) to authenticated;

revoke all on table public.profiles from anon, authenticated;
grant select, insert, update on table public.profiles to authenticated;

revoke all on table public.exercises from anon, authenticated;
grant select on table public.exercises to authenticated;
