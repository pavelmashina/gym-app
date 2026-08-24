-- Recovery baseline for the pre-migration public.exercises table.
-- Exercise data is imported separately; this file captures structure/security only.

create table if not exists public.exercises (
  id uuid primary key default gen_random_uuid(),
  muscle_group text not null,
  target_muscle text,
  synergists text,
  exercise_type text not null,
  difficulty smallint check (difficulty is null or difficulty between 1 and 3),
  movement_type text not null,
  name text not null unique,
  technique text,
  notes text,
  source_sheet text not null default 'Зал',
  source_row integer,
  created_at timestamptz not null default now()
);

alter table public.exercises enable row level security;

revoke all on table public.exercises from anon, authenticated;
grant select on table public.exercises to authenticated;
grant all on table public.exercises to service_role;

drop policy if exists exercises_authenticated_read on public.exercises;
create policy exercises_authenticated_read
on public.exercises
for select
to authenticated
using (true);
