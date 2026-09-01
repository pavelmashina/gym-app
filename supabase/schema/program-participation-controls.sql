-- Pause/resume/manual completion lifecycle for joined programs.
-- Keeps completed/skipped history immutable and only recalculates remaining scheduled dates on resume.

create or replace function public.pause_program(p_user_program_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  perform 1
  from public.user_programs up
  where up.id = p_user_program_id
    and up.user_id = v_user_id
    and up.status = 'active'
  for update;

  if not found then
    raise exception 'Active program participation not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.workout_sessions ws
    join public.scheduled_workouts sw on sw.id = ws.scheduled_workout_id
    where sw.user_program_id = p_user_program_id
      and ws.user_id = v_user_id
      and ws.status = 'active'
  ) then
    raise exception 'Cannot pause program during an active workout' using errcode = '22023';
  end if;

  update public.user_programs
  set status = 'paused', paused_at = now(), updated_at = now()
  where id = p_user_program_id and user_id = v_user_id;

  return p_user_program_id;
end;
$$;

create or replace function public.resume_program(p_user_program_id uuid, p_resume_date date)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
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
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_resume_date is null then raise exception 'Resume date is required' using errcode = '22023'; end if;
  if p_resume_date < current_date then raise exception 'Resume date cannot be in the past' using errcode = '22023'; end if;

  select up.program_id, p.schedule_mode, p.structure_mode
  into v_program_id, v_schedule_mode, v_structure_mode
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
  if v_schedule_mode = 'weekly_mwf' and v_isodow not in (1,3,5) then
    raise exception 'First workout must be Monday, Wednesday or Friday' using errcode = '22023';
  end if;
  if v_schedule_mode = 'weekly_tts' and v_isodow not in (2,4,6) then
    raise exception 'First workout must be Tuesday, Thursday or Saturday' using errcode = '22023';
  end if;

  select count(*) into v_template_count
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
      update public.scheduled_workouts set scheduled_date = v_current_date where id = v_row.id;
    end if;

    if v_schedule_mode = 'weekly_mwf' then
      loop v_current_date := v_current_date + 1; exit when extract(isodow from v_current_date)::integer in (1,3,5); end loop;
    elsif v_schedule_mode = 'weekly_tts' then
      loop v_current_date := v_current_date + 1; exit when extract(isodow from v_current_date)::integer in (2,4,6); end loop;
    elsif v_schedule_mode = 'cycle_2_2' then
      v_current_date := v_current_date + case when mod(v_row.sequence_number,2)=1 then 1 else 3 end;
    else
      v_template_index := case
        when v_structure_mode = 'cycle' and v_template_count > 0 then mod(v_row.sequence_number - 1, v_template_count) + 1
        else v_row.sequence_number
      end;
      select numbered.rest_days_after into v_rest_days_after
      from (
        select row_number() over(order by pw.position,w.position)::integer sequence_number, w.rest_days_after
        from public.program_weeks pw
        join public.program_workouts w on w.week_id = pw.id
        where pw.program_id = v_program_id
      ) numbered
      where numbered.sequence_number = v_template_index;
      v_current_date := v_current_date + (1 + coalesce(v_rest_days_after,1));
    end if;
  end loop;

  update public.user_programs
  set status = 'active',
      start_date = case when v_first_sequence = 1 then p_resume_date else start_date end,
      updated_at = now()
  where id = p_user_program_id and user_id = v_user_id;

  return p_user_program_id;
end;
$$;

create or replace function public.complete_program(p_user_program_id uuid)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;

  perform 1
  from public.user_programs up
  where up.id = p_user_program_id
    and up.user_id = v_user_id
    and up.status in ('active','paused')
  for update;

  if not found then
    raise exception 'Active or paused program participation not found' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.workout_sessions ws
    join public.scheduled_workouts sw on sw.id = ws.scheduled_workout_id
    where sw.user_program_id = p_user_program_id
      and ws.user_id = v_user_id
      and ws.status = 'active'
  ) then
    raise exception 'Cannot complete program during an active workout' using errcode = '22023';
  end if;

  update public.scheduled_workouts
  set status = 'cancelled'
  where user_program_id = p_user_program_id and status = 'scheduled';

  update public.user_programs
  set status = 'completed', completed_at = now(), updated_at = now()
  where id = p_user_program_id and user_id = v_user_id;

  return p_user_program_id;
end;
$$;

revoke all on function public.pause_program(uuid) from public, anon;
revoke all on function public.resume_program(uuid, date) from public, anon;
revoke all on function public.complete_program(uuid) from public, anon;
grant execute on function public.pause_program(uuid) to authenticated;
grant execute on function public.resume_program(uuid, date) to authenticated;
grant execute on function public.complete_program(uuid) to authenticated;
