-- User-specific exercise-library data used by the application.
-- Includes cross-device recent exercises and private user exercise videos.

create table if not exists public.user_recent_exercises (
  user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  last_used_at timestamptz not null default now(),
  primary key (user_id, exercise_id)
);

create index if not exists user_recent_exercises_user_last_used_idx
  on public.user_recent_exercises (user_id, last_used_at desc);

alter table public.user_recent_exercises enable row level security;

revoke all on table public.user_recent_exercises from anon, authenticated;
grant select, insert, update, delete on table public.user_recent_exercises to authenticated;
grant all on table public.user_recent_exercises to service_role;

drop policy if exists "user_recent_exercises_select_own" on public.user_recent_exercises;
create policy "user_recent_exercises_select_own"
on public.user_recent_exercises
for select
to authenticated
using (user_id = auth.uid());

drop policy if exists "user_recent_exercises_insert_own" on public.user_recent_exercises;
create policy "user_recent_exercises_insert_own"
on public.user_recent_exercises
for insert
to authenticated
with check (user_id = auth.uid());

drop policy if exists "user_recent_exercises_update_own" on public.user_recent_exercises;
create policy "user_recent_exercises_update_own"
on public.user_recent_exercises
for update
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists "user_recent_exercises_delete_own" on public.user_recent_exercises;
create policy "user_recent_exercises_delete_own"
on public.user_recent_exercises
for delete
to authenticated
using (user_id = auth.uid());

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'exercise-videos',
  'exercise-videos',
  false,
  104857600,
  array['video/mp4', 'video/webm', 'video/quicktime']::text[]
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "exercise_videos_select_own" on storage.objects;
create policy "exercise_videos_select_own"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'exercise-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "exercise_videos_insert_own" on storage.objects;
create policy "exercise_videos_insert_own"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'exercise-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "exercise_videos_update_own" on storage.objects;
create policy "exercise_videos_update_own"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'exercise-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'exercise-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

drop policy if exists "exercise_videos_delete_own" on storage.objects;
create policy "exercise_videos_delete_own"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'exercise-videos'
  and (storage.foldername(name))[1] = auth.uid()::text
);
