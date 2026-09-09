-- Personal account profile fields.
-- Account deletion is handled by the authenticated `delete-account` Edge Function.

alter table public.profiles
  add column if not exists phone text,
  add column if not exists birth_date date,
  add column if not exists height_cm numeric(5,1),
  add column if not exists weight_kg numeric(6,1),
  add column if not exists sex text,
  add column if not exists activity_level text,
  add column if not exists avatar_url text,
  add column if not exists plan_code text not null default 'free';

alter table public.profiles
  drop constraint if exists profiles_height_cm_check,
  add constraint profiles_height_cm_check check (height_cm is null or (height_cm >= 80 and height_cm <= 260)),
  drop constraint if exists profiles_weight_kg_check,
  add constraint profiles_weight_kg_check check (weight_kg is null or (weight_kg >= 20 and weight_kg <= 500)),
  drop constraint if exists profiles_sex_check,
  add constraint profiles_sex_check check (sex is null or sex in ('male','female','other')),
  drop constraint if exists profiles_activity_level_check,
  add constraint profiles_activity_level_check check (activity_level is null or activity_level in ('low','light','moderate','high','very_high'));

grant select, insert, update on public.profiles to authenticated;
