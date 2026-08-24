-- User program enrollment and immutable scheduled-workout snapshots.
-- Program remains a reusable template. UserProgram is created only when a user chooses a start date.

create table if not exists public.user_programs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  program_id uuid not null references public.programs(id) on delete restrict,
  status text not null default 'active' check (status in ('active','paused','completed','abandoned')),
  start_date date not null,
  joined_at timestamptz not null default now(),
  paused_at timestamptz,
  completed_at timestamptz,
  updated_at timestamptz not null default now()
);

create unique index if not exists user_programs_one_live_idx
  on public.user_programs (user_id, program_id)
  where status in ('active','paused');
create index if not exists user_programs_user_status_idx
  on public.user_programs (user_id, status, start_date);
create index if not exists user_programs_program_idx
  on public.user_programs (program_id);

create table if not exists public.scheduled_workouts (
  id uuid primary key default gen_random_uuid(),
  user_program_id uuid not null references public.user_programs(id) on delete cascade,
  source_program_workout_id uuid references public.program_workouts(id) on delete set null,
  sequence_number smallint not null check (sequence_number > 0),
  week_number smallint not null check (week_number between 1 and 52),
  workout_name text not null check (char_length(workout_name) between 1 and 80),
  scheduled_date date not null,
  status text not null default 'scheduled' check (status in ('scheduled','completed','skipped','cancelled')),
  created_at timestamptz not null default now(),
  unique (user_program_id, sequence_number)
);
create index if not exists scheduled_workouts_user_program_date_idx
  on public.scheduled_workouts (user_program_id, scheduled_date, sequence_number);
create index if not exists scheduled_workouts_date_status_idx
  on public.scheduled_workouts (scheduled_date, status);

create table if not exists public.scheduled_workout_exercises (
  id uuid primary key default gen_random_uuid(),
  scheduled_workout_id uuid not null references public.scheduled_workouts(id) on delete cascade,
  source_program_workout_exercise_id uuid references public.program_workout_exercises(id) on delete set null,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position smallint not null check (position > 0),
  unique (scheduled_workout_id, position)
);
create index if not exists scheduled_workout_exercises_workout_idx
  on public.scheduled_workout_exercises (scheduled_workout_id);
create index if not exists scheduled_workout_exercises_exercise_idx
  on public.scheduled_workout_exercises (exercise_id);

create table if not exists public.scheduled_sets (
  id uuid primary key default gen_random_uuid(),
  scheduled_workout_exercise_id uuid not null references public.scheduled_workout_exercises(id) on delete cascade,
  set_number smallint not null check (set_number > 0),
  planned_reps smallint check (planned_reps is null or planned_reps between 1 and 999),
  unique (scheduled_workout_exercise_id, set_number)
);
create index if not exists scheduled_sets_exercise_idx
  on public.scheduled_sets (scheduled_workout_exercise_id);

alter table public.user_programs enable row level security;
alter table public.scheduled_workouts enable row level security;
alter table public.scheduled_workout_exercises enable row level security;
alter table public.scheduled_sets enable row level security;

revoke all on table public.user_programs from anon, authenticated;
revoke all on table public.scheduled_workouts from anon, authenticated;
revoke all on table public.scheduled_workout_exercises from anon, authenticated;
revoke all on table public.scheduled_sets from anon, authenticated;
grant select, insert, update, delete on table public.user_programs to authenticated;
grant select, insert, update, delete on table public.scheduled_workouts to authenticated;
grant select, insert, update, delete on table public.scheduled_workout_exercises to authenticated;
grant select, insert, update, delete on table public.scheduled_sets to authenticated;

drop policy if exists user_programs_select_own on public.user_programs;
create policy user_programs_select_own on public.user_programs for select to authenticated
using ((select auth.uid()) = user_id);
drop policy if exists user_programs_insert_own on public.user_programs;
create policy user_programs_insert_own on public.user_programs for insert to authenticated
with check ((select auth.uid()) = user_id);
drop policy if exists user_programs_update_own on public.user_programs;
create policy user_programs_update_own on public.user_programs for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);
drop policy if exists user_programs_delete_own on public.user_programs;
create policy user_programs_delete_own on public.user_programs for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists scheduled_workouts_select_own on public.scheduled_workouts;
create policy scheduled_workouts_select_own on public.scheduled_workouts for select to authenticated
using (exists (
  select 1 from public.user_programs up
  where up.id = scheduled_workouts.user_program_id
    and up.user_id = (select auth.uid())
));
drop policy if exists scheduled_workouts_insert_own on public.scheduled_workouts;
create policy scheduled_workouts_insert_own on public.scheduled_workouts for insert to authenticated
with check (exists (
  select 1 from public.user_programs up
  where up.id = scheduled_workouts.user_program_id
    and up.user_id = (select auth.uid())
));
drop policy if exists scheduled_workouts_update_own on public.scheduled_workouts;
create policy scheduled_workouts_update_own on public.scheduled_workouts for update to authenticated
using (exists (
  select 1 from public.user_programs up
  where up.id = scheduled_workouts.user_program_id
    and up.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.user_programs up
  where up.id = scheduled_workouts.user_program_id
    and up.user_id = (select auth.uid())
));
drop policy if exists scheduled_workouts_delete_own on public.scheduled_workouts;
create policy scheduled_workouts_delete_own on public.scheduled_workouts for delete to authenticated
using (exists (
  select 1 from public.user_programs up
  where up.id = scheduled_workouts.user_program_id
    and up.user_id = (select auth.uid())
));

