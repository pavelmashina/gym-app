begin;

create or replace function public.catalog_normalize(p_text text)
returns text language sql immutable security invoker set search_path='' as $$
  select regexp_replace(translate(lower(btrim(coalesce(p_text,''))),'ё','е'),'[[:space:]]+',' ','g');
$$;
revoke all on function public.catalog_normalize(text) from public,anon;
grant execute on function public.catalog_normalize(text) to authenticated,service_role;

-- Never choose the first UUID from several matches. Private exercises are not
-- eligible for matching a shared imported program.
create or replace function public.resolve_catalog_exercise(p_name text)
returns uuid language sql stable security invoker set search_path='' as $$
  with candidates as (
    select e.id,e.status from public.exercises e
    where e.owner_id is null and e.status in ('published','legacy') and (
      public.catalog_normalize(e.name)=public.catalog_normalize(p_name)
      or (e.status='published' and exists(select 1 from public.exercise_aliases a
        where a.exercise_id=e.id and public.catalog_normalize(a.alias)=public.catalog_normalize(p_name)))
    )
  ), preferred as (
    select * from candidates where status='published'
    union all select * from candidates where status='legacy' and not exists(select 1 from candidates where status='published')
  ) select case when count(*)=1 then (array_agg(id))[1] else null end from preferred;
$$;
revoke all on function public.resolve_catalog_exercise(text) from public,anon;
grant execute on function public.resolve_catalog_exercise(text) to authenticated,service_role;

-- Update only the known name-resolution statement, abort on schema drift.
do $$ declare definition text; revised text; begin
  if to_regprocedure('public.adopt_catalog_program(uuid)') is null then
    raise exception 'Install the existing program adoption schema before catalog v2';
  end if;
  select pg_get_functiondef('public.adopt_catalog_program(uuid)'::regprocedure) into definition;
  if position('public.resolve_catalog_exercise(v_name)' in definition)=0 then
    revised:=regexp_replace(definition,
      'select e\.id into v_exercise_id\s+from public\.exercises e\s+where lower\(btrim\(e\.name\)\)=lower\(v_name\)\s+order by e\.id\s+limit 1;',
      'v_exercise_id := public.resolve_catalog_exercise(v_name);','i');
    if revised=definition then raise exception 'Unexpected adoption function: manual review required'; end if;
    execute revised;
  end if;
end $$;
alter table public.exercises drop constraint if exists exercises_name_key;
-- Names are labels, not global identities. canonical_key remains unique.
drop policy if exists exercises_authenticated_read on public.exercises;
create policy exercises_authenticated_read on public.exercises for select to authenticated
using ((owner_id is null and status in ('legacy','published','retired')) or owner_id=(select auth.uid()));

create or replace function public.catalog_nonempty_lines(p_lines text[])
returns boolean language sql immutable security invoker set search_path='' as $$
  select coalesce(cardinality(p_lines)>0 and not exists(
    select 1 from unnest(p_lines) x where x is null or btrim(x)=''),false);
$$;
revoke all on function public.catalog_nonempty_lines(text[]) from public,anon;
grant execute on function public.catalog_nonempty_lines(text[]) to authenticated,service_role;

