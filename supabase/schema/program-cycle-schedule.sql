-- Schedule behavior for repeated-cycle programs.
-- Cycle programs expand the single template cycle cycle_repeat_count times on enrollment.
-- Rhythm edits change only future scheduled dates; snapshot content and history stay immutable.

create or replace function public.create_program_with_schedule(p_program jsonb)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_program_id uuid;
  v_schedule_mode text:=coalesce(nullif(btrim(p_program->>'schedule_mode'),''),'custom');
begin
  if v_schedule_mode not in ('custom','weekly_mwf','weekly_tts','cycle_2_2') then
    raise exception 'Invalid schedule mode' using errcode='22023';
  end if;
  v_program_id:=public.create_program_with_structure(p_program);
  update public.programs
  set schedule_mode=v_schedule_mode,updated_at=now()
  where id=v_program_id and owner_id=(select auth.uid());
  if not found then raise exception 'Program not found or access denied' using errcode='42501'; end if;
  return v_program_id;
end;
$$;

create or replace function public.update_program_with_schedule(p_program_id uuid,p_program jsonb)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid();
  v_program_id uuid;
  v_schedule_mode text:=coalesce(nullif(btrim(p_program->>'schedule_mode'),''),'custom');
  v_user_program record;
  v_scheduled record;
  v_last_fixed_sequence integer;
  v_last_fixed_date date;
  v_first_future_sequence integer;
  v_first_future_date date;
  v_current_date date;
  v_new_start_date date;
  v_rest_days_after integer;
  v_template_count integer;
  v_template_index integer;
  v_structure_mode text;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if v_schedule_mode not in ('custom','weekly_mwf','weekly_tts','cycle_2_2') then raise exception 'Invalid schedule mode' using errcode='22023'; end if;

  v_program_id:=public.update_program_with_structure(p_program_id,p_program);
  update public.programs set schedule_mode=v_schedule_mode,updated_at=now()
  where id=v_program_id and owner_id=v_user_id;
  if not found then raise exception 'Program not found or access denied' using errcode='42501'; end if;

  select structure_mode into v_structure_mode from public.programs where id=v_program_id;
  select count(*) into v_template_count
  from public.program_weeks pw
  join public.program_workouts w on w.week_id=pw.id
  where pw.program_id=v_program_id;

  for v_user_program in
    select up.id,up.start_date
    from public.user_programs up
    where up.user_id=v_user_id and up.program_id=v_program_id and up.status in ('active','paused')
  loop
    v_last_fixed_sequence:=null;
    v_last_fixed_date:=null;
    v_first_future_sequence:=null;
    v_first_future_date:=null;
    v_new_start_date:=null;

    select sw.sequence_number,sw.scheduled_date
    into v_last_fixed_sequence,v_last_fixed_date
    from public.scheduled_workouts sw
    where sw.user_program_id=v_user_program.id
      and (sw.scheduled_date<current_date or sw.status in ('completed','skipped'))
    order by sw.sequence_number desc
    limit 1;

    select sw.sequence_number,sw.scheduled_date
    into v_first_future_sequence,v_first_future_date
    from public.scheduled_workouts sw
    where sw.user_program_id=v_user_program.id
      and sw.status='scheduled'
      and sw.scheduled_date>=current_date
      and (v_last_fixed_sequence is null or sw.sequence_number>v_last_fixed_sequence)
    order by sw.sequence_number
    limit 1;

    if v_first_future_sequence is null then continue; end if;

    if v_last_fixed_sequence is null then
      v_current_date:=case
        when v_first_future_sequence=1 then greatest(v_user_program.start_date,current_date)
        else greatest(v_first_future_date,current_date)
      end;
    else
      v_current_date:=v_last_fixed_date;
      if v_schedule_mode='weekly_mwf' then
        loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (1,3,5); end loop;
      elsif v_schedule_mode='weekly_tts' then
        loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (2,4,6); end loop;
      elsif v_schedule_mode='cycle_2_2' then
        v_current_date:=v_current_date+case when mod(v_last_fixed_sequence,2)=1 then 1 else 3 end;
      else
        v_template_index:=case when v_structure_mode='cycle' and v_template_count>0 then mod(v_last_fixed_sequence-1,v_template_count)+1 else v_last_fixed_sequence end;
        select numbered.rest_days_after into v_rest_days_after
        from (
          select row_number() over(order by pw.position,w.position)::integer sequence_number,w.rest_days_after
          from public.program_weeks pw
          join public.program_workouts w on w.week_id=pw.id
          where pw.program_id=v_program_id
        ) numbered
        where numbered.sequence_number=v_template_index;
        v_current_date:=v_current_date+(1+coalesce(v_rest_days_after,1));
      end if;
      if v_current_date<current_date then v_current_date:=current_date; end if;
    end if;

    if v_schedule_mode='weekly_mwf' then
      while extract(isodow from v_current_date)::integer not in (1,3,5) loop v_current_date:=v_current_date+1; end loop;
    elsif v_schedule_mode='weekly_tts' then
      while extract(isodow from v_current_date)::integer not in (2,4,6) loop v_current_date:=v_current_date+1; end loop;
    end if;
    v_new_start_date:=v_current_date;

    for v_scheduled in
      select sw.id,sw.sequence_number
      from public.scheduled_workouts sw
      where sw.user_program_id=v_user_program.id
        and sw.status='scheduled'
        and sw.sequence_number>=v_first_future_sequence
      order by sw.sequence_number
    loop
      update public.scheduled_workouts set scheduled_date=v_current_date where id=v_scheduled.id;
      if v_schedule_mode='weekly_mwf' then
        loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (1,3,5); end loop;
      elsif v_schedule_mode='weekly_tts' then
        loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (2,4,6); end loop;
      elsif v_schedule_mode='cycle_2_2' then
        v_current_date:=v_current_date+case when mod(v_scheduled.sequence_number,2)=1 then 1 else 3 end;
      else
        v_template_index:=case when v_structure_mode='cycle' and v_template_count>0 then mod(v_scheduled.sequence_number-1,v_template_count)+1 else v_scheduled.sequence_number end;
        select numbered.rest_days_after into v_rest_days_after
        from (
          select row_number() over(order by pw.position,w.position)::integer sequence_number,w.rest_days_after
          from public.program_weeks pw
          join public.program_workouts w on w.week_id=pw.id
          where pw.program_id=v_program_id
        ) numbered
        where numbered.sequence_number=v_template_index;
        v_current_date:=v_current_date+(1+coalesce(v_rest_days_after,1));
      end if;
    end loop;

    update public.user_programs
    set start_date=case when v_first_future_sequence=1 then v_new_start_date else start_date end,
        updated_at=now()
    where id=v_user_program.id;
  end loop;

  return v_program_id;
