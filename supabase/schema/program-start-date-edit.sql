-- Allow a joined program's start date to be changed before any workout is actually started.
-- The whole scheduled calendar is recalculated from the new first-workout date.

create or replace function public.change_program_start_date(p_user_program_id uuid, p_start_date date)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_program_id uuid;
  v_schedule_mode text;
  v_current_date date := p_start_date;
  v_scheduled record;
  v_rest_days_after integer;
  v_isodow integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;
  if p_start_date is null then
    raise exception 'Start date is required' using errcode = '22023';
  end if;
  if p_start_date < current_date then
    raise exception 'Start date cannot be in the past' using errcode = '22023';
  end if;

  select up.program_id, p.schedule_mode
    into v_program_id, v_schedule_mode
  from public.user_programs up
  join public.programs p on p.id = up.program_id
  where up.id = p_user_program_id
    and up.user_id = v_user_id
    and up.status in ('active','paused');

  if v_program_id is null then
    raise exception 'Program participation not found or unavailable' using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.scheduled_workouts sw
    join public.workout_sessions ws on ws.scheduled_workout_id = sw.id
    where sw.user_program_id = p_user_program_id
  ) then
    raise exception 'Program has already started' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.scheduled_workouts sw
    where sw.user_program_id = p_user_program_id
      and sw.status <> 'scheduled'
  ) then
    raise exception 'Program schedule already contains workout history' using errcode = '22023';
  end if;

  v_isodow := extract(isodow from p_start_date)::integer;
  if v_schedule_mode = 'weekly_mwf' and v_isodow not in (1,3,5) then
    raise exception 'First workout must be Monday, Wednesday or Friday' using errcode = '22023';
  end if;
  if v_schedule_mode = 'weekly_tts' and v_isodow not in (2,4,6) then
    raise exception 'First workout must be Tuesday, Thursday or Saturday' using errcode = '22023';
  end if;

  for v_scheduled in
    select sw.id, sw.sequence_number
    from public.scheduled_workouts sw
    where sw.user_program_id = p_user_program_id
    order by sw.sequence_number
  loop
    update public.scheduled_workouts
      set scheduled_date = v_current_date
    where id = v_scheduled.id;

    if v_schedule_mode = 'weekly_mwf' then
      loop
        v_current_date := v_current_date + 1;
        exit when extract(isodow from v_current_date)::integer in (1,3,5);
      end loop;
    elsif v_schedule_mode = 'weekly_tts' then
      loop
        v_current_date := v_current_date + 1;
        exit when extract(isodow from v_current_date)::integer in (2,4,6);
      end loop;
    elsif v_schedule_mode = 'cycle_2_2' then
      v_current_date := v_current_date + case when mod(v_scheduled.sequence_number, 2) = 1 then 1 else 3 end;
    else
      select numbered.rest_days_after
        into v_rest_days_after
      from (
        select row_number() over (order by pw.position, w.position)::integer as sequence_number,
               w.rest_days_after
        from public.program_weeks pw
        join public.program_workouts w on w.week_id = pw.id
        where pw.program_id = v_program_id
      ) numbered
      where numbered.sequence_number = v_scheduled.sequence_number;

      v_current_date := v_current_date + (1 + coalesce(v_rest_days_after, 1));
    end if;
  end loop;

  update public.user_programs
  set start_date = p_start_date,
      updated_at = now()
  where id = p_user_program_id
    and user_id = v_user_id;

  return p_user_program_id;
end;
$$;

revoke all on function public.change_program_start_date(uuid, date) from public, anon;
grant execute on function public.change_program_start_date(uuid, date) to authenticated;
