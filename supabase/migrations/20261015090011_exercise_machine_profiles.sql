-- Additive machine/configuration layer. No workout result rewrites.
begin;
create table if not exists public.machine_profiles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_ru text not null check (btrim(name_ru) <> ''),
  machine_category text not null check (machine_category in
    ('selectorized','plate_loaded_lever','stack_loaded_lever','guided_sled','cable','assisted','specialized')),
  loading_mechanism text not null check (loading_mechanism in ('stack','plates','bodyweight','assistance')),
  movement_path text check (movement_path in ('straight','arc','convergent','divergent','free')),
  body_position text check (body_position in ('standing','seated','supine','prone','inclined','hanging','kneeling','mixed')),
  independent_arms boolean,
  movement_pattern_id uuid references public.movement_patterns(id) on delete restrict,
  -- NULL = unknown. Do not derive trajectory or leverage from a brand name.
  adjustment_codes text[] not null default '{}'
    check (adjustment_codes <@ array['seat_height','backrest_angle','start_position','range_of_motion','support_height','handle_position','safety_stops']),
  check (machine_category <> 'assisted' or loading_mechanism = 'assistance')
);
create index if not exists machine_profiles_pattern_idx on public.machine_profiles(movement_pattern_id);
create table if not exists public.exercise_machine_profiles (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  machine_profile_id uuid not null references public.machine_profiles(id) on delete restrict,
  primary key(exercise_id,machine_profile_id)
);
create index if not exists exercise_machine_profiles_profile_idx on public.exercise_machine_profiles(machine_profile_id);

create table if not exists public.equipment_instances (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  machine_profile_id uuid not null references public.machine_profiles(id) on delete restrict,
  manufacturer text,
  model text,
  custom_name text not null check (btrim(custom_name) <> ''),
  location_name text,
  setup_notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(id,owner_user_id)
);
create index if not exists equipment_instances_owner_idx on public.equipment_instances(owner_user_id);
create index if not exists equipment_instances_profile_idx on public.equipment_instances(machine_profile_id);
create table if not exists public.exercise_configurations (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references auth.users(id) on delete cascade,
  exercise_id uuid not null references public.exercises(id) on delete restrict,
  equipment_instance_id uuid,
  name text not null check (btrim(name) <> ''),
  -- Names/units explicit; unknown settings stay NULL rather than fabricated values.
  grip_width_cm numeric check (grip_width_cm between 0 and 200),
  bench_angle_degrees numeric check (bench_angle_degrees between -90 and 90),
  seat_setting text,
  support_setting text,
  safety_stop_setting text,
  range_of_motion_note text,
  notes text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key(equipment_instance_id,owner_user_id)
    references public.equipment_instances(id,owner_user_id) on delete restrict
);
create index if not exists exercise_configurations_owner_idx on public.exercise_configurations(owner_user_id);
create index if not exists exercise_configurations_exercise_idx on public.exercise_configurations(exercise_id);
create index if not exists exercise_configurations_equipment_idx on public.exercise_configurations(equipment_instance_id,owner_user_id);

alter table public.machine_profiles enable row level security;
alter table public.exercise_machine_profiles enable row level security;
revoke all on public.machine_profiles,public.exercise_machine_profiles from anon,authenticated;
grant select on public.machine_profiles,public.exercise_machine_profiles to authenticated;
grant all on public.machine_profiles,public.exercise_machine_profiles to service_role;
drop policy if exists machine_profiles_read on public.machine_profiles;
create policy machine_profiles_read on public.machine_profiles for select to authenticated using(true);
drop policy if exists exercise_machine_profiles_read on public.exercise_machine_profiles;
create policy exercise_machine_profiles_read on public.exercise_machine_profiles for select to authenticated
using(exists(select 1 from public.exercises e where e.id=exercise_id));

do $$ declare t text; begin
  foreach t in array array['equipment_instances','exercise_configurations'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon,authenticated',t);
    execute format('grant select,insert,update,delete on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('drop policy if exists owner_read on public.%I',t);
    execute format('create policy owner_read on public.%I for select to authenticated using(owner_user_id=(select auth.uid()))',t);
    execute format('drop policy if exists owner_insert on public.%I',t);
    execute format('create policy owner_insert on public.%I for insert to authenticated with check(owner_user_id=(select auth.uid()))',t);
    execute format('drop policy if exists owner_update on public.%I',t);
    execute format('create policy owner_update on public.%I for update to authenticated using(owner_user_id=(select auth.uid())) with check(owner_user_id=(select auth.uid()))',t);
    execute format('drop policy if exists owner_delete on public.%I',t);
    execute format('create policy owner_delete on public.%I for delete to authenticated using(owner_user_id=(select auth.uid()))',t);
  end loop;
end $$;

create or replace function public.exercise_configuration_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='UPDATE' and (new.id is distinct from old.id or new.owner_user_id is distinct from old.owner_user_id) then
    raise exception 'Configuration identity and owner are immutable' using errcode='23514';
  end if;
  if not exists(select 1 from public.exercises e where e.id=new.exercise_id
    and (e.owner_id is null or e.owner_id=new.owner_user_id)) then
    raise exception 'Exercise is not available to this owner' using errcode='42501';
  end if;
  if new.equipment_instance_id is not null and not exists (
    select 1 from public.equipment_instances i
    join public.exercise_machine_profiles p on p.machine_profile_id=i.machine_profile_id
    where i.id=new.equipment_instance_id and i.owner_user_id=new.owner_user_id
      and p.exercise_id=new.exercise_id
  ) then
    raise exception 'Equipment must belong to this owner and match an approved exercise profile' using errcode='23514';
  end if;
  new.updated_at:=now();
  return new;
end $$;
revoke all on function public.exercise_configuration_guard() from public,anon,authenticated;
drop trigger if exists exercise_configuration_guard on public.exercise_configurations;
create trigger exercise_configuration_guard before insert or update on public.exercise_configurations
for each row execute function public.exercise_configuration_guard();

-- Changing the meaning of an instance would silently alter its future history.
-- Keep identity/profile stable; editable labels and settings remain metadata.
create or replace function public.equipment_instance_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if new.id is distinct from old.id or new.owner_user_id is distinct from old.owner_user_id
    or new.machine_profile_id is distinct from old.machine_profile_id then
    raise exception 'Equipment identity, owner and profile are immutable' using errcode='23514';
  end if;
  new.updated_at:=now();
  return new;
end $$;
revoke all on function public.equipment_instance_guard() from public,anon,authenticated;
drop trigger if exists equipment_instance_guard on public.equipment_instances;
create trigger equipment_instance_guard before update on public.equipment_instances
for each row execute function public.equipment_instance_guard();
commit;