drop policy if exists scheduled_workout_exercises_select_own on public.scheduled_workout_exercises;
create policy scheduled_workout_exercises_select_own on public.scheduled_workout_exercises for select to authenticated
using (exists (
  select 1 from public.scheduled_workouts sw
  join public.user_programs up on up.id = sw.user_program_id
  where sw.id = scheduled_workout_exercises.scheduled_workout_id
    and up.user_id = (select auth.uid())
));
drop policy if exists scheduled_workout_exercises_insert_own on public.scheduled_workout_exercises;
create policy scheduled_workout_exercises_insert_own on public.scheduled_workout_exercises for insert to authenticated
with check (exists (
  select 1 from public.scheduled_workouts sw
  join public.user_programs up on up.id = sw.user_program_id
  where sw.id = scheduled_workout_exercises.scheduled_workout_id
    and up.user_id = (select auth.uid())
));
drop policy if exists scheduled_workout_exercises_update_own on public.scheduled_workout_exercises;
create policy scheduled_workout_exercises_update_own on public.scheduled_workout_exercises for update to authenticated
using (exists (
  select 1 from public.scheduled_workouts sw
  join public.user_programs up on up.id = sw.user_program_id
  where sw.id = scheduled_workout_exercises.scheduled_workout_id
    and up.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.scheduled_workouts sw
  join public.user_programs up on up.id = sw.user_program_id
  where sw.id = scheduled_workout_exercises.scheduled_workout_id
    and up.user_id = (select auth.uid())
));
drop policy if exists scheduled_workout_exercises_delete_own on public.scheduled_workout_exercises;
create policy scheduled_workout_exercises_delete_own on public.scheduled_workout_exercises for delete to authenticated
using (exists (
  select 1 from public.scheduled_workouts sw
  join public.user_programs up on up.id = sw.user_program_id
  where sw.id = scheduled_workout_exercises.scheduled_workout_id
    and up.user_id = (select auth.uid())
));

drop policy if exists scheduled_sets_select_own on public.scheduled_sets;
create policy scheduled_sets_select_own on public.scheduled_sets for select to authenticated
using (exists (
  select 1 from public.scheduled_workout_exercises swe
  join public.scheduled_workouts sw on sw.id = swe.scheduled_workout_id
  join public.user_programs up on up.id = sw.user_program_id
  where swe.id = scheduled_sets.scheduled_workout_exercise_id
    and up.user_id = (select auth.uid())
));
drop policy if exists scheduled_sets_insert_own on public.scheduled_sets;
create policy scheduled_sets_insert_own on public.scheduled_sets for insert to authenticated
with check (exists (
  select 1 from public.scheduled_workout_exercises swe
  join public.scheduled_workouts sw on sw.id = swe.scheduled_workout_id
  join public.user_programs up on up.id = sw.user_program_id
  where swe.id = scheduled_sets.scheduled_workout_exercise_id
    and up.user_id = (select auth.uid())
));
drop policy if exists scheduled_sets_update_own on public.scheduled_sets;
create policy scheduled_sets_update_own on public.scheduled_sets for update to authenticated
using (exists (
  select 1 from public.scheduled_workout_exercises swe
  join public.scheduled_workouts sw on sw.id = swe.scheduled_workout_id
  join public.user_programs up on up.id = sw.user_program_id
  where swe.id = scheduled_sets.scheduled_workout_exercise_id
    and up.user_id = (select auth.uid())
))
with check (exists (
  select 1 from public.scheduled_workout_exercises swe
  join public.scheduled_workouts sw on sw.id = swe.scheduled_workout_id
  join public.user_programs up on up.id = sw.user_program_id
  where swe.id = scheduled_sets.scheduled_workout_exercise_id
    and up.user_id = (select auth.uid())
));
drop policy if exists scheduled_sets_delete_own on public.scheduled_sets;
create policy scheduled_sets_delete_own on public.scheduled_sets for delete to authenticated
using (exists (
  select 1 from public.scheduled_workout_exercises swe
  join public.scheduled_workouts sw on sw.id = swe.scheduled_workout_id
  join public.user_programs up on up.id = sw.user_program_id
  where swe.id = scheduled_sets.scheduled_workout_exercise_id
    and up.user_id = (select auth.uid())
));

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
