-- Recovery baseline for the pre-migration public.user_exercises table.

create table if not exists public.user_exercises (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  muscle_group text not null,
  target_muscle text,
  synergists text,
  exercise_type text,
  difficulty smallint check (difficulty is null or difficulty between 1 and 3),
  movement_type text,
  name text not null,
  technique text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_exercises_user_id_idx
on public.user_exercises (user_id);

create unique index if not exists user_exercises_user_name_uidx
on public.user_exercises (user_id, lower(name));

alter table public.user_exercises enable row level security;

revoke all on table public.user_exercises from anon, authenticated;
grant select, insert, update, delete on table public.user_exercises to authenticated;
grant all on table public.user_exercises to service_role;

drop policy if exists user_exercises_select_own on public.user_exercises;
create policy user_exercises_select_own on public.user_exercises for select to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists user_exercises_insert_own on public.user_exercises;
create policy user_exercises_insert_own on public.user_exercises for insert to authenticated
with check ((select auth.uid()) = user_id);

drop policy if exists user_exercises_update_own on public.user_exercises;
create policy user_exercises_update_own on public.user_exercises for update to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

drop policy if exists user_exercises_delete_own on public.user_exercises;
create policy user_exercises_delete_own on public.user_exercises for delete to authenticated
using ((select auth.uid()) = user_id);