end;
$$;

create or replace function public.start_program(p_program_id uuid,p_start_date date)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid();
  v_user_program_id uuid;
  v_scheduled_workout_id uuid;
  v_scheduled_exercise_id uuid;
  v_current_date date:=p_start_date;
  v_sequence integer:=0;
  v_cycle integer;
  v_repeat_total integer:=1;
  v_workout record;
  v_exercise record;
  v_set record;
  v_found_program uuid;
  v_schedule_mode text;
  v_structure_mode text;
  v_cycle_repeat_count integer;
  v_isodow integer;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_start_date is null then raise exception 'Start date is required' using errcode='22023'; end if;
  if p_start_date<current_date then raise exception 'Start date cannot be in the past' using errcode='22023'; end if;

  select p.id,p.schedule_mode,p.structure_mode,p.cycle_repeat_count
  into v_found_program,v_schedule_mode,v_structure_mode,v_cycle_repeat_count
  from public.programs p
  where p.id=p_program_id and p.status<>'archived';
  if v_found_program is null then raise exception 'Program not found or unavailable' using errcode='P0002'; end if;

  v_repeat_total:=case when v_structure_mode='cycle' then greatest(1,v_cycle_repeat_count) else 1 end;
  v_isodow:=extract(isodow from p_start_date)::integer;
  if v_schedule_mode='weekly_mwf' and v_isodow not in (1,3,5) then raise exception 'First workout must be Monday, Wednesday or Friday' using errcode='22023'; end if;
  if v_schedule_mode='weekly_tts' and v_isodow not in (2,4,6) then raise exception 'First workout must be Tuesday, Thursday or Saturday' using errcode='22023'; end if;
  if exists(select 1 from public.user_programs up where up.user_id=v_user_id and up.program_id=p_program_id and up.status in ('active','paused')) then raise exception 'Program is already active' using errcode='23505'; end if;

  insert into public.user_programs(user_id,program_id,status,start_date)
  values(v_user_id,p_program_id,'active',p_start_date)
  returning id into v_user_program_id;

  for v_cycle in 1..v_repeat_total loop
    for v_workout in
      select pw.week_number source_week_number,w.id workout_id,w.name workout_name,w.rest_days_after
      from public.program_weeks pw
      join public.program_workouts w on w.week_id=pw.id
      where pw.program_id=p_program_id
      order by pw.position,w.position
    loop
      v_sequence:=v_sequence+1;
      insert into public.scheduled_workouts(
        user_program_id,source_program_workout_id,sequence_number,week_number,cycle_number,workout_name,scheduled_date,status
      ) values(
        v_user_program_id,v_workout.workout_id,v_sequence::smallint,
        case when v_structure_mode='cycle' then v_cycle::smallint else v_workout.source_week_number end,
        case when v_structure_mode='cycle' then v_cycle::smallint else null end,
        v_workout.workout_name,v_current_date,'scheduled'
      ) returning id into v_scheduled_workout_id;

      for v_exercise in
        select pwe.id source_id,pwe.exercise_id,pwe.exercise_name_snapshot,pwe.prescription_snapshot,pwe.position
        from public.program_workout_exercises pwe
        where pwe.workout_id=v_workout.workout_id
        order by pwe.position
      loop
        insert into public.scheduled_workout_exercises(
          scheduled_workout_id,source_program_workout_exercise_id,exercise_id,exercise_name_snapshot,prescription_snapshot,position
        ) values(
          v_scheduled_workout_id,v_exercise.source_id,v_exercise.exercise_id,v_exercise.exercise_name_snapshot,v_exercise.prescription_snapshot,v_exercise.position
        ) returning id into v_scheduled_exercise_id;
        for v_set in
          select pes.set_number,pes.reps
          from public.program_exercise_sets pes
          where pes.workout_exercise_id=v_exercise.source_id
          order by pes.set_number
        loop
          insert into public.scheduled_sets(scheduled_workout_exercise_id,set_number,planned_reps)
          values(v_scheduled_exercise_id,v_set.set_number,v_set.reps);
        end loop;
      end loop;

      if v_schedule_mode='weekly_mwf' then
        loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (1,3,5); end loop;
      elsif v_schedule_mode='weekly_tts' then
        loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (2,4,6); end loop;
      elsif v_schedule_mode='cycle_2_2' then
        v_current_date:=v_current_date+case when mod(v_sequence,2)=1 then 1 else 3 end;
      else
        v_current_date:=v_current_date+(1+coalesce(v_workout.rest_days_after,1));
      end if;
    end loop;
  end loop;

  if v_sequence=0 then raise exception 'Program has no workouts' using errcode='22023'; end if;
  return v_user_program_id;
