-- Private photo storage for user-created exercise cards.
-- Applied to live Supabase as migration custom_exercise_photos.
alter table public.exercises add column if not exists photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('exercise-photos', 'exercise-photos', false, 8388608, array['image/jpeg','image/png','image/webp']::text[])
on conflict(id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "exercise_photos_select_own" on storage.objects;
create policy "exercise_photos_select_own" on storage.objects
for select to authenticated
using (bucket_id = 'exercise-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "exercise_photos_insert_own" on storage.objects;
create policy "exercise_photos_insert_own" on storage.objects
for insert to authenticated
with check (bucket_id = 'exercise-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

drop policy if exists "exercise_photos_delete_own" on storage.objects;
create policy "exercise_photos_delete_own" on storage.objects
for delete to authenticated
using (bucket_id = 'exercise-photos' and (storage.foldername(name))[1] = (select auth.uid())::text);

-- Ordered gallery; preserve previous single-photo assets as the first slide.
alter table public.exercises
  add column if not exists photo_paths text[] not null default array[]::text[];
update public.exercises set photo_paths=array[photo_path]
  where photo_path is not null and cardinality(photo_paths)=0;
