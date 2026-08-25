-- Actual workout execution layer.
-- ScheduledWorkout is the immutable plan; WorkoutSession is the user's real execution snapshot.

create table if not exists public.workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  scheduled_workout_id uuid not null references public.scheduled_workouts(id) on delete restrict,
  status text not null default 'active' check (status in ('active','completed','abandoned')),
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  active_duration_seconds integer not null default 0 check (active_duration_seconds >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists workout_sessions_one_active_per_user_idx
  on public.workout_sessions (user_id) where status = 'active';
create unique index if not exists workout_sessions_one_live_or_completed_per_schedule_idx
  on public.workout_sessions (scheduled_workout_id) where status in ('active','completed');
create index if not exists workout_sessions_user_started_idx
  on public.workout_sessions (user_id, started_at desc);

create table if not exists public.workout_session_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references public.workout_sessions(id) on delete cascade,
  source_scheduled_workout_exercise_id uuid references public.scheduled_workout_exercises(id) on delete set null,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  position smallint not null check (position > 0),
  note text,
  unique (workout_session_id, position)
);

create index if not exists workout_session_exercises_session_idx
  on public.workout_session_exercises (workout_session_id, position);
create index if not exists workout_session_exercises_exercise_idx
  on public.workout_session_exercises (exercise_id);
create index if not exists workout_session_exercises_source_idx
  on public.workout_session_exercises (source_scheduled_workout_exercise_id);

create table if not exists public.performed_sets (
  id uuid primary key default gen_random_uuid(),
  workout_session_exercise_id uuid not null references public.workout_session_exercises(id) on delete cascade,
  source_scheduled_set_id uuid references public.scheduled_sets(id) on delete set null,
  set_number smallint not null check (set_number > 0),
  set_type text not null default 'working' check (set_type in ('working','warmup')),
  planned_reps smallint check (planned_reps is null or planned_reps between 1 and 999),
  weight numeric(8,2) check (weight is null or weight between 0 and 10000),
  reps smallint check (reps is null or reps between 1 and 999),
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (workout_session_exercise_id, set_number),
  check (not completed or reps is not null)
);

create index if not exists performed_sets_exercise_idx
  on public.performed_sets (workout_session_exercise_id, set_number);
create index if not exists performed_sets_source_idx
  on public.performed_sets (source_scheduled_set_id);

alter table public.workout_sessions enable row level security;
alter table public.workout_session_exercises enable row level security;
alter table public.performed_sets enable row level security;

revoke all on table public.workout_sessions from anon, authenticated;
revoke all on table public.workout_session_exercises from anon, authenticated;
revoke all on table public.performed_sets from anon, authenticated;
grant select, insert, update, delete on table public.workout_sessions to authenticated;
grant select, insert, update, delete on table public.workout_session_exercises to authenticated;
grant select, insert, update, delete on table public.performed_sets to authenticated;

create policy workout_sessions_select_own on public.workout_sessions for select to authenticated
using ((select auth.uid()) = user_id);
create policy workout_sessions_insert_own on public.workout_sessions for insert to authenticated
with check ((select auth.uid()) = user_id);
create policy workout_sessions_update_own on public.workout_sessions for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy workout_sessions_delete_own on public.workout_sessions for delete to authenticated
using ((select auth.uid()) = user_id);

create policy workout_session_exercises_select_own on public.workout_session_exercises for select to authenticated
using (exists (select 1 from public.workout_sessions ws where ws.id = workout_session_exercises.workout_session_id and ws.user_id = (select auth.uid())));
create policy workout_session_exercises_insert_own on public.workout_session_exercises for insert to authenticated
with check (exists (select 1 from public.workout_sessions ws where ws.id = workout_session_exercises.workout_session_id and ws.user_id = (select auth.uid())));
create policy workout_session_exercises_update_own on public.workout_session_exercises for update to authenticated
using (exists (select 1 from public.workout_sessions ws where ws.id = workout_session_exercises.workout_session_id and ws.user_id = (select auth.uid())))
with check (exists (select 1 from public.workout_sessions ws where ws.id = workout_session_exercises.workout_session_id and ws.user_id = (select auth.uid())));
create policy workout_session_exercises_delete_own on public.workout_session_exercises for delete to authenticated
using (exists (select 1 from public.workout_sessions ws where ws.id = workout_session_exercises.workout_session_id and ws.user_id = (select auth.uid())));