end;
$$;

create or replace function public.change_program_start_date(p_user_program_id uuid,p_start_date date)
returns uuid
language plpgsql
security invoker
set search_path=''
as $$
declare
  v_user_id uuid:=auth.uid();
  v_program_id uuid;
  v_schedule_mode text;
  v_structure_mode text;
  v_current_date date:=p_start_date;
  v_scheduled record;
  v_rest_days_after integer;
  v_isodow integer;
  v_template_count integer;
  v_template_index integer;
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_start_date is null then raise exception 'Start date is required' using errcode='22023'; end if;
  if p_start_date<current_date then raise exception 'Start date cannot be in the past' using errcode='22023'; end if;

  select up.program_id,p.schedule_mode,p.structure_mode
  into v_program_id,v_schedule_mode,v_structure_mode
  from public.user_programs up
  join public.programs p on p.id=up.program_id
  where up.id=p_user_program_id and up.user_id=v_user_id and up.status in ('active','paused');
  if v_program_id is null then raise exception 'Program participation not found or unavailable' using errcode='P0002'; end if;

  if exists(
    select 1 from public.scheduled_workouts sw
    join public.workout_sessions ws on ws.scheduled_workout_id=sw.id
    where sw.user_program_id=p_user_program_id
  ) then raise exception 'Program has already started' using errcode='22023'; end if;
  if exists(select 1 from public.scheduled_workouts sw where sw.user_program_id=p_user_program_id and sw.status<>'scheduled') then raise exception 'Program schedule already contains workout history' using errcode='22023'; end if;

  v_isodow:=extract(isodow from p_start_date)::integer;
  if v_schedule_mode='weekly_mwf' and v_isodow not in (1,3,5) then raise exception 'First workout must be Monday, Wednesday or Friday' using errcode='22023'; end if;
  if v_schedule_mode='weekly_tts' and v_isodow not in (2,4,6) then raise exception 'First workout must be Tuesday, Thursday or Saturday' using errcode='22023'; end if;

  select count(*) into v_template_count
  from public.program_weeks pw
  join public.program_workouts w on w.week_id=pw.id
  where pw.program_id=v_program_id;

  for v_scheduled in
    select sw.id,sw.sequence_number
    from public.scheduled_workouts sw
    where sw.user_program_id=p_user_program_id
    order by sw.sequence_number
  loop
    update public.scheduled_workouts set scheduled_date=v_current_date where id=v_scheduled.id;
    if v_schedule_mode='weekly_mwf' then
      loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (1,3,5); end loop;
    elsif v_schedule_mode='weekly_tts' then
      loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (2,4,6); end loop;
    elsif v_schedule_mode='cycle_2_2' then
      v_current_date:=v_current_date+case when mod(v_scheduled.sequence_number,2)=1 then 1 else 3 end;
    else
      v_template_index:=case when v_structure_mode='cycle' and v_template_count>0 then mod(v_scheduled.sequence_number-1,v_template_count)+1 else v_scheduled.sequence_number end;
      select numbered.rest_days_after into v_rest_days_after
      from (
        select row_number() over(order by pw.position,w.position)::integer sequence_number,w.rest_days_after
        from public.program_weeks pw
        join public.program_workouts w on w.week_id=pw.id
        where pw.program_id=v_program_id
      ) numbered
      where numbered.sequence_number=v_template_index;
      v_current_date:=v_current_date+(1+coalesce(v_rest_days_after,1));
    end if;
  end loop;

  update public.user_programs
  set start_date=p_start_date,updated_at=now()
  where id=p_user_program_id and user_id=v_user_id;
  return p_user_program_id;
end;
$$;

revoke all on function public.create_program_with_schedule(jsonb) from public,anon;
revoke all on function public.update_program_with_schedule(uuid,jsonb) from public,anon;
revoke all on function public.start_program(uuid,date) from public,anon;
revoke all on function public.change_program_start_date(uuid,date) from public,anon;
grant execute on function public.create_program_with_schedule(jsonb) to authenticated;
grant execute on function public.update_program_with_schedule(uuid,jsonb) to authenticated;
grant execute on function public.start_program(uuid,date) to authenticated;
grant execute on function public.change_program_start_date(uuid,date) to authenticated;
