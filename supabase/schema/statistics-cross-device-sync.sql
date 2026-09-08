create table if not exists public.user_statistics_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  client_id text not null,
  measured_on date not null,
  weight numeric,
  waist numeric,
  chest numeric,
  glutes numeric,
  thighs numeric,
  arm numeric,
  shoulders numeric,
  neck numeric,
  calf numeric,
  forearm numeric,
  created_at timestamptz not null default now()
);

create index if not exists user_statistics_measurements_user_date_idx
  on public.user_statistics_measurements(user_id, measured_on desc);
create unique index if not exists user_statistics_measurements_user_client_idx
  on public.user_statistics_measurements(user_id, client_id);

alter table public.user_statistics_measurements enable row level security;
drop policy if exists "Users manage own statistics measurements" on public.user_statistics_measurements;
create policy "Users manage own statistics measurements"
  on public.user_statistics_measurements
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.user_statistics_photos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  taken_on date not null,
  angle text not null check (angle in ('front', 'back', 'side')),
  image_data text not null,
  created_at timestamptz not null default now(),
  unique(user_id, taken_on, angle)
);

create index if not exists user_statistics_photos_user_date_idx
  on public.user_statistics_photos(user_id, taken_on desc);

alter table public.user_statistics_photos enable row level security;
drop policy if exists "Users manage own statistics photos" on public.user_statistics_photos;
create policy "Users manage own statistics photos"
  on public.user_statistics_photos
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table if not exists public.user_statistics_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  favorites text[] not null default '{}',
  updated_at timestamptz not null default now()
);

alter table public.user_statistics_preferences enable row level security;
drop policy if exists "Users manage own statistics preferences" on public.user_statistics_preferences;
create policy "Users manage own statistics preferences"
  on public.user_statistics_preferences
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
