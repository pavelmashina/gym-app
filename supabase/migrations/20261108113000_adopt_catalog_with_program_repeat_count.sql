CREATE OR REPLACE FUNCTION public.adopt_catalog_program(p_catalog_program_id uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid(); v_catalog public.catalog_programs%rowtype; v_program_id uuid; v_week_id uuid; v_workout_id uuid; v_workout_exercise_id uuid;
  v_workout jsonb; v_exercise jsonb; v_workout_pos bigint; v_exercise_pos bigint; v_exercise_id uuid; v_name text; v_prescription text;
  v_set_count integer; v_reps integer; v_match text[]; v_set_number integer; v_cycle_workouts jsonb; v_repeat_count integer:=1; v_explicit_count text; v_duration text; v_source_weeks integer:=1; v_source_weeks_text text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  select * into v_catalog from public.catalog_programs where id=p_catalog_program_id and published=true;
  if v_catalog.id is null then raise exception 'Catalog program not found or unavailable' using errcode='P0002'; end if;
  select p.id into v_program_id from public.programs p where p.owner_id=v_user_id and p.source_catalog_program_id=p_catalog_program_id and p.status<>'archived' limit 1;
  if v_program_id is not null then return v_program_id; end if;

  v_cycle_workouts:=coalesce(v_catalog.source_payload->'cycle'->'workouts','[]'::jsonb);
  if jsonb_typeof(v_cycle_workouts)<>'array' or jsonb_array_length(v_cycle_workouts)=0 then raise exception 'Catalog program has no cycle workouts' using errcode='22023'; end if;
  -- Preserve the training plan's repeat count when adopting catalog templates.
  v_explicit_count:=coalesce(v_catalog.source_payload->>'cycle_repeat_count',
    v_catalog.source_payload->>'cycleRepeatCount',
    v_catalog.source_payload->'cycle'->>'repeat_count',
    v_catalog.source_payload->'cycle'->>'repeatCount');
  if v_explicit_count ~ '^[0-9]{1,3}$' then
    v_repeat_count:=greatest(1,least(52,v_explicit_count::integer));
  else
    v_duration:=coalesce(v_catalog.source_payload#>>'{details,duration}',v_catalog.source_payload->>'duration','');
    v_match:=regexp_match(v_duration,'([0-9]+)[[:space:]]*(нед|weeks?)','i');
    if v_match is not null then
      v_source_weeks_text:=v_catalog.source_payload->>'source_week_count';
      if v_source_weeks_text ~ '^[0-9]{1,3}$' then
        v_source_weeks:=greatest(1,v_source_weeks_text::integer);
      end if;
      v_repeat_count:=greatest(1,least(52,ceil(v_match[1]::numeric/v_source_weeks)::integer));
    end if;
  end if;
  insert into public.programs(owner_id,name,description,week_count,categories,training_place,equipment,level,status,schedule_mode,source_catalog_program_id,structure_mode,cycle_repeat_count)
  values(v_user_id,left(v_catalog.name,80),v_catalog.description,1,v_catalog.categories,v_catalog.training_place,v_catalog.equipment,v_catalog.level,'active','custom',v_catalog.id,'cycle',v_repeat_count)
  returning id into v_program_id;
  insert into public.program_weeks(program_id,week_number,position) values(v_program_id,1,1) returning id into v_week_id;

  for v_workout,v_workout_pos in select value,ordinality from jsonb_array_elements(v_cycle_workouts) with ordinality loop
    insert into public.program_workouts(week_id,name,position,rest_days_after)
    values(v_week_id,left(coalesce(nullif(btrim(v_workout->>'name'),''),'Тренировка '||v_workout_pos),80),v_workout_pos::smallint,1) returning id into v_workout_id;
    for v_exercise,v_exercise_pos in select value,ordinality from jsonb_array_elements(coalesce(v_workout->'exercises','[]'::jsonb)) with ordinality loop
      v_name:=nullif(btrim(v_exercise->>'name'),''); v_prescription:=nullif(btrim(v_exercise->>'prescription'),''); if v_name is null then continue; end if;
      v_exercise_id := public.resolve_catalog_exercise(v_name);
      insert into public.program_workout_exercises(workout_id,exercise_id,exercise_name_snapshot,prescription_snapshot,position)
      values(v_workout_id,v_exercise_id,v_name,v_prescription,v_exercise_pos::smallint) returning id into v_workout_exercise_id;
      v_set_count:=1; v_reps:=null;
      if v_prescription is not null then
        v_match:=regexp_match(v_prescription,'(\d+)\s*[\*xх×]\s*(\d+)','i');
        if v_match is not null then v_set_count:=greatest(1,least(20,v_match[1]::integer)); v_reps:=greatest(1,least(999,v_match[2]::integer));
        else
          v_match:=regexp_match(v_prescription,'(\d+)\s*(?:подход(?:а|ов)?|круг(?:а|ов)?)','i'); if v_match is not null then v_set_count:=greatest(1,least(20,v_match[1]::integer)); end if;
          v_match:=regexp_match(v_prescription,'по\s*(\d+)','i');
          if v_match is not null then v_reps:=greatest(1,least(999,v_match[1]::integer));
          elsif v_prescription~'^\s*\d+\s*-\s*\d+' then v_match:=regexp_match(v_prescription,'^\s*(\d+)'); v_reps:=greatest(1,least(999,v_match[1]::integer));
          elsif v_prescription~*'^\s*\d+\s*(?:$|раз|повтор|повт|шаг)' then v_match:=regexp_match(v_prescription,'^\s*(\d+)'); v_reps:=greatest(1,least(999,v_match[1]::integer)); end if;
        end if;
      end if;
      for v_set_number in 1..v_set_count loop insert into public.program_exercise_sets(workout_exercise_id,set_number,reps) values(v_workout_exercise_id,v_set_number::smallint,v_reps); end loop;
      v_exercise_id:=null;
    end loop;
  end loop;
  return v_program_id;
end; $function$

