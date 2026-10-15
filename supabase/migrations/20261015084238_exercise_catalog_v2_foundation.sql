-- Phase 1, additive only. Requires the existing exercises schema.
-- Does not merge exercises, rewrite history, remove UNIQUE(name), or publish data.
begin;

-- Preserve original shared card contents before any canonical publication.
-- No private user exercises or training data are copied into this archive.
create schema if not exists private;
create table if not exists private.exercise_catalog_v1_archive (
  exercise_id uuid primary key,
  original_row jsonb not null,
  archived_at timestamptz not null default now()
);
alter table private.exercise_catalog_v1_archive enable row level security;
revoke all on private.exercise_catalog_v1_archive from public, anon, authenticated;
grant select on private.exercise_catalog_v1_archive to service_role;
insert into private.exercise_catalog_v1_archive(exercise_id,original_row)
select id,to_jsonb(e) from public.exercises e where owner_id is null
  and not exists (select 1 from private.exercise_catalog_v1_archive)
on conflict(exercise_id) do nothing;

create table if not exists public.movement_patterns (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_ru text not null check (btrim(name_ru) <> '')
);
create table if not exists public.muscle_groups (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_ru text not null check (btrim(name_ru) <> '')
);
create table if not exists public.muscles (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_ru text not null check (btrim(name_ru) <> ''),
  muscle_group_id uuid not null references public.muscle_groups(id) on delete restrict
);
create index if not exists muscles_group_idx on public.muscles(muscle_group_id);
create table if not exists public.equipment_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_ru text not null check (btrim(name_ru) <> ''),
  legacy_filter text check (legacy_filter in
    ('Гакк','Гантели','Штанга','Смит','Турник','Свой вес','Гравитрон','Гири','Тренажёр'))
);
create table if not exists public.exercise_families (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[a-z][a-z0-9_]*$'),
  name_ru text not null check (btrim(name_ru) <> ''),
  description text,
  movement_pattern_id uuid references public.movement_patterns(id) on delete restrict,
  parent_family_id uuid references public.exercise_families(id) on delete restrict,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_family_id is distinct from id)
);
create index if not exists exercise_families_pattern_idx on public.exercise_families(movement_pattern_id);
create index if not exists exercise_families_parent_idx on public.exercise_families(parent_family_id);

alter table public.exercises
  add column if not exists canonical_key text,
  add column if not exists family_id uuid references public.exercise_families(id) on delete restrict,
  add column if not exists parent_exercise_id uuid references public.exercises(id) on delete restrict,
  add column if not exists primary_muscle_group_id uuid references public.muscle_groups(id) on delete restrict,
  add column if not exists primary_equipment_type_id uuid references public.equipment_types(id) on delete restrict,
  add column if not exists movement_pattern_id uuid references public.movement_patterns(id) on delete restrict,
  add column if not exists activity_type text,
  add column if not exists mechanics text,
  add column if not exists body_position text,
  add column if not exists laterality text,
  add column if not exists short_description text,
  add column if not exists setup_instructions text[],
  add column if not exists execution_steps text[],
  add column if not exists technique_cues text[],
  add column if not exists common_mistakes text[],
  add column if not exists safety_notes text[],
  add column if not exists measurement_type text,
  add column if not exists measurement_note text,
  add column if not exists load_mode text,
  add column if not exists status text not null default 'legacy',
  add column if not exists updated_at timestamptz not null default now();

create unique index if not exists exercises_canonical_key_idx on public.exercises(canonical_key);
create index if not exists exercises_family_idx on public.exercises(family_id);
create index if not exists exercises_parent_idx on public.exercises(parent_exercise_id);
create index if not exists exercises_primary_group_idx on public.exercises(primary_muscle_group_id);
create index if not exists exercises_primary_equipment_idx on public.exercises(primary_equipment_type_id);
create index if not exists exercises_pattern_idx on public.exercises(movement_pattern_id);

-- NULL means not yet classified, not an invented biomechanical classification.
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.exercises'::regclass and conname='exercises_v2_classification') then
    alter table public.exercises add constraint exercises_v2_classification check (
      (canonical_key is null or canonical_key ~ '^[a-z][a-z0-9_]*$')
      and status in ('legacy','draft','review','published','retired')
      and (activity_type is null or activity_type in ('strength','isometric','mobility','cardio','other'))
      and (mechanics is null or mechanics in ('multi_joint','single_joint','isometric','mixed'))
      and (body_position is null or body_position in ('standing','seated','supine','prone','inclined','hanging','kneeling','side_lying','mixed'))
      and (laterality is null or laterality in ('bilateral','unilateral','alternating','independent'))
      and (measurement_type is null or measurement_type in ('weight_reps','bodyweight_reps','assisted_reps','duration','carry','cardio'))
      and (load_mode is null or load_mode in ('barbell_total','dumbbell_each','kettlebell_each','external_total','bodyweight','stack','plates','machine_indicated','assistance','none'))
      and parent_exercise_id is distinct from id
    );
  end if;
end $$;

create table if not exists public.exercise_aliases (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  alias text not null check (btrim(alias) <> ''),
  language text not null check (language in ('ru','en')),
  alias_type text not null check (alias_type in ('synonym','translation','legacy','abbreviation'))
);
create unique index if not exists exercise_aliases_identity_idx
  on public.exercise_aliases(exercise_id, language, lower(btrim(alias)));
