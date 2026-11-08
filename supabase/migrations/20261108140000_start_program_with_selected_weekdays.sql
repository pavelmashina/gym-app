CREATE OR REPLACE FUNCTION public.start_program_with_weekdays(p_program_id uuid, p_start_date date, p_weekdays integer[])
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid(); v_user_program_id uuid; v_scheduled_workout_id uuid; v_scheduled_exercise_id uuid;
  v_current_date date:=p_start_date; v_sequence integer:=0; v_cycle integer; v_repeat_total integer:=1;
  v_workout record; v_exercise record; v_set record; v_found_program uuid; v_schedule_mode text; v_structure_mode text; v_cycle_repeat_count integer; v_isodow integer; v_weekdays integer[];
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_start_date is null then raise exception 'Start date is required' using errcode='22023'; end if;
  if p_start_date<current_date then raise exception 'Start date cannot be in the past' using errcode='22023'; end if;
  select array_agg(distinct d order by d) into v_weekdays from unnest(p_weekdays) as d;
  if coalesce(cardinality(p_weekdays),0) not between 1 and 7
     or coalesce(cardinality(v_weekdays),0) <> cardinality(p_weekdays)
     or exists(select 1 from unnest(p_weekdays) d where d is null or d < 1 or d > 7) then
    raise exception 'Choose 1 to 7 distinct training days' using errcode='22023';
  end if;
  select p.id,p.schedule_mode,p.structure_mode,p.cycle_repeat_count into v_found_program,v_schedule_mode,v_structure_mode,v_cycle_repeat_count
  from public.programs p where p.id=p_program_id and p.owner_id=v_user_id and p.status<>'archived';
  if v_found_program is null then raise exception 'Program not found or unavailable' using errcode='P0002'; end if;
  v_repeat_total:=case when v_structure_mode='cycle' then greatest(1,v_cycle_repeat_count) else 1 end;
  v_isodow:=extract(isodow from p_start_date)::integer;
  if not (v_isodow = any(v_weekdays)) then raise exception 'First workout must be on a selected training day' using errcode='22023'; end if;
  if exists(select 1 from public.user_programs up where up.user_id=v_user_id and up.program_id=p_program_id and up.status in ('active','paused')) then raise exception 'Program is already active' using errcode='23505'; end if;
  insert into public.user_programs(user_id,program_id,status,start_date) values(v_user_id,p_program_id,'active',p_start_date) returning id into v_user_program_id;

  for v_cycle in 1..v_repeat_total loop
    for v_workout in
      select pw.week_number source_week_number,w.id workout_id,w.name workout_name,w.rest_days_after
      from public.program_weeks pw join public.program_workouts w on w.week_id=pw.id
      where pw.program_id=p_program_id order by pw.position,w.position
    loop
      v_sequence:=v_sequence+1;
      insert into public.scheduled_workouts(user_program_id,source_program_workout_id,sequence_number,week_number,cycle_number,workout_name,scheduled_date,status)
      values(v_user_program_id,v_workout.workout_id,v_sequence::smallint,
        case when v_structure_mode='cycle' then v_cycle::smallint else v_workout.source_week_number end,
        case when v_structure_mode='cycle' then v_cycle::smallint else null end,
        v_workout.workout_name,v_current_date,'scheduled') returning id into v_scheduled_workout_id;

      for v_exercise in
        select pwe.id source_id,pwe.exercise_id,pwe.exercise_name_snapshot,pwe.prescription_snapshot,pwe.position
        from public.program_workout_exercises pwe where pwe.workout_id=v_workout.workout_id order by pwe.position
      loop
        insert into public.scheduled_workout_exercises(scheduled_workout_id,source_program_workout_exercise_id,exercise_id,exercise_name_snapshot,prescription_snapshot,position)
        values(v_scheduled_workout_id,v_exercise.source_id,v_exercise.exercise_id,v_exercise.exercise_name_snapshot,v_exercise.prescription_snapshot,v_exercise.position)
        returning id into v_scheduled_exercise_id;
        for v_set in select pes.set_number,pes.reps from public.program_exercise_sets pes where pes.workout_exercise_id=v_exercise.source_id order by pes.set_number loop
          insert into public.scheduled_sets(scheduled_workout_exercise_id,set_number,planned_reps) values(v_scheduled_exercise_id,v_set.set_number,v_set.reps);
        end loop;
      end loop;

      loop
        v_current_date := v_current_date + 1;
        exit when extract(isodow from v_current_date)::integer = any(v_weekdays);
      end loop;
    end loop;
  end loop;
  if v_sequence=0 then raise exception 'Program has no workouts' using errcode='22023'; end if;
  return v_user_program_id;
end; $function$;
revoke all on function public.start_program_with_weekdays(uuid,date,integer[]) from public, anon;
grant execute on function public.start_program_with_weekdays(uuid,date,integer[]) to authenticated;