create policy performed_sets_select_own on public.performed_sets for select to authenticated
using (exists (select 1 from public.workout_session_exercises wse join public.workout_sessions ws on ws.id = wse.workout_session_id where wse.id = performed_sets.workout_session_exercise_id and ws.user_id = (select auth.uid())));
create policy performed_sets_insert_own on public.performed_sets for insert to authenticated
with check (exists (select 1 from public.workout_session_exercises wse join public.workout_sessions ws on ws.id = wse.workout_session_id where wse.id = performed_sets.workout_session_exercise_id and ws.user_id = (select auth.uid())));
create policy performed_sets_update_own on public.performed_sets for update to authenticated
using (exists (select 1 from public.workout_session_exercises wse join public.workout_sessions ws on ws.id = wse.workout_session_id where wse.id = performed_sets.workout_session_exercise_id and ws.user_id = (select auth.uid())))
with check (exists (select 1 from public.workout_session_exercises wse join public.workout_sessions ws on ws.id = wse.workout_session_id where wse.id = performed_sets.workout_session_exercise_id and ws.user_id = (select auth.uid())));
create policy performed_sets_delete_own on public.performed_sets for delete to authenticated
using (exists (select 1 from public.workout_session_exercises wse join public.workout_sessions ws on ws.id = wse.workout_session_id where wse.id = performed_sets.workout_session_exercise_id and ws.user_id = (select auth.uid())));

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
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  select sw.id, sw.status into v_scheduled
  from public.scheduled_workouts sw
  join public.user_programs up on up.id = sw.user_program_id
  where sw.id = p_scheduled_workout_id and up.user_id = v_user_id;
  if v_scheduled.id is null then raise exception 'Scheduled workout not found or access denied' using errcode = 'P0002'; end if;

  select ws.id into v_session_id from public.workout_sessions ws
  where ws.user_id = v_user_id and ws.scheduled_workout_id = p_scheduled_workout_id and ws.status = 'active' limit 1;
  if v_session_id is not null then return v_session_id; end if;

  if exists (select 1 from public.workout_sessions ws where ws.user_id = v_user_id and ws.status = 'active') then
    raise exception 'Another workout is already active' using errcode = '23505';
  end if;
  if v_scheduled.status = 'completed' or exists (select 1 from public.workout_sessions ws where ws.user_id = v_user_id and ws.scheduled_workout_id = p_scheduled_workout_id and ws.status = 'completed') then
    raise exception 'Workout is already completed' using errcode = '23505';
  end if;
  if v_scheduled.status = 'cancelled' then raise exception 'Cancelled workout cannot be started' using errcode = '22023'; end if;

  insert into public.workout_sessions (user_id, scheduled_workout_id, status)
  values (v_user_id, p_scheduled_workout_id, 'active') returning id into v_session_id;

  for v_exercise in
    select swe.id as source_id, swe.exercise_id, swe.position
    from public.scheduled_workout_exercises swe
    where swe.scheduled_workout_id = p_scheduled_workout_id order by swe.position
  loop
    insert into public.workout_session_exercises (workout_session_id, source_scheduled_workout_exercise_id, exercise_id, position)
    values (v_session_id, v_exercise.source_id, v_exercise.exercise_id, v_exercise.position)
    returning id into v_session_exercise_id;

    for v_set in
      select ss.id as source_id, ss.set_number, ss.planned_reps
      from public.scheduled_sets ss
      where ss.scheduled_workout_exercise_id = v_exercise.source_id order by ss.set_number
    loop
      insert into public.performed_sets (workout_session_exercise_id, source_scheduled_set_id, set_number, set_type, planned_reps, reps)
      values (v_session_exercise_id, v_set.source_id, v_set.set_number, 'working', v_set.planned_reps, v_set.planned_reps);
    end loop;
  end loop;

  return v_session_id;
end;
$$;

create or replace function public.complete_workout(p_workout_session_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_scheduled_workout_id uuid;
  v_user_program_id uuid;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  update public.workout_sessions ws
  set status = 'completed', ended_at = now(),
      active_duration_seconds = greatest(ws.active_duration_seconds, floor(extract(epoch from (now() - ws.started_at)))::integer),
      updated_at = now()
  where ws.id = p_workout_session_id and ws.user_id = v_user_id and ws.status = 'active'
  returning ws.scheduled_workout_id into v_scheduled_workout_id;
  if v_scheduled_workout_id is null then raise exception 'Active workout session not found or access denied' using errcode = 'P0002'; end if;

  update public.scheduled_workouts sw set status = 'completed'
  where sw.id = v_scheduled_workout_id returning sw.user_program_id into v_user_program_id;

  if v_user_program_id is not null and not exists (
    select 1 from public.scheduled_workouts sw where sw.user_program_id = v_user_program_id and sw.status = 'scheduled'
  ) then
    update public.user_programs up
    set status = 'completed', completed_at = now(), updated_at = now()
    where up.id = v_user_program_id and up.user_id = v_user_id and up.status in ('active','paused');
  end if;

  return p_workout_session_id;
end;
$$;

revoke all on function public.start_workout(uuid) from public, anon;
revoke all on function public.complete_workout(uuid) from public, anon;
grant execute on function public.start_workout(uuid) to authenticated;
grant execute on function public.complete_workout(uuid) to authenticated;
