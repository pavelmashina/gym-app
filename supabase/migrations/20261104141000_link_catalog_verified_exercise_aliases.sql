-- Allow only unique links to published exercises via names or curated aliases.
-- Unknown/ambiguous catalog exercise names keep their original snapshots.
create or replace function public.resolve_catalog_exercise_id(p_name text)
returns uuid language sql stable security invoker set search_path = ''
as $$
  with wanted as (
    select regexp_replace(lower(translate(btrim(p_name), 'Ёё', 'Ее')), '[[:space:]]+', ' ', 'g') norm
  ), candidate as (
    select distinct e.id from public.exercises e cross join wanted w
    where e.status='published' and (
      regexp_replace(lower(translate(btrim(e.name), 'Ёё', 'Ее')), '[[:space:]]+', ' ', 'g')=w.norm
      or exists(
        select 1 from public.exercise_aliases a where a.exercise_id=e.id
        and regexp_replace(lower(translate(btrim(a.alias), 'Ёё', 'Ее')), '[[:space:]]+', ' ', 'g')=w.norm
      )
    )
  )
  select case when count(*)=1 then (array_agg(id))[1] else null::uuid end from candidate;
$$;
revoke all on function public.resolve_catalog_exercise_id(text) from public,anon;
grant execute on function public.resolve_catalog_exercise_id(text) to authenticated;

create or replace function public.link_catalog_program_exercise()
returns trigger language plpgsql security invoker set search_path=''
as $$
begin
  if new.exercise_id is null and nullif(btrim(new.exercise_name_snapshot),'') is not null then
    new.exercise_id := public.resolve_catalog_exercise_id(new.exercise_name_snapshot);
  end if;
  return new;
end;
$$;
drop trigger if exists link_catalog_program_exercise_id on public.program_workout_exercises;
create trigger link_catalog_program_exercise_id
before insert or update of exercise_name_snapshot,exercise_id
on public.program_workout_exercises
for each row execute function public.link_catalog_program_exercise();

-- Repair only unlinked templates and unperformed scheduled workouts.
update public.program_workout_exercises p
set exercise_id=public.resolve_catalog_exercise_id(p.exercise_name_snapshot)
where p.exercise_id is null and p.exercise_name_snapshot is not null
  and public.resolve_catalog_exercise_id(p.exercise_name_snapshot) is not null;

update public.scheduled_workout_exercises swe
set exercise_id=public.resolve_catalog_exercise_id(swe.exercise_name_snapshot)
from public.scheduled_workouts sw
where sw.id=swe.scheduled_workout_id and sw.status='scheduled'
  and swe.exercise_id is null and swe.exercise_name_snapshot is not null
  and public.resolve_catalog_exercise_id(swe.exercise_name_snapshot) is not null;
