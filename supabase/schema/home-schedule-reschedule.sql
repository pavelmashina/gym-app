-- Home calendar workout rescheduling.
-- `single` moves only the selected incomplete workout while keeping surrounding dates unchanged.
-- `tail` moves the selected workout and rebuilds all remaining incomplete dates using the program rhythm.
-- Past scheduled workouts remain editable only until a later workout is completed.
-- Explicitly skipped workouts can be restored and moved individually even when later history exists.

create or replace function public.reschedule_scheduled_workout_scoped(
  p_scheduled_workout_id uuid,
  p_new_date date,
  p_scope text
)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
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
begin
  if v_user_id is null then raise exception 'Authentication required' using errcode = '42501'; end if;
  if p_new_date is null then raise exception 'New workout date is required' using errcode = '22023'; end if;
  if p_new_date < current_date then raise exception 'New workout date cannot be in the past' using errcode = '22023'; end if;
  if p_scope not in ('single', 'tail') then raise exception 'Invalid reschedule scope' using errcode = '22023'; end if;

  select sw.user_program_id, sw.sequence_number, sw.status, up.program_id, p.schedule_mode, p.structure_mode
  into v_user_program_id, v_sequence_number, v_current_status, v_program_id, v_schedule_mode, v_structure_mode
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

  -- An overdue scheduled workout becomes immutable once the user has completed
  -- a later workout. A deliberately skipped workout may still be restored as a
  -- one-off make-up workout, but the completed tail must never be rebuilt.
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

  -- For a skipped make-up workout with later completed history, chronological
  -- sequence may intentionally be broken: it is being restored after the fact.
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

    if v_schedule_mode = 'weekly_mwf' then
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
$$;

revoke all on function public.reschedule_scheduled_workout_scoped(uuid, date, text) from public, anon;
grant execute on function public.reschedule_scheduled_workout_scoped(uuid, date, text) to authenticated;
