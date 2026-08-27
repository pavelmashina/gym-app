-- Normalize every published ready-made program to the same one-cycle source structure.
-- Original source week boundaries are preserved for traceability in source_payload.weeks
-- and the previous week count is preserved in source_payload.source_week_count.

alter table public.catalog_programs
  add column if not exists equipment text;

with flattened as (
  select
    cp.id,
    coalesce(
      jsonb_agg(w.workout order by w.week_ordinality, w.workout_ordinality)
        filter (where w.workout is not null),
      '[]'::jsonb
    ) as workouts
  from public.catalog_programs cp
  left join lateral (
    select
      wk.ordinality as week_ordinality,
      wo.ordinality as workout_ordinality,
      wo.value as workout
    from jsonb_array_elements(coalesce(cp.source_payload -> 'weeks', '[]'::jsonb))
      with ordinality as wk(value, ordinality)
    left join lateral jsonb_array_elements(coalesce(wk.value -> 'workouts', '[]'::jsonb))
      with ordinality as wo(value, ordinality) on true
  ) w on true
  group by cp.id
)
update public.catalog_programs cp
set source_payload = jsonb_set(
      jsonb_set(
        coalesce(cp.source_payload, '{}'::jsonb),
        '{source_week_count}',
        to_jsonb(cp.week_count),
        true
      ),
      '{cycle}',
      jsonb_build_object('workouts', f.workouts),
      true
    ),
    week_count = 1,
    updated_at = now()
from flattened f
where f.id = cp.id
  and not (coalesce(cp.source_payload, '{}'::jsonb) ? 'cycle');

-- Fill equipment only where it is explicitly recoverable from imported source text.
update public.catalog_programs
set equipment = nullif(concat_ws(', ',
  case when description ilike '%без оборудования%' then 'Без оборудования' end,
  case when description ilike '%фитнес-резин%' then 'Фитнес-резинки' end,
  case when description ilike '%эспандер%' then 'Эспандеры' end,
  case when description ilike '%гантел%' then 'Гантели' end,
  case when description ilike '%коврик%' then 'Коврик' end,
  case when description ilike '%турник%' then 'Турник' end,
  case when description ilike '%колесик%пресс%' then 'Колесо для пресса' end,
  case when description ilike '%ступеньк%' then 'Ступень/платформа' end,
  case when description ilike '%гриф%' then 'Гриф' end,
  case when description ilike '%блин%' then 'Блины' end,
  case when description ilike '%скам%' then 'Скамья' end,
  case when description ilike '%гир%' then 'Гиря' end,
  case when description ilike '%утяжелител%' then 'Утяжелители' end
), '')
where equipment is null;

comment on column public.catalog_programs.week_count is
  'Compatibility field. Catalog programs are normalized to one workout cycle; original source week count is preserved in source_payload.source_week_count.';
comment on column public.catalog_programs.equipment is
  'Equipment explicitly recoverable from the structured source description; null when the source does not support a reliable value.';
