-- Preserve repetitions from textual catalog prescriptions when a numeric plan can be inferred.
-- This runs at the program template layer so future schedules and workout sessions receive
-- the repaired planned repetitions automatically.

create or replace function public.fill_program_set_reps_from_prescription()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_prescription text;
  v_match text[];
begin
  if new.reps is not null then
    return new;
  end if;

  select pwe.prescription_snapshot
    into v_prescription
  from public.program_workout_exercises pwe
  where pwe.id = new.workout_exercise_id;

  if nullif(btrim(v_prescription), '') is null then
    return new;
  end if;

  -- 3*15 / 3x15 / 3×15 -> 15 repetitions per set.
  v_match := regexp_match(v_prescription, '(\d+)\s*[\*xх×]\s*(\d+)', 'i');
  if v_match is not null then
    new.reps := greatest(1, least(999, v_match[2]::integer));
    return new;
  end if;

  -- "по 12" -> 12.
  v_match := regexp_match(v_prescription, 'по\s*(\d+)', 'i');
  if v_match is not null then
    new.reps := greatest(1, least(999, v_match[1]::integer));
    return new;
  end if;

  -- "15-20 раз каждой ногой" / "3 круга 15-20" -> lower bound 15.
  v_match := regexp_match(v_prescription, '(\d+)\s*-\s*(\d+)', 'i');
  if v_match is not null then
    new.reps := greatest(1, least(999, v_match[1]::integer));
    return new;
  end if;

  -- Plain repetitions and phrases such as "12 на каждую ногу".
  -- Deliberately excludes "4 подхода до отказа": the 4 there is a set count, not reps.
  v_match := regexp_match(v_prescription, '^\s*(\d+)\s*(?:$|раз|повтор|повт|шаг|на(?:\s|$))', 'i');
  if v_match is not null then
    new.reps := greatest(1, least(999, v_match[1]::integer));
  end if;

  return new;
end;
$$;

revoke all on function public.fill_program_set_reps_from_prescription() from public, anon, authenticated;

drop trigger if exists program_exercise_sets_fill_reps on public.program_exercise_sets;
create trigger program_exercise_sets_fill_reps
before insert or update of reps, workout_exercise_id on public.program_exercise_sets
for each row execute function public.fill_program_set_reps_from_prescription();

-- Repair catalog programs adopted before this migration.
update public.program_exercise_sets
set reps = reps
where reps is null;

-- Push repaired repetitions into already-created schedules.
update public.scheduled_sets ss
set planned_reps = pes.reps
from public.scheduled_workout_exercises swe,
     public.program_exercise_sets pes
where ss.scheduled_workout_exercise_id = swe.id
  and pes.workout_exercise_id = swe.source_program_workout_exercise_id
  and pes.set_number = ss.set_number
  and ss.planned_reps is null
  and pes.reps is not null;

-- Keep completed actual results untouched. For active/planned sets, fill only missing defaults.
update public.performed_sets ps
set planned_reps = ss.planned_reps,
    reps = case
      when not ps.completed and ps.reps is null then ss.planned_reps
      else ps.reps
    end,
    updated_at = now()
from public.scheduled_sets ss
where ps.source_scheduled_set_id = ss.id
  and ss.planned_reps is not null
  and (
    ps.planned_reps is null
    or (not ps.completed and ps.reps is null)
  );
