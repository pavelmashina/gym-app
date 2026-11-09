-- Keep the weekdays chosen when joining a ready-made program (GitHub issue #70).
--
-- Before: start_program_with_weekdays laid the plan on the chosen ISO weekdays
-- (for example Mon/Wed/Fri) but stored them nowhere, and the program stays in
-- schedule_mode 'custom'. Every later date pass (saving the program, resume,
-- reschedule, start-date change) re-laid the remaining workouts by
-- rest_days_after, so Mon/Wed/Fri turned into "every other day".
--
-- Now the participation remembers the days in user_programs.training_weekdays.
-- While the program is in 'custom' mode, every date pass puts the remaining
-- workouts on the next chosen weekday instead of using rest_days_after:
--   * update_program_with_schedule: the first re-laid workout goes on the first
--     chosen weekday after the fixed history and not before today; the rest
--     follow on the next chosen weekdays. Choosing a preset rhythm in the editor
--     (weekly_mwf, weekly_tts, cycle_2_2) replaces the chosen weekdays and
--     clears them.
--   * resume_program, reschedule_scheduled_workout, the 'tail' scope of
--     reschedule_scheduled_workout_scoped and change_program_start_date keep the
--     date the user picked for the first workout and put the following ones on
--     the chosen weekdays.
-- Participations without chosen weekdays (NULL) behave exactly as before.
--
-- Builds on 20261109145203_sync_not_started_workouts_with_program_edits.sql
-- (issue #59): update_program_with_schedule below is that version plus the
-- weekday steps. The other functions are the live versions plus the same step.

alter table public.user_programs add column if not exists training_weekdays integer[];

alter table public.user_programs drop constraint if exists user_programs_training_weekdays_check;
alter table public.user_programs add constraint user_programs_training_weekdays_check check (
  training_weekdays is null
  or (cardinality(training_weekdays) between 1 and 7 and training_weekdays <@ array[1,2,3,4,5,6,7])
);

comment on column public.user_programs.training_weekdays is
  'ISO weekdays (1=Mon..7=Sun) chosen when joining; while the program is in custom mode the remaining workouts stay on these days. NULL = follow the program rhythm.';

-- Participations joined on chosen weekdays before this migration. The join screen
-- writes the days into programs.details.schedule ("Понедельник, среда, пятница").
-- Only plans that still lie exactly on those days are marked: a plan already
-- re-laid by a save, or one moved by hand, keeps its current behaviour.
with labelled as (
  select up.id,
    (select case when count(*)>0 and bool_and(iso_day is not null) then array_agg(distinct iso_day order by iso_day) end
     from (
       select case btrim(token)
         when 'понедельник' then 1 when 'Понедельник' then 1
         when 'вторник' then 2 when 'Вторник' then 2
         when 'среда' then 3 when 'Среда' then 3
         when 'четверг' then 4 when 'Четверг' then 4
         when 'пятница' then 5 when 'Пятница' then 5
         when 'суббота' then 6 when 'Суббота' then 6
         when 'воскресенье' then 7 when 'Воскресенье' then 7
       end iso_day
       from regexp_split_to_table(p.details->>'schedule', ',') token
     ) days) weekdays
  from public.user_programs up join public.programs p on p.id=up.program_id
  where up.status in ('active','paused') and up.training_weekdays is null
    and p.schedule_mode='custom' and nullif(btrim(p.details->>'schedule'),'') is not null
)
update public.user_programs up set training_weekdays=l.weekdays
from labelled l
where up.id=l.id and l.weekdays is not null
  and exists(select 1 from public.scheduled_workouts sw where sw.user_program_id=l.id and sw.status<>'cancelled')
  and not exists(
    select 1 from (
      select sw.scheduled_date day_date, lag(sw.scheduled_date) over(order by sw.sequence_number) previous_date
      from public.scheduled_workouts sw where sw.user_program_id=l.id and sw.status<>'cancelled'
    ) laid
    where not (extract(isodow from laid.day_date)::integer = any(l.weekdays))
       or (laid.previous_date is not null and laid.day_date <> (
         select min(laid.previous_date + offset_days) from generate_series(1,7) offset_days
         where extract(isodow from laid.previous_date + offset_days)::integer = any(l.weekdays)))
  );

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
  insert into public.user_programs(user_id,program_id,status,start_date,training_weekdays) values(v_user_id,p_program_id,'active',p_start_date,v_weekdays) returning id into v_user_program_id;

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
  v_not_started uuid[]; v_tail_date date; v_weekdays integer[];
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if v_schedule_mode not in ('custom','weekly_mwf','weekly_tts','cycle_2_2') then raise exception 'Invalid schedule mode' using errcode='22023'; end if;
  v_program_id:=public.update_program_with_structure(p_program_id,p_program);
  update public.programs set schedule_mode=v_schedule_mode,updated_at=now() where id=v_program_id and owner_id=v_user_id;
  if not found then raise exception 'Program not found or access denied' using errcode='42501'; end if;
  select structure_mode,cycle_repeat_count into v_structure_mode,v_cycle_repeat_count from public.programs where id=v_program_id;
  -- A preset rhythm chosen in the editor (Пн·Ср·Пт, Вт·Чт·Сб, 2/2) replaces the weekdays chosen when joining.
  if v_schedule_mode<>'custom' then
    update public.user_programs set training_weekdays=null,updated_at=now()
    where user_id=v_user_id and program_id=v_program_id and status in ('active','paused') and training_weekdays is not null;
  end if;

  -- The rewritten template in plan order: element i is template workout i.
  select array_agg(w.id order by pw.position,w.position),array_agg(w.name order by pw.position,w.position),array_agg(pw.week_number order by pw.position,w.position)
  into v_template_ids,v_template_names,v_template_weeks
  from public.program_weeks pw join public.program_workouts w on w.week_id=pw.id where pw.program_id=v_program_id;
  v_template_count:=coalesce(cardinality(v_template_ids),0);
  v_plan_size:=case when v_structure_mode='cycle' then v_template_count*greatest(1,coalesce(v_cycle_repeat_count,1)) else v_template_count end;

  for v_user_program in select up.id,up.start_date,up.training_weekdays from public.user_programs up where up.user_id=v_user_id and up.program_id=v_program_id and up.status in ('active','paused') loop
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

    -- Joined on chosen weekdays: the remaining workouts stay on those weekdays instead of rest_days_after.
    v_weekdays:=case when v_schedule_mode='custom' then v_user_program.training_weekdays end;
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
      if v_weekdays is not null then v_current_date:=greatest(v_current_date,current_date-1); loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer=any(v_weekdays); end loop;
      elsif v_schedule_mode='weekly_mwf' then loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (1,3,5); end loop;
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
      if v_weekdays is not null then loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer=any(v_weekdays); end loop;
      elsif v_schedule_mode='weekly_mwf' then loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (1,3,5); end loop;
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

CREATE OR REPLACE FUNCTION public.change_program_start_date(p_user_program_id uuid, p_start_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid:=auth.uid(); v_program_id uuid; v_schedule_mode text; v_structure_mode text; v_current_date date:=p_start_date;
  v_scheduled record; v_rest_days_after integer; v_isodow integer; v_template_count integer; v_template_index integer; v_weekdays integer[];
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_start_date is null then raise exception 'Start date is required' using errcode='22023'; end if;
  if p_start_date<current_date then raise exception 'Start date cannot be in the past' using errcode='22023'; end if;
  select up.program_id,p.schedule_mode,p.structure_mode,case when p.schedule_mode='custom' then up.training_weekdays end into v_program_id,v_schedule_mode,v_structure_mode,v_weekdays
  from public.user_programs up join public.programs p on p.id=up.program_id
  where up.id=p_user_program_id and up.user_id=v_user_id and up.status in ('active','paused');
  if v_program_id is null then raise exception 'Program participation not found or unavailable' using errcode='P0002'; end if;
  if exists(select 1 from public.scheduled_workouts sw join public.workout_sessions ws on ws.scheduled_workout_id=sw.id where sw.user_program_id=p_user_program_id) then raise exception 'Program has already started' using errcode='22023'; end if;
  if exists(select 1 from public.scheduled_workouts sw where sw.user_program_id=p_user_program_id and sw.status<>'scheduled') then raise exception 'Program schedule already contains workout history' using errcode='22023'; end if;
  v_isodow:=extract(isodow from p_start_date)::integer;
  if v_schedule_mode='weekly_mwf' and v_isodow not in (1,3,5) then raise exception 'First workout must be Monday, Wednesday or Friday' using errcode='22023'; end if;
  if v_schedule_mode='weekly_tts' and v_isodow not in (2,4,6) then raise exception 'First workout must be Tuesday, Thursday or Saturday' using errcode='22023'; end if;
  select count(*) into v_template_count from public.program_weeks pw join public.program_workouts w on w.week_id=pw.id where pw.program_id=v_program_id;

  for v_scheduled in select sw.id,sw.sequence_number from public.scheduled_workouts sw where sw.user_program_id=p_user_program_id order by sw.sequence_number loop
    update public.scheduled_workouts set scheduled_date=v_current_date where id=v_scheduled.id;
    if v_weekdays is not null then loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer=any(v_weekdays); end loop;
    elsif v_schedule_mode='weekly_mwf' then loop v_current_date:=v_current_date+1; exit when extract(isodow from v_current_date)::integer in (1,3,5); end loop;
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
  update public.user_programs set start_date=p_start_date,updated_at=now() where id=p_user_program_id and user_id=v_user_id;
  return p_user_program_id;
end; $function$;

CREATE OR REPLACE FUNCTION public.resume_program(p_user_program_id uuid, p_resume_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_program_id uuid;
  v_schedule_mode text;
  v_structure_mode text;
  v_first_sequence integer;
  v_current_date date := p_resume_date;
  v_template_count integer;
  v_template_index integer;
  v_rest_days_after integer;
  v_isodow integer;
  v_row record;
  v_weekdays integer[];
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_resume_date is null then
    raise exception 'Resume date is required' using errcode = '22023';
  end if;
  if p_resume_date < current_date then
    raise exception 'Resume date cannot be in the past' using errcode = '22023';
  end if;

  select up.program_id, p.schedule_mode, p.structure_mode,
         case when p.schedule_mode = 'custom' then up.training_weekdays end
  into v_program_id, v_schedule_mode, v_structure_mode, v_weekdays
  from public.user_programs up
  join public.programs p on p.id = up.program_id
  where up.id = p_user_program_id
    and up.user_id = v_user_id
    and up.status = 'paused'
  for update of up;

  if v_program_id is null then
    raise exception 'Paused program participation not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.workout_sessions ws
    join public.scheduled_workouts sw on sw.id = ws.scheduled_workout_id
    where sw.user_program_id = p_user_program_id
      and ws.user_id = v_user_id
      and ws.status = 'active'
  ) then
    raise exception 'Cannot resume program during an active workout' using errcode = '22023';
  end if;

  select min(sw.sequence_number)
  into v_first_sequence
  from public.scheduled_workouts sw
  where sw.user_program_id = p_user_program_id
    and sw.status = 'scheduled';

  if v_first_sequence is null then
    raise exception 'Program has no remaining scheduled workouts' using errcode = '22023';
  end if;

  v_isodow := extract(isodow from p_resume_date)::integer;
  if v_schedule_mode = 'weekly_mwf' and v_isodow not in (1, 3, 5) then
    raise exception 'First workout must be Monday, Wednesday or Friday' using errcode = '22023';
  end if;
  if v_schedule_mode = 'weekly_tts' and v_isodow not in (2, 4, 6) then
    raise exception 'First workout must be Tuesday, Thursday or Saturday' using errcode = '22023';
  end if;

  select count(*)
  into v_template_count
  from public.program_weeks pw
  join public.program_workouts w on w.week_id = pw.id
  where pw.program_id = v_program_id;

  for v_row in
    select sw.id, sw.sequence_number, sw.status
    from public.scheduled_workouts sw
    where sw.user_program_id = p_user_program_id
      and sw.sequence_number >= v_first_sequence
    order by sw.sequence_number
  loop
    if v_row.status = 'scheduled' then
      update public.scheduled_workouts
      set scheduled_date = v_current_date
      where id = v_row.id;
    end if;

    if v_weekdays is not null then
      loop
        v_current_date := v_current_date + 1;
        exit when extract(isodow from v_current_date)::integer = any(v_weekdays);
      end loop;
    elsif v_schedule_mode = 'weekly_mwf' then
      loop
        v_current_date := v_current_date + 1;
        exit when extract(isodow from v_current_date)::integer in (1, 3, 5);
      end loop;
    elsif v_schedule_mode = 'weekly_tts' then
      loop
        v_current_date := v_current_date + 1;
        exit when extract(isodow from v_current_date)::integer in (2, 4, 6);
      end loop;
    elsif v_schedule_mode = 'cycle_2_2' then
      v_current_date := v_current_date + case when mod(v_row.sequence_number, 2) = 1 then 1 else 3 end;
    else
      v_template_index := case
        when v_structure_mode = 'cycle' and v_template_count > 0
          then mod(v_row.sequence_number - 1, v_template_count) + 1
        else v_row.sequence_number
      end;

      select numbered.rest_days_after
      into v_rest_days_after
      from (
        select row_number() over (order by pw.position, w.position)::integer as sequence_number,
               w.rest_days_after
        from public.program_weeks pw
        join public.program_workouts w on w.week_id = pw.id
        where pw.program_id = v_program_id
      ) numbered
      where numbered.sequence_number = v_template_index;

      v_current_date := v_current_date + (1 + coalesce(v_rest_days_after, 1));
    end if;
  end loop;

  update public.user_programs
  set status = 'active',
      start_date = case when v_first_sequence = 1 then p_resume_date else start_date end,
      updated_at = now()
  where id = p_user_program_id
    and user_id = v_user_id;

  return p_user_program_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reschedule_scheduled_workout(p_scheduled_workout_id uuid, p_new_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_user_program_id uuid;
  v_program_id uuid;
  v_sequence_number integer;
  v_schedule_mode text;
  v_structure_mode text;
  v_previous_date date;
  v_current_date date := p_new_date;
  v_template_count integer;
  v_template_index integer;
  v_rest_days_after integer;
  v_isodow integer;
  v_row record;
  v_weekdays integer[];
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_new_date is null then raise exception 'New workout date is required' using errcode = '22023'; end if;
  if p_new_date < current_date then raise exception 'New workout date cannot be in the past' using errcode = '22023'; end if;

  select sw.user_program_id, sw.sequence_number, up.program_id, p.schedule_mode, p.structure_mode,
         case when p.schedule_mode = 'custom' then up.training_weekdays end
  into v_user_program_id, v_sequence_number, v_program_id, v_schedule_mode, v_structure_mode, v_weekdays
  from public.scheduled_workouts sw
  join public.user_programs up on up.id = sw.user_program_id
  join public.programs p on p.id = up.program_id
  where sw.id = p_scheduled_workout_id
    and sw.status = 'scheduled'
    and up.user_id = v_user_id
    and up.status = 'active'
  for update of sw, up;

  if v_user_program_id is null then
    raise exception 'Active scheduled workout not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.workout_sessions ws
    join public.scheduled_workouts sw on sw.id = ws.scheduled_workout_id
    where sw.user_program_id = v_user_program_id
      and ws.user_id = v_user_id
      and ws.status = 'active'
  ) then
    raise exception 'Cannot reschedule during an active workout' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.scheduled_workouts sw
    where sw.user_program_id = v_user_program_id
      and sw.sequence_number > v_sequence_number
      and sw.status in ('completed', 'skipped')
  ) then
    raise exception 'Cannot reschedule before later workout history' using errcode = '22023';
  end if;

  select max(sw.scheduled_date)
  into v_previous_date
  from public.scheduled_workouts sw
  where sw.user_program_id = v_user_program_id
    and sw.sequence_number < v_sequence_number
    and sw.status <> 'cancelled';

  if v_previous_date is not null and p_new_date <= v_previous_date then
    raise exception 'New workout date must be after the previous workout' using errcode = '22023';
  end if;

  v_isodow := extract(isodow from p_new_date)::integer;
  if v_schedule_mode = 'weekly_mwf' and v_isodow not in (1, 3, 5) then
    raise exception 'Workout date must be Monday, Wednesday or Friday' using errcode = '22023';
  end if;
  if v_schedule_mode = 'weekly_tts' and v_isodow not in (2, 4, 6) then
    raise exception 'Workout date must be Tuesday, Thursday or Saturday' using errcode = '22023';
  end if;

  select count(*)
  into v_template_count
  from public.program_weeks pw
  join public.program_workouts w on w.week_id = pw.id
  where pw.program_id = v_program_id;

  for v_row in
    select sw.id, sw.sequence_number, sw.status
    from public.scheduled_workouts sw
    where sw.user_program_id = v_user_program_id
      and sw.sequence_number >= v_sequence_number
    order by sw.sequence_number
  loop
    if v_row.status = 'scheduled' then
      update public.scheduled_workouts
      set scheduled_date = v_current_date
      where id = v_row.id;
    end if;

    if v_weekdays is not null then
      loop
        v_current_date := v_current_date + 1;
        exit when extract(isodow from v_current_date)::integer = any(v_weekdays);
      end loop;
    elsif v_schedule_mode = 'weekly_mwf' then
      loop
        v_current_date := v_current_date + 1;
        exit when extract(isodow from v_current_date)::integer in (1, 3, 5);
      end loop;
    elsif v_schedule_mode = 'weekly_tts' then
      loop
        v_current_date := v_current_date + 1;
        exit when extract(isodow from v_current_date)::integer in (2, 4, 6);
      end loop;
    elsif v_schedule_mode = 'cycle_2_2' then
      v_current_date := v_current_date + case when mod(v_row.sequence_number, 2) = 1 then 1 else 3 end;
    else
      v_template_index := case
        when v_structure_mode = 'cycle' and v_template_count > 0
          then mod(v_row.sequence_number - 1, v_template_count) + 1
        else v_row.sequence_number
      end;

      select numbered.rest_days_after
      into v_rest_days_after
      from (
        select row_number() over(order by pw.position, w.position)::integer as sequence_number,
               w.rest_days_after
        from public.program_weeks pw
        join public.program_workouts w on w.week_id = pw.id
        where pw.program_id = v_program_id
      ) numbered
      where numbered.sequence_number = v_template_index;

      v_current_date := v_current_date + (1 + coalesce(v_rest_days_after, 1));
    end if;
  end loop;

  update public.user_programs
  set start_date = case when v_sequence_number = 1 then p_new_date else start_date end,
      updated_at = now()
  where id = v_user_program_id and user_id = v_user_id;

  return p_scheduled_workout_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.reschedule_scheduled_workout_scoped(p_scheduled_workout_id uuid, p_new_date date, p_scope text)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_user_program_id uuid;
  v_program_id uuid;
  v_sequence_number integer;
  v_schedule_mode text;
  v_structure_mode text;
  v_current_status text;
  v_has_later_completed boolean := false;
  v_previous_date date;
  v_next_date date;
  v_current_date date := p_new_date;
  v_template_count integer;
  v_template_index integer;
  v_rest_days_after integer;
  v_isodow integer;
  v_row record;
  v_weekdays integer[];
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_new_date is null then raise exception 'New workout date is required' using errcode = '22023'; end if;
  if p_new_date < current_date then raise exception 'New workout date cannot be in the past' using errcode = '22023'; end if;
  if p_scope not in ('single', 'tail') then raise exception 'Invalid reschedule scope' using errcode = '22023'; end if;

  select sw.user_program_id, sw.sequence_number, sw.status, up.program_id, p.schedule_mode, p.structure_mode,
         case when p.schedule_mode = 'custom' then up.training_weekdays end
  into v_user_program_id, v_sequence_number, v_current_status, v_program_id, v_schedule_mode, v_structure_mode, v_weekdays
  from public.scheduled_workouts sw
  join public.user_programs up on up.id = sw.user_program_id
  join public.programs p on p.id = up.program_id
  where sw.id = p_scheduled_workout_id
    and sw.status in ('scheduled', 'skipped')
    and up.user_id = v_user_id
    and up.status = 'active'
  for update of sw, up;

  if v_user_program_id is null then
    raise exception 'Active editable workout not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.workout_sessions ws
    join public.scheduled_workouts sw on sw.id = ws.scheduled_workout_id
    where sw.user_program_id = v_user_program_id
      and ws.user_id = v_user_id
      and ws.status = 'active'
  ) then
    raise exception 'Cannot reschedule during an active workout' using errcode = '22023';
  end if;

  select exists (
    select 1
    from public.scheduled_workouts sw
    where sw.user_program_id = v_user_program_id
      and sw.sequence_number > v_sequence_number
      and sw.status = 'completed'
  ) into v_has_later_completed;

  if v_current_status = 'scheduled' and v_has_later_completed then
    raise exception 'Cannot reschedule before later workout history' using errcode = '22023';
  end if;
  if p_scope = 'tail' and v_has_later_completed then
    raise exception 'Cannot reschedule before later workout history' using errcode = '22023';
  end if;

  select max(sw.scheduled_date)
  into v_previous_date
  from public.scheduled_workouts sw
  where sw.user_program_id = v_user_program_id
    and sw.sequence_number < v_sequence_number
    and sw.status <> 'cancelled';

  if not (v_current_status = 'skipped' and v_has_later_completed) then
    if v_previous_date is not null and p_new_date <= v_previous_date then
      raise exception 'New workout date must be after the previous workout' using errcode = '22023';
    end if;
  end if;

  if p_scope = 'single' then
    if not (v_current_status = 'skipped' and v_has_later_completed) then
      select min(sw.scheduled_date)
      into v_next_date
      from public.scheduled_workouts sw
      where sw.user_program_id = v_user_program_id
        and sw.sequence_number > v_sequence_number
        and sw.status <> 'cancelled';

      if v_next_date is not null and p_new_date >= v_next_date then
        raise exception 'New workout date must be before the next workout' using errcode = '22023';
      end if;
    end if;

    update public.scheduled_workouts
    set scheduled_date = p_new_date,
        status = 'scheduled'
    where id = p_scheduled_workout_id
      and status in ('scheduled', 'skipped');

    update public.user_programs
    set start_date = case when v_sequence_number = 1 and not v_has_later_completed then p_new_date else start_date end,
        updated_at = now()
    where id = v_user_program_id and user_id = v_user_id;

    return p_scheduled_workout_id;
  end if;

  v_isodow := extract(isodow from p_new_date)::integer;
  if v_schedule_mode = 'weekly_mwf' and v_isodow not in (1, 3, 5) then
    raise exception 'Workout date must be Monday, Wednesday or Friday' using errcode = '22023';
  end if;
  if v_schedule_mode = 'weekly_tts' and v_isodow not in (2, 4, 6) then
    raise exception 'Workout date must be Tuesday, Thursday or Saturday' using errcode = '22023';
  end if;

  select count(*)
  into v_template_count
  from public.program_weeks pw
  join public.program_workouts w on w.week_id = pw.id
  where pw.program_id = v_program_id;

  for v_row in
    select sw.id, sw.sequence_number, sw.status
    from public.scheduled_workouts sw
    where sw.user_program_id = v_user_program_id
      and sw.sequence_number >= v_sequence_number
    order by sw.sequence_number
  loop
    if v_row.status in ('scheduled', 'skipped') then
      update public.scheduled_workouts
      set scheduled_date = v_current_date,
          status = 'scheduled'
      where id = v_row.id;
    end if;

    if v_weekdays is not null then
      loop
        v_current_date := v_current_date + 1;
        exit when extract(isodow from v_current_date)::integer = any(v_weekdays);
      end loop;
    elsif v_schedule_mode = 'weekly_mwf' then
      loop
        v_current_date := v_current_date + 1;
        exit when extract(isodow from v_current_date)::integer in (1, 3, 5);
      end loop;
    elsif v_schedule_mode = 'weekly_tts' then
      loop
        v_current_date := v_current_date + 1;
        exit when extract(isodow from v_current_date)::integer in (2, 4, 6);
      end loop;
    elsif v_schedule_mode = 'cycle_2_2' then
      v_current_date := v_current_date + case when mod(v_row.sequence_number, 2) = 1 then 1 else 3 end;
    else
      v_template_index := case
        when v_structure_mode = 'cycle' and v_template_count > 0
          then mod(v_row.sequence_number - 1, v_template_count) + 1
        else v_row.sequence_number
      end;

      select numbered.rest_days_after
      into v_rest_days_after
      from (
        select row_number() over(order by pw.position, w.position)::integer as sequence_number,
               w.rest_days_after
        from public.program_weeks pw
        join public.program_workouts w on w.week_id = pw.id
        where pw.program_id = v_program_id
      ) numbered
      where numbered.sequence_number = v_template_index;

      v_current_date := v_current_date + (1 + coalesce(v_rest_days_after, 1));
    end if;
  end loop;

  update public.user_programs
  set start_date = case when v_sequence_number = 1 then p_new_date else start_date end,
      updated_at = now()
  where id = v_user_program_id and user_id = v_user_id;

  return p_scheduled_workout_id;
end;
$function$;

revoke all on function public.start_program_with_weekdays(uuid,date,integer[]) from public, anon;
grant execute on function public.start_program_with_weekdays(uuid,date,integer[]) to authenticated;
revoke all on function public.update_program_with_schedule(uuid,jsonb) from public, anon;
grant execute on function public.update_program_with_schedule(uuid,jsonb) to authenticated;
revoke all on function public.change_program_start_date(uuid,date) from public, anon;
grant execute on function public.change_program_start_date(uuid,date) to authenticated;
revoke all on function public.resume_program(uuid,date) from public, anon;
grant execute on function public.resume_program(uuid,date) to authenticated;
revoke all on function public.reschedule_scheduled_workout(uuid,date) from public, anon;
grant execute on function public.reschedule_scheduled_workout(uuid,date) to authenticated;
revoke all on function public.reschedule_scheduled_workout_scoped(uuid,date,text) from public, anon;
grant execute on function public.reschedule_scheduled_workout_scoped(uuid,date,text) to authenticated;
