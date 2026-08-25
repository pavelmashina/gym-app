-- Canonical schema for reusable program templates.
-- Mirrors the live Supabase project as of 2026-08-25.

create table if not exists public.programs (
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
  status text not null default 'active'
    check (status in ('draft','active','archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  schedule_mode text not null default 'custom'
    check (schedule_mode in ('custom','weekly_mwf','weekly_tts','cycle_2_2'))
);

create index if not exists programs_owner_updated_idx
  on public.programs (owner_id, updated_at desc);

create table if not exists public.program_weeks (
  id uuid primary key default gen_random_uuid(),
  program_id uuid not null references public.programs(id) on delete cascade,
  week_number smallint not null check (week_number between 1 and 52),
  position smallint not null check (position > 0),
  unique (program_id, week_number),
  unique (program_id, position)
);

create index if not exists program_weeks_program_idx
  on public.program_weeks (program_id, position);

create table if not exists public.program_workouts (
  id uuid primary key default gen_random_uuid(),
  week_id uuid not null references public.program_weeks(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 80),
  position smallint not null check (position > 0),
  rest_days_after smallint not null default 1
    check (rest_days_after between 0 and 30),
  unique (week_id, position)
);

create index if not exists program_workouts_week_idx
  on public.program_workouts (week_id, position);

create table if not exists public.program_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_id uuid not null references public.program_workouts(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position smallint not null check (position > 0),
  unique (workout_id, exercise_id),
  unique (workout_id, position)
);

create index if not exists program_workout_exercises_workout_idx
  on public.program_workout_exercises (workout_id, position);
create index if not exists program_workout_exercises_exercise_idx
  on public.program_workout_exercises (exercise_id);

create table if not exists public.program_exercise_sets (
  id uuid primary key default gen_random_uuid(),
  workout_exercise_id uuid not null references public.program_workout_exercises(id) on delete cascade,
  set_number smallint not null check (set_number > 0),
  reps smallint check (reps is null or reps between 1 and 999),
  unique (workout_exercise_id, set_number)
);

create index if not exists program_exercise_sets_exercise_idx
  on public.program_exercise_sets (workout_exercise_id, set_number);

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

grant all on table public.programs to service_role;
grant all on table public.program_weeks to service_role;
grant all on table public.program_workouts to service_role;
grant all on table public.program_workout_exercises to service_role;
grant all on table public.program_exercise_sets to service_role;

-- programs: direct ownership

drop policy if exists "programs_select_own" on public.programs;
create policy "programs_select_own" on public.programs
for select to authenticated
using ((select auth.uid()) = owner_id);

drop policy if exists "programs_insert_own" on public.programs;
create policy "programs_insert_own" on public.programs
for insert to authenticated
with check ((select auth.uid()) = owner_id);

drop policy if exists "programs_update_own" on public.programs;
create policy "programs_update_own" on public.programs
for update to authenticated
using ((select auth.uid()) = owner_id)
with check ((select auth.uid()) = owner_id);

drop policy if exists "programs_delete_own" on public.programs;
create policy "programs_delete_own" on public.programs
for delete to authenticated
using ((select auth.uid()) = owner_id);

-- program_weeks: ownership inherited through programs

drop policy if exists "program_weeks_select_own" on public.program_weeks;
create policy "program_weeks_select_own" on public.program_weeks
for select to authenticated
using (exists (
  select 1 from public.programs p
  where p.id = program_weeks.program_id
    and p.owner_id = (select auth.uid())
));

drop policy if exists "program_weeks_insert_own" on public.program_weeks;
create policy "program_weeks_insert_own" on public.program_weeks
for insert to authenticated
with check (exists (
  select 1 from public.programs p
  where p.id = program_weeks.program_id
    and p.owner_id = (select auth.uid())
));

drop policy if exists "program_weeks_update_own" on public.program_weeks;
create policy "program_weeks_update_own" on public.program_weeks
for update to authenticated
using (exists (
  select 1 from public.programs p
  where p.id = program_weeks.program_id
    and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1 from public.programs p
  where p.id = program_weeks.program_id
    and p.owner_id = (select auth.uid())
));

drop policy if exists "program_weeks_delete_own" on public.program_weeks;
create policy "program_weeks_delete_own" on public.program_weeks
for delete to authenticated
using (exists (
  select 1 from public.programs p
  where p.id = program_weeks.program_id
    and p.owner_id = (select auth.uid())
));

-- program_workouts: ownership inherited through week -> program

drop policy if exists "program_workouts_select_own" on public.program_workouts;
create policy "program_workouts_select_own" on public.program_workouts
for select to authenticated
using (exists (
  select 1
  from public.program_weeks pw
  join public.programs p on p.id = pw.program_id
  where pw.id = program_workouts.week_id
    and p.owner_id = (select auth.uid())
));

drop policy if exists "program_workouts_insert_own" on public.program_workouts;
create policy "program_workouts_insert_own" on public.program_workouts
for insert to authenticated
with check (exists (
  select 1
  from public.program_weeks pw
  join public.programs p on p.id = pw.program_id
  where pw.id = program_workouts.week_id
    and p.owner_id = (select auth.uid())
));

drop policy if exists "program_workouts_update_own" on public.program_workouts;
create policy "program_workouts_update_own" on public.program_workouts
for update to authenticated
using (exists (
  select 1
  from public.program_weeks pw
  join public.programs p on p.id = pw.program_id
  where pw.id = program_workouts.week_id
    and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1
  from public.program_weeks pw
  join public.programs p on p.id = pw.program_id
  where pw.id = program_workouts.week_id
    and p.owner_id = (select auth.uid())
));

drop policy if exists "program_workouts_delete_own" on public.program_workouts;
create policy "program_workouts_delete_own" on public.program_workouts
for delete to authenticated
using (exists (
  select 1
  from public.program_weeks pw
  join public.programs p on p.id = pw.program_id
  where pw.id = program_workouts.week_id
    and p.owner_id = (select auth.uid())
));

-- program_workout_exercises: ownership inherited through workout -> week -> program

drop policy if exists "program_workout_exercises_select_own" on public.program_workout_exercises;
create policy "program_workout_exercises_select_own" on public.program_workout_exercises
for select to authenticated
using (exists (
  select 1
  from public.program_workouts w
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where w.id = program_workout_exercises.workout_id
    and p.owner_id = (select auth.uid())
));

drop policy if exists "program_workout_exercises_insert_own" on public.program_workout_exercises;
create policy "program_workout_exercises_insert_own" on public.program_workout_exercises
for insert to authenticated
with check (exists (
  select 1
  from public.program_workouts w
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where w.id = program_workout_exercises.workout_id
    and p.owner_id = (select auth.uid())
));

drop policy if exists "program_workout_exercises_update_own" on public.program_workout_exercises;
create policy "program_workout_exercises_update_own" on public.program_workout_exercises
for update to authenticated
using (exists (
  select 1
  from public.program_workouts w
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where w.id = program_workout_exercises.workout_id
    and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1
  from public.program_workouts w
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where w.id = program_workout_exercises.workout_id
    and p.owner_id = (select auth.uid())
));

drop policy if exists "program_workout_exercises_delete_own" on public.program_workout_exercises;
create policy "program_workout_exercises_delete_own" on public.program_workout_exercises
for delete to authenticated
using (exists (
  select 1
  from public.program_workouts w
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where w.id = program_workout_exercises.workout_id
    and p.owner_id = (select auth.uid())
));

-- program_exercise_sets: ownership inherited through exercise -> workout -> week -> program

drop policy if exists "program_exercise_sets_select_own" on public.program_exercise_sets;
create policy "program_exercise_sets_select_own" on public.program_exercise_sets
for select to authenticated
using (exists (
  select 1
  from public.program_workout_exercises pwe
  join public.program_workouts w on w.id = pwe.workout_id
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where pwe.id = program_exercise_sets.workout_exercise_id
    and p.owner_id = (select auth.uid())
));

drop policy if exists "program_exercise_sets_insert_own" on public.program_exercise_sets;
create policy "program_exercise_sets_insert_own" on public.program_exercise_sets
for insert to authenticated
with check (exists (
  select 1
  from public.program_workout_exercises pwe
  join public.program_workouts w on w.id = pwe.workout_id
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where pwe.id = program_exercise_sets.workout_exercise_id
    and p.owner_id = (select auth.uid())
));

drop policy if exists "program_exercise_sets_update_own" on public.program_exercise_sets;
create policy "program_exercise_sets_update_own" on public.program_exercise_sets
for update to authenticated
using (exists (
  select 1
  from public.program_workout_exercises pwe
  join public.program_workouts w on w.id = pwe.workout_id
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where pwe.id = program_exercise_sets.workout_exercise_id
    and p.owner_id = (select auth.uid())
))
with check (exists (
  select 1
  from public.program_workout_exercises pwe
  join public.program_workouts w on w.id = pwe.workout_id
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where pwe.id = program_exercise_sets.workout_exercise_id
    and p.owner_id = (select auth.uid())
));

drop policy if exists "program_exercise_sets_delete_own" on public.program_exercise_sets;
create policy "program_exercise_sets_delete_own" on public.program_exercise_sets
for delete to authenticated
using (exists (
  select 1
  from public.program_workout_exercises pwe
  join public.program_workouts w on w.id = pwe.workout_id
  join public.program_weeks pw on pw.id = w.week_id
  join public.programs p on p.id = pw.program_id
  where pwe.id = program_exercise_sets.workout_exercise_id
    and p.owner_id = (select auth.uid())
));
