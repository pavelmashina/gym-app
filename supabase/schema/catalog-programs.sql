-- Read-only published program catalog imported from structured source files.
-- Catalog rows are shared content; user-created programs remain in public.programs.

create table if not exists public.catalog_programs (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  description text,
  categories text[] not null default '{}'::text[],
  training_place text,
  level text,
  week_count smallint not null default 1 check (week_count between 1 and 52),
  workout_count smallint not null default 0 check (workout_count between 0 and 200),
  source_key text not null unique,
  source_file text,
  source_sheet text,
  source_payload jsonb not null default '{}'::jsonb,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists catalog_programs_published_name_idx
  on public.catalog_programs (published, name);
create index if not exists catalog_programs_training_place_idx
  on public.catalog_programs (training_place);
create index if not exists catalog_programs_categories_idx
  on public.catalog_programs using gin (categories);

alter table public.catalog_programs enable row level security;

revoke all on table public.catalog_programs from anon, authenticated;
grant select on table public.catalog_programs to authenticated;
grant all on table public.catalog_programs to service_role;

drop policy if exists catalog_programs_select_published on public.catalog_programs;
create policy catalog_programs_select_published
on public.catalog_programs
for select
to authenticated
using (published = true);
