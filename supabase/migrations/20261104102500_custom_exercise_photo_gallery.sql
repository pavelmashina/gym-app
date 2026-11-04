-- Ordered, owner-private image gallery for personal exercise entries.
-- Idempotent backfill protects all legacy single-photo exercises.
alter table public.exercises
  add column if not exists photo_paths text[] not null default array[]::text[];

update public.exercises
  set photo_paths = array[photo_path]
  where photo_path is not null and cardinality(photo_paths) = 0;
