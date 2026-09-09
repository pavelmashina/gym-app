-- Private profile avatars. Paths are always scoped to the authenticated user: <user_id>/...

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'account-avatars',
  'account-avatars',
  false,
  8388608,
  array['image/jpeg','image/png','image/webp','image/heic','image/heif']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "account_avatars_select_own" on storage.objects;
create policy "account_avatars_select_own" on storage.objects
for select to authenticated
using (
  bucket_id = 'account-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "account_avatars_insert_own" on storage.objects;
create policy "account_avatars_insert_own" on storage.objects
for insert to authenticated
with check (
  bucket_id = 'account-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "account_avatars_update_own" on storage.objects;
create policy "account_avatars_update_own" on storage.objects
for update to authenticated
using (
  bucket_id = 'account-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'account-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "account_avatars_delete_own" on storage.objects;
create policy "account_avatars_delete_own" on storage.objects
for delete to authenticated
using (
  bucket_id = 'account-avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);
