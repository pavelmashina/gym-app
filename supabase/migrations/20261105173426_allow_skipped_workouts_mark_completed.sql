CREATE OR REPLACE FUNCTION public.mark_scheduled_workout_completed(p_scheduled_workout_id uuid, p_completed_on date DEFAULT CURRENT_DATE)
 RETURNS uuid
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_session uuid;
  v_row record;
  v_previous record;
  v_result_reps integer;
begin
  if (select auth.uid()) is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if p_completed_on is null or p_completed_on > current_date then raise exception 'Completion date cannot be in the future' using errcode='22023'; end if;
  -- The authenticated owner can retrospectively complete an already skipped
  -- workout while the program remains active. This update and the subsequent
  -- completion share one transaction, so failures leave the skip unchanged.
  update public.scheduled_workouts sw
     set status='scheduled'
    from public.user_programs up
   where sw.id=p_scheduled_workout_id
     and up.id=sw.user_program_id
     and up.user_id=(select auth.uid())
     and up.status='active'
     and sw.status='skipped';

  -- Uses all existing start-workout guards (ownership, date and single-active-session).
  v_session := public.start_workout(p_scheduled_workout_id);
  for v_row in
    select ps.id, ps.reps, ps.set_number, e.exercise_id, e.exercise_name_snapshot
    from public.performed_sets ps
    join public.workout_session_exercises e on e.id=ps.workout_session_exercise_id
    where e.workout_session_id=v_session
  loop
    select old_set.weight,old_set.reps into v_previous
    from public.performed_sets old_set
    join public.workout_session_exercises old_ex on old_ex.id=old_set.workout_session_exercise_id
    join public.workout_sessions old_ws on old_ws.id=old_ex.workout_session_id
    where old_ws.user_id=(select auth.uid()) and old_ws.status='completed' and old_ws.id<>v_session
      and old_set.set_number=v_row.set_number and old_set.set_type='working' and old_set.completed=true
      and ((v_row.exercise_id is not null and old_ex.exercise_id=v_row.exercise_id)
        or (v_row.exercise_id is null and old_ex.exercise_id is null and old_ex.exercise_name_snapshot=v_row.exercise_name_snapshot))
    order by old_ws.ended_at desc limit 1;
    v_result_reps:=coalesce(v_previous.reps,v_row.reps);
    update public.performed_sets
    set weight=v_previous.weight,reps=v_result_reps,completed=(v_result_reps is not null),
        completed_at=case when v_result_reps is not null then now() else null end
    where id=v_row.id;
    v_previous:=null;
  end loop;
  perform public.complete_workout(v_session);
  update public.workout_sessions set completed_on=p_completed_on where id=v_session and user_id=(select auth.uid());
  return v_session;
end;
$function$
;