create or replace function public.exercise_v2_identity_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
begin
  if TG_OP='UPDATE' and (new.id is distinct from old.id or
    (old.canonical_key is not null and new.canonical_key is distinct from old.canonical_key)) then
    raise exception 'Exercise identity is immutable' using errcode='23514';
  end if;
  if new.owner_id is not null then
    if new.canonical_key is null then new.canonical_key:='user_'||replace(new.id::text,'-',''); end if;
    if new.canonical_key<>'user_'||replace(new.id::text,'-','') or new.status='published' then
      raise exception 'Private exercise identity/publication violation' using errcode='23514';
    end if;
  end if;
  if new.status='published' then
    if new.owner_id is not null or nullif(btrim(new.canonical_key),'') is null or nullif(btrim(new.name),'') is null
      or new.family_id is null or new.primary_muscle_group_id is null or new.primary_equipment_type_id is null
      or new.movement_pattern_id is null or new.activity_type is null or new.mechanics is null
      or new.measurement_type is null or new.load_mode is null or new.difficulty is null
      or nullif(btrim(new.measurement_note),'') is null
      or new.body_position is null or new.laterality is null or nullif(btrim(new.short_description),'') is null
      or not public.catalog_nonempty_lines(new.setup_instructions)
      or not public.catalog_nonempty_lines(new.execution_steps) or cardinality(new.execution_steps) not between 3 and 6
      or not public.catalog_nonempty_lines(new.technique_cues)
      or not public.catalog_nonempty_lines(new.common_mistakes)
      or not public.catalog_nonempty_lines(new.safety_notes) then
      raise exception 'Published exercise content is incomplete' using errcode='23514';
    end if;
    if (new.activity_type='isometric' and new.measurement_type<>'duration')
      or (new.measurement_type='assisted_reps' and new.load_mode<>'assistance') then
      raise exception 'Invalid exercise measurement contract' using errcode='23514';
    end if;
  end if;
  new.updated_at:=now(); return new;
end $$;
revoke all on function public.exercise_v2_identity_guard() from public,anon,authenticated;

create or replace function public.catalog_links_guard()
returns trigger language plpgsql security invoker set search_path='' as $$
declare ids uuid[]; exercise_uuid uuid; begin
  if TG_TABLE_NAME='exercises' then ids:=array[new.id];
  elsif TG_OP='INSERT' then ids:=array[new.exercise_id];
  elsif TG_OP='DELETE' then ids:=array[old.exercise_id];
  else ids:=array[old.exercise_id,new.exercise_id]; end if;
  foreach exercise_uuid in array ids loop
    if exists(select 1 from public.exercises where id=exercise_uuid and status='published') then
      if not exists(select 1 from public.exercise_muscles where exercise_id=exercise_uuid and role='primary')
        or not exists(select 1 from public.exercise_aliases where exercise_id=exercise_uuid and language='en')
        or not exists(select 1 from public.exercise_equipment q join public.exercises e on e.id=q.exercise_id
          where e.id=exercise_uuid and q.role='main' and q.equipment_type_id=e.primary_equipment_type_id) then
        raise exception 'Published exercise links are incomplete' using errcode='23514';
      end if;
    end if;
  end loop;
  return null;
end $$;
revoke all on function public.catalog_links_guard() from public,anon,authenticated;
drop trigger if exists catalog_links_guard on public.exercises;
create constraint trigger catalog_links_guard after insert or update on public.exercises
deferrable initially deferred for each row execute function public.catalog_links_guard();
do $$ declare t text; begin
  foreach t in array array['exercise_muscles','exercise_aliases','exercise_equipment'] loop
    execute format('drop trigger if exists catalog_links_guard on public.%I',t);
    execute format('create constraint trigger catalog_links_guard after insert or update or delete on public.%I deferrable initially deferred for each row execute function public.catalog_links_guard()',t);
  end loop;
end $$;

create or replace view public.exercise_catalog_v2 with (security_invoker=true) as
select e.*, f.name_ru family_name_ru, g.code muscle_group_code, g.name_ru primary_group_name_ru,
  q.code equipment_code,q.name_ru equipment_name_ru,q.legacy_filter equipment_filter,
  coalesce((select jsonb_agg(jsonb_build_object('alias',a.alias,'language',a.language))
    from public.exercise_aliases a where a.exercise_id=e.id),'[]'::jsonb) aliases
from public.exercises e
left join public.exercise_families f on f.id=e.family_id
left join public.muscle_groups g on g.id=e.primary_muscle_group_id
left join public.equipment_types q on q.id=e.primary_equipment_type_id
where e.status='published' or e.owner_id=(select auth.uid());
revoke all on public.exercise_catalog_v2 from public,anon,authenticated;
grant select on public.exercise_catalog_v2 to authenticated,service_role;
commit;
