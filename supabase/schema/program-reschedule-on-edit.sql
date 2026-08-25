-- Recalculate future scheduled dates when the owner edits a program rhythm.
-- Past dates and completed/skipped workouts remain immutable history.

create or replace function public.update_program_with_schedule(p_program_id uuid, p_program jsonb)
returns uuid
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_program_id uuid;
  v_schedule_mode text := coalesce(nullif(btrim(p_program ->> 'schedule_mode'), ''), 'custom');
  v_user_program record;
  v_scheduled record;
  v_last_fixed_sequence integer;
  v_last_fixed_date date;
  v_first_future_sequence integer;
  v_first_future_date date;
  v_current_date date;
  v_new_start_date date;
  v_rest_days_after integer;
begin
  if v_user_id is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if v_schedule_mode not in ('custom', 'weekly_mwf', 'weekly_tts', 'cycle_2_2') then
    raise exception 'Invalid schedule mode' using errcode = '22023';
  end if;

  v_program_id := public.update_program_with_structure(p_program_id, p_program);

  update public.programs
  set schedule_mode = v_schedule_mode,
      updated_at = now()
  where id = v_program_id
    and owner_id = v_user_id;

  if not found then
    raise exception 'Program not found or access denied' using errcode = '42501';
  end if;

  for v_user_program in
    select up.id, up.start_date
    from public.user_programs up
    where up.user_id = v_user_id
      and up.program_id = v_program_id
      and up.status in ('active', 'paused')
  loop
    v_last_fixed_sequence := null;
    v_last_fixed_date := null;
    v_first_future_sequence := null;
    v_first_future_date := null;
    v_new_start_date := null;

    select sw.sequence_number, sw.scheduled_date
      into v_last_fixed_sequence, v_last_fixed_date
    from public.scheduled_workouts sw
    where sw.user_program_id = v_user_program.id
      and (
        sw.scheduled_date < current_date
        or sw.status in ('completed', 'skipped')
      )
    order by sw.sequence_number desc
    limit 1;

    select sw.sequence_number, sw.scheduled_date
      into v_first_future_sequence, v_first_future_date
    from public.scheduled_workouts sw
    where sw.user_program_id = v_user_program.id
      and sw.status = 'scheduled'
      and sw.scheduled_date >= current_date
      and (v_last_fixed_sequence is null or sw.sequence_number > v_last_fixed_sequence)
    order by sw.sequence_number
    limit 1;

    if v_first_future_sequence is null then
      continue;
    end if;

    if v_last_fixed_sequence is null then
      if v_first_future_sequence = 1 then
        v_current_date := greatest(v_user_program.start_date, current_date);
      else
        v_current_date := greatest(v_first_future_date, current_date);
      end if;
    else
      v_current_date := v_last_fixed_date;

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
        v_current_date := v_current_date
          + case when mod(v_last_fixed_sequence, 2) = 1 then 1 else 3 end;
      else
        select numbered.rest_days_after
          into v_rest_days_after
        from (
          select
            row_number() over (order by pw.position, w.position)::integer as sequence_number,
            w.rest_days_after
          from public.program_weeks pw
          join public.program_workouts w on w.week_id = pw.id
          where pw.program_id = v_program_id
        ) numbered
        where numbered.sequence_number = v_last_fixed_sequence;

        v_current_date := v_current_date + (1 + coalesce(v_rest_days_after, 1));
      end if;

      if v_current_date < current_date then
        v_current_date := current_date;
      end if;
    end if;

    if v_schedule_mode = 'weekly_mwf' then
      while extract(isodow from v_current_date)::integer not in (1, 3, 5) loop
        v_current_date := v_current_date + 1;
      end loop;
    elsif v_schedule_mode = 'weekly_tts' then
      while extract(isodow from v_current_date)::integer not in (2, 4, 6) loop
        v_current_date := v_current_date + 1;
      end loop;
    end if;

    v_new_start_date := v_current_date;

    for v_scheduled in
      select sw.id, sw.sequence_number
      from public.scheduled_workouts sw
      where sw.user_program_id = v_user_program.id
        and sw.status = 'scheduled'
        and sw.sequence_number >= v_first_future_sequence
      order by sw.sequence_number
    loop
      update public.scheduled_workouts
      set scheduled_date = v_current_date
      where id = v_scheduled.id;

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
        v_current_date := v_current_date
          + case when mod(v_scheduled.sequence_number, 2) = 1 then 1 else 3 end;
      else
        select numbered.rest_days_after
          into v_rest_days_after
        from (
          select
            row_number() over (order by pw.position, w.position)::integer as sequence_number,
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
    set start_date = case
          when v_first_future_sequence = 1 then v_new_start_date
          else start_date
        end,
        updated_at = now()
    where id = v_user_program.id;
  end loop;

  return v_program_id;
end;
$$;

revoke all on function public.update_program_with_schedule(uuid, jsonb) from public, anon;
grant execute on function public.update_program_with_schedule(uuid, jsonb) to authenticated;
