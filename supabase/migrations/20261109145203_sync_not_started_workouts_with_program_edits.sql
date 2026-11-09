-- Program edits reach the workouts that have not started yet (GitHub issue #59).
--
-- Before: update_program_with_schedule rewrote the template but kept every
-- scheduled_workout_exercises / scheduled_sets snapshot from the day the user
-- joined, so Home and the workout screen kept the old exercise list.
--
-- Now, in the same transaction as the template rewrite, each active or paused
-- participation rebuilds its not-started workouts from the template. A workout
-- is not started when its status is 'scheduled' and it has no workout_sessions
-- row of any status. Plan position N maps to a template workout the same way
-- the rhythm code below already does: mod(N - 1, workouts_in_cycle) + 1 for
-- cycle programs and N for legacy week programs. Adding or removing cycle
-- workouts grows or trims the not-started tail, so the plan stays
-- workouts_in_cycle x cycle_repeat_count long.
--
-- Never touched: completed, skipped and cancelled workouts, workouts with a
-- session (active, completed or abandoned) and every workout session snapshot.
--
-- reorder_workout_session_exercises(..., 'program') also writes the new order
-- into the template now, so the next program edit keeps that order.

create or replace function public.update_program_with_schedule(p_program_id uuid, p_program jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid:=auth.uid(); v_program_id uuid; v_schedule_mode text:=coalesce(nullif(btrim(p_program->>'schedule_mode'),''),'custom');
  v_user_program record; v_scheduled record; v_last_fixed_sequence integer; v_last_fixed_date date; v_first_future_sequence integer; v_first_future_date date;
  v_current_date date; v_new_start_date date; v_rest_days_after integer; v_template_count integer; v_template_index integer; v_structure_mode text;
  v_cycle_repeat_count integer; v_plan_size integer; v_template_ids uuid[]; v_template_names text[]; v_template_weeks smallint[];
  v_not_started uuid[]; v_tail_date date;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if v_schedule_mode not in ('custom','weekly_mwf','weekly_tts','cycle_2_2') then raise exception 'Invalid schedule mode' using errcode='22023'; end if;
  v_program_id:=public.update_program_with_structure(p_program_id,p_program);
  update public.programs set schedule_mode=v_schedule_mode,updated_at=now() where id=v_program_id and owner_id=v_user_id;
  if not found then raise exception 'Program not found or access denied' using errcode='42501'; end if;
  select structure_mode,cycle_repeat_count into v_structure_mode,v_cycle_repeat_count from public.programs where id=v_program_id;

  -- The rewritten template in plan order: element i is template workout i.
  select array_agg(w.id order by pw.position,w.position),array_agg(w.name order by pw.position,w.position),array_agg(pw.week_number order by pw.position,w.position)
  into v_template_ids,v_template_names,v_template_weeks
  from public.program_weeks pw join public.program_workouts w on w.week_id=pw.id where pw.program_id=v_program_id;
  v_template_count:=coalesce(cardinality(v_template_ids),0);
  v_plan_size:=case when v_structure_mode='cycle' then v_template_count*greatest(1,coalesce(v_cycle_repeat_count,1)) else v_template_count end;

  for v_user_program in select up.id,up.start_date from public.user_programs up where up.user_id=v_user_id and up.program_id=v_program_id and up.status in ('active','paused') loop
    if v_template_count>0 then
      -- Workouts removed from the cycle: drop not-started plan positions past the new plan size.
      delete from public.scheduled_workouts sw
      where sw.user_program_id=v_user_program.id and sw.status='scheduled' and sw.sequence_number>v_plan_size
        and not exists(select 1 from public.workout_sessions ws where ws.scheduled_workout_id=sw.id);

      -- Workouts added to the cycle: create the missing plan positions. The date pass below places them.
      select greatest(current_date,coalesce(max(sw.scheduled_date),current_date)) into v_tail_date
      from public.scheduled_workouts sw where sw.user_program_id=v_user_program.id;
      insert into public.scheduled_workouts(user_program_id,source_program_workout_id,sequence_number,week_number,cycle_number,workout_name,scheduled_date,status)
      select v_user_program.id,v_template_ids[plan.template_index],plan.sequence_number::smallint,
        coalesce(plan.cycle_number,v_template_weeks[plan.template_index]),plan.cycle_number,v_template_names[plan.template_index],v_tail_date,'scheduled'
      from (
        select n sequence_number,
          case when v_structure_mode='cycle' then mod(n-1,v_template_count)+1 else n end template_index,
          case when v_structure_mode='cycle' then ((n-1)/v_template_count+1)::smallint end cycle_number
        from generate_series(1,v_plan_size) n
      ) plan
      where not exists(select 1 from public.scheduled_workouts sw where sw.user_program_id=v_user_program.id and sw.sequence_number=plan.sequence_number);

      -- Rebuild every not-started workout from its template workout. Row IDs stay the same.
      select coalesce(array_agg(sw.id),'{}') into v_not_started
      from public.scheduled_workouts sw
      where sw.user_program_id=v_user_program.id and sw.status='scheduled'
        and not exists(select 1 from public.workout_sessions ws where ws.scheduled_workout_id=sw.id);

      update public.scheduled_workouts sw
      set source_program_workout_id=v_template_ids[plan.template_index],
          workout_name=v_template_names[plan.template_index],
          week_number=coalesce(plan.cycle_number,v_template_weeks[plan.template_index]),
          cycle_number=plan.cycle_number
      from (
        select s.id,
          case when v_structure_mode='cycle' then mod(s.sequence_number-1,v_template_count)+1 else s.sequence_number end template_index,
          case when v_structure_mode='cycle' then ((s.sequence_number-1)/v_template_count+1)::smallint end cycle_number
        from public.scheduled_workouts s where s.id=any(v_not_started)
      ) plan
      where sw.id=plan.id;

      delete from public.scheduled_workout_exercises swe where swe.scheduled_workout_id=any(v_not_started);
      insert into public.scheduled_workout_exercises(scheduled_workout_id,source_program_workout_exercise_id,exercise_id,exercise_name_snapshot,prescription_snapshot,position)
      select sw.id,pwe.id,pwe.exercise_id,pwe.exercise_name_snapshot,pwe.prescription_snapshot,pwe.position
      from public.scheduled_workouts sw join public.program_workout_exercises pwe on pwe.workout_id=sw.source_program_workout_id
      where sw.id=any(v_not_started);
      insert into public.scheduled_sets(scheduled_workout_exercise_id,set_number,planned_reps)
      select swe.id,pes.set_number,pes.reps
      from public.scheduled_workout_exercises swe join public.program_exercise_sets pes on pes.workout_exercise_id=swe.source_program_workout_exercise_id
      where swe.scheduled_workout_id=any(v_not_started);

      -- A shorter plan may leave nothing to do: finish the participation the way skip and complete do.
      if not exists(select 1 from public.scheduled_workouts sw where sw.user_program_id=v_user_program.id and sw.status='scheduled') then
        update public.user_programs set status='completed',completed_at=now(),updated_at=now() where id=v_user_program.id and user_id=v_user_id;
        continue;
      end if;
    end if;

    v_last_fixed_sequence:=null; v_last_fixed_date:=null; v_first_future_sequence:=null; v_first_future_date:=null; v_new_start_date:=null;
    select sw.sequence_number,sw.scheduled_date into v_last_fixed_sequence,v_last_fixed_date from public.scheduled_workouts sw
    where sw.user_program_id=v_user_program.id and (sw.scheduled_date<current_date or sw.status in ('completed','skipped')) order by sw.sequence_number desc limit 1;
    select sw.sequence_number,sw.scheduled_date into v_first_future_sequence,v_first_future_date from public.scheduled_workouts sw
    where sw.user_program_id=v_user_program.id and sw.status='scheduled' and sw.scheduled_date>=current_date and (v_last_fixed_sequence is null or sw.sequence_number>v_last_fixed_sequence)
    order by sw.sequence_number limit 1;
    if v_first_future_sequence is null then continue; end if;

    if v_last_fixed_sequence is null then
      v_current_date:=case when v_first_future_sequence=1 then greatest(v_user_program.start_date,current_date) else greatest(v_first_future_date,current_date) end;
    else
      v_current_date:=v_last_fixed_date;
      if v_schedule_mode='weekly_mwf' then loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (1,3,5); end loop;
      elsif v_schedule_mode='weekly_tts' then loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (2,4,6); end loop;
      elsif v_schedule_mode='cycle_2_2' then v_current_date:=v_current_date+case when mod(v_last_fixed_sequence,2)=1 then 1 else 3 end;
      else
        v_template_index:=case when v_structure_mode='cycle' and v_template_count>0 then mod(v_last_fixed_sequence-1,v_template_count)+1 else v_last_fixed_sequence end;
        select numbered.rest_days_after into v_rest_days_after from (
          select row_number() over(order by pw.position,w.position)::integer sequence_number,w.rest_days_after
          from public.program_weeks pw join public.program_workouts w on w.week_id=pw.id where pw.program_id=v_program_id
        ) numbered where numbered.sequence_number=v_template_index;
        v_current_date:=v_current_date+(1+coalesce(v_rest_days_after,1));
      end if;
      if v_current_date<current_date then v_current_date:=current_date; end if;
    end if;
    if v_schedule_mode='weekly_mwf' then while extract(isodow from v_current_date)::integer not in (1,3,5) loop v_current_date:=v_current_date+1; end loop;
    elsif v_schedule_mode='weekly_tts' then while extract(isodow from v_current_date)::integer not in (2,4,6) loop v_current_date:=v_current_date+1; end loop; end if;
    v_new_start_date:=v_current_date;

    for v_scheduled in select sw.id,sw.sequence_number from public.scheduled_workouts sw where sw.user_program_id=v_user_program.id and sw.status='scheduled' and sw.sequence_number>=v_first_future_sequence order by sw.sequence_number loop
      update public.scheduled_workouts set scheduled_date=v_current_date where id=v_scheduled.id;
      if v_schedule_mode='weekly_mwf' then loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (1,3,5); end loop;
      elsif v_schedule_mode='weekly_tts' then loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (2,4,6); end loop;
      elsif v_schedule_mode='cycle_2_2' then v_current_date:=v_current_date+case when mod(v_scheduled.sequence_number,2)=1 then 1 else 3 end;
      else
        v_template_index:=case when v_structure_mode='cycle' and v_template_count>0 then mod(v_scheduled.sequence_number-1,v_template_count)+1 else v_scheduled.sequence_number end;
        select numbered.rest_days_after into v_rest_days_after from (
          select row_number() over(order by pw.position,w.position)::integer sequence_number,w.rest_days_after
          from public.program_weeks pw join public.program_workouts w on w.week_id=pw.id where pw.program_id=v_program_id
        ) numbered where numbered.sequence_number=v_template_index;
        v_current_date:=v_current_date+(1+coalesce(v_rest_days_after,1));
      end if;
    end loop;
    update public.user_programs set start_date=case when v_first_future_sequence=1 then v_new_start_date else start_date end,updated_at=now() where id=v_user_program.id;
  end loop;
  return v_program_id;
end;
$function$;

create or replace function public.reorder_workout_session_exercises(p_workout_session_id uuid, p_ordered_exercise_ids uuid[], p_scope text default 'session')
returns uuid
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_user_id uuid := auth.uid();
  v_scheduled_workout_id uuid;
  v_user_program_id uuid;
  v_source_program_workout_id uuid;
  v_count integer;
  v_distinct_count integer;
  v_item uuid;
  v_position integer := 0;
  v_source_order uuid[];
  v_future record;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_scope not in ('session', 'program') then
    raise exception 'Invalid reorder scope' using errcode = '22023';
  end if;
  if p_ordered_exercise_ids is null or cardinality(p_ordered_exercise_ids) = 0 then
    raise exception 'Exercise order is required' using errcode = '22023';
  end if;

  select ws.scheduled_workout_id, sw.user_program_id, sw.source_program_workout_id
    into v_scheduled_workout_id, v_user_program_id, v_source_program_workout_id
  from public.workout_sessions ws
  join public.scheduled_workouts sw on sw.id = ws.scheduled_workout_id
  where ws.id = p_workout_session_id
    and ws.user_id = v_user_id
    and ws.status = 'active';

  if v_scheduled_workout_id is null then
    raise exception 'Active workout session not found or access denied' using errcode = 'P0002';
  end if;

  select count(*) into v_count
  from public.workout_session_exercises
  where workout_session_id = p_workout_session_id;

  select count(distinct value) into v_distinct_count
  from unnest(p_ordered_exercise_ids) as value;

  if cardinality(p_ordered_exercise_ids) <> v_count or v_distinct_count <> v_count then
    raise exception 'Exercise order must contain every session exercise exactly once' using errcode = '22023';
  end if;

  if exists (
    select 1
    from unnest(p_ordered_exercise_ids) as requested(id)
    where not exists (
      select 1 from public.workout_session_exercises wse
      where wse.id = requested.id and wse.workout_session_id = p_workout_session_id
    )
  ) then
    raise exception 'Exercise order contains an invalid session exercise' using errcode = '22023';
  end if;

  update public.workout_session_exercises
  set position = position + 1000
  where workout_session_id = p_workout_session_id;

  v_position := 0;
  foreach v_item in array p_ordered_exercise_ids loop
    v_position := v_position + 1;
    update public.workout_session_exercises
    set position = v_position
    where id = v_item and workout_session_id = p_workout_session_id;
  end loop;

  if p_scope = 'program' then
    if v_source_program_workout_id is null then
      raise exception 'This workout is not linked to a reusable program workout' using errcode = '22023';
    end if;

    select array_agg(swe.source_program_workout_exercise_id order by requested.ordinality)
      into v_source_order
    from unnest(p_ordered_exercise_ids) with ordinality as requested(id, ordinality)
    join public.workout_session_exercises wse on wse.id = requested.id
    join public.scheduled_workout_exercises swe on swe.id = wse.source_scheduled_workout_exercise_id;

    if v_source_order is null
       or cardinality(v_source_order) <> v_count
       or exists (select 1 from unnest(v_source_order) source_id where source_id is null) then
      raise exception 'Unable to map this session order back to the program snapshot' using errcode = '22023';
    end if;

    -- Program edits rebuild not-started workouts from the template, so the order must live there too.
    if (select count(*) from public.program_workout_exercises pwe where pwe.workout_id = v_source_program_workout_id) = v_count
       and not exists (
         select 1 from unnest(v_source_order) source_id
         where not exists (
           select 1 from public.program_workout_exercises pwe
           where pwe.id = source_id and pwe.workout_id = v_source_program_workout_id
         )
       ) then
      update public.program_workout_exercises
      set position = position + 1000
      where workout_id = v_source_program_workout_id;

      v_position := 0;
      foreach v_item in array v_source_order loop
        v_position := v_position + 1;
        update public.program_workout_exercises
        set position = v_position
        where id = v_item and workout_id = v_source_program_workout_id;
      end loop;
    end if;

    for v_future in
      select sw.id
      from public.scheduled_workouts sw
      where sw.user_program_id = v_user_program_id
        and sw.source_program_workout_id = v_source_program_workout_id
        and sw.status = 'scheduled'
        and sw.id <> v_scheduled_workout_id
        and sw.scheduled_date >= current_date
      order by sw.sequence_number
    loop
      if (select count(*) from public.scheduled_workout_exercises swe where swe.scheduled_workout_id = v_future.id) <> v_count then
        continue;
      end if;

      update public.scheduled_workout_exercises
      set position = position + 1000
      where scheduled_workout_id = v_future.id;

      v_position := 0;
      foreach v_item in array v_source_order loop
        v_position := v_position + 1;
        update public.scheduled_workout_exercises
        set position = v_position
        where scheduled_workout_id = v_future.id
          and source_program_workout_exercise_id = v_item;
      end loop;
    end loop;
  end if;

  return p_workout_session_id;
end;
$function$;

revoke all on function public.update_program_with_schedule(uuid, jsonb) from public, anon;
grant execute on function public.update_program_with_schedule(uuid, jsonb) to authenticated;
revoke all on function public.reorder_workout_session_exercises(uuid, uuid[], text) from public, anon;
grant execute on function public.reorder_workout_session_exercises(uuid, uuid[], text) to authenticated;