create index if not exists exercise_aliases_search_idx on public.exercise_aliases(lower(btrim(alias)));
create table if not exists public.exercise_muscles (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  muscle_id uuid not null references public.muscles(id) on delete restrict,
  role text not null check (role in ('primary','secondary','stabilizer')),
  primary key (exercise_id, muscle_id)
);
create index if not exists exercise_muscles_muscle_idx on public.exercise_muscles(muscle_id);
create table if not exists public.exercise_equipment (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  equipment_type_id uuid not null references public.equipment_types(id) on delete restrict,
  role text not null check (role in ('main','additional')),
  primary key (exercise_id, equipment_type_id)
);
create index if not exists exercise_equipment_type_idx on public.exercise_equipment(equipment_type_id);
create table if not exists public.exercise_movement_patterns (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  movement_pattern_id uuid not null references public.movement_patterns(id) on delete restrict,
  primary key (exercise_id, movement_pattern_id)
);
create index if not exists exercise_movement_patterns_pattern_idx on public.exercise_movement_patterns(movement_pattern_id);
create table if not exists public.exercise_relations (
  exercise_id uuid not null references public.exercises(id) on delete cascade,
  related_exercise_id uuid not null references public.exercises(id) on delete cascade,
  relation_type text not null check (relation_type in ('variant_of','alternative_to','progression_of','regression_of')),
  primary key (exercise_id, related_exercise_id, relation_type),
  check (exercise_id <> related_exercise_id)
);
create index if not exists exercise_relations_related_idx on public.exercise_relations(related_exercise_id);
create table if not exists public.exercise_legacy_mappings (
  legacy_source text not null check (btrim(legacy_source) <> ''),
  legacy_exercise_id text not null check (btrim(legacy_exercise_id) <> ''),
  legacy_name text not null,
  canonical_exercise_id uuid references public.exercises(id) on delete restrict,
  match_type text check (match_type in ('equivalent','alias','variant','compound','insufficient')),
  review_status text not null default 'needs_review'
    check (review_status in ('needs_review','confirmed','new_independent','unresolved')),
  review_notes text,
  primary key (legacy_source, legacy_exercise_id),
  check (review_status not in ('confirmed','new_independent') or
    (canonical_exercise_id is not null and match_type is not null and nullif(btrim(review_notes),'') is not null))
);
create index if not exists exercise_legacy_mappings_canonical_idx on public.exercise_legacy_mappings(canonical_exercise_id);

-- No SECURITY DEFINER. All new dictionaries are read-only to application users.
do $$ declare t text; begin
  foreach t in array array['movement_patterns','muscle_groups','muscles','equipment_types','exercise_families'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('drop policy if exists catalog_read on public.%I',t);
    execute format('create policy catalog_read on public.%I for select to authenticated using (true)',t);
  end loop;
  foreach t in array array['exercise_aliases','exercise_muscles','exercise_equipment','exercise_movement_patterns'] loop
    execute format('alter table public.%I enable row level security',t);
    execute format('revoke all on public.%I from anon, authenticated',t);
    execute format('grant select on public.%I to authenticated',t);
    execute format('grant all on public.%I to service_role',t);
    execute format('drop policy if exists exercise_visible on public.%I',t);
    execute format('create policy exercise_visible on public.%I for select to authenticated using (exists (select 1 from public.exercises e where e.id = exercise_id))',t);
  end loop;
end $$;
alter table public.exercise_relations enable row level security;
revoke all on public.exercise_relations from anon, authenticated;
grant select on public.exercise_relations to authenticated;
grant all on public.exercise_relations to service_role;
drop policy if exists endpoints_visible on public.exercise_relations;
create policy endpoints_visible on public.exercise_relations for select to authenticated
using (exists (select 1 from public.exercises e where e.id=exercise_id)
  and exists (select 1 from public.exercises e where e.id=related_exercise_id));
-- Mapping notes are internal review material, never a public catalog API.
alter table public.exercise_legacy_mappings enable row level security;
revoke all on public.exercise_legacy_mappings from anon, authenticated;
grant all on public.exercise_legacy_mappings to service_role;

create or replace function public.exercise_v2_identity_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='UPDATE' then
    if new.id is distinct from old.id or
       (old.canonical_key is not null and new.canonical_key is distinct from old.canonical_key) then
      raise exception 'Exercise identity is immutable' using errcode='23514';
    end if;
  end if;
  if new.owner_id is not null then
    if new.canonical_key is null then new.canonical_key := 'user_' || replace(new.id::text,'-',''); end if;
    if new.canonical_key <> 'user_' || replace(new.id::text,'-','') then
      raise exception 'Private exercise key must use its UUID' using errcode='23514';
    end if;
    if new.status='published' then
      raise exception 'Private exercises cannot be published to the shared catalog' using errcode='23514';
    end if;
  end if;
  -- This foundation deliberately does NOT enable publication: cross-table content
  -- validation, reviewed seeds and the v2 reader must land before this gate is removed.
  if new.status='published' then
    raise exception 'Catalog v2 publication is not enabled yet' using errcode='23514';
  end if;
  new.updated_at := now();
  return new;
end $$;
revoke all on function public.exercise_v2_identity_guard() from public, anon, authenticated;
drop trigger if exists exercise_v2_identity_guard on public.exercises;
create trigger exercise_v2_identity_guard before insert or update on public.exercises
for each row execute function public.exercise_v2_identity_guard();

-- Do not change the existing exercises read policy: legacy history still needs it.
-- Likewise, leave performed_sets and all current result calculations untouched.
commit;
