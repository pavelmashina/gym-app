-- Preserve broad muscle_group='Ноги' filtering and add 1–3 ordered tags.
begin;
alter table public.exercises
  add column if not exists muscle_tags jsonb not null default '[]'::jsonb;
do $$ begin
  if not exists (select 1 from pg_constraint
                 where conrelid='public.exercises'::regclass
                   and conname='exercises_muscle_tags_array') then
    alter table public.exercises add constraint exercises_muscle_tags_array
      check (jsonb_typeof(muscle_tags)='array' and jsonb_array_length(muscle_tags)<=3);
  end if;
end $$;
commit;
