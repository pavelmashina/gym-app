-- Opt-in snapshots. Existing rows remain NULL (legacy); never backfill semantics.
begin;
alter table public.performed_sets add column if not exists result_v2 jsonb;
alter table public.performed_sets add column if not exists result_equipment_instance_id uuid
  generated always as ((result_v2->>'equipment_instance_id')::uuid) stored
  references public.equipment_instances(id) on delete restrict;
create index if not exists performed_sets_result_equipment_idx on public.performed_sets(result_equipment_instance_id)
  where result_equipment_instance_id is not null;
alter table public.performed_sets drop constraint if exists performed_sets_check;
alter table public.performed_sets drop constraint if exists performed_sets_completion_metric;
alter table public.performed_sets add constraint performed_sets_completion_metric
  check (not completed or reps is not null or result_v2 is not null);

create or replace function public.validate_result_snapshot_v2() returns trigger
language plpgsql security invoker set search_path='' as $$
declare r jsonb := new.result_v2; kind text; loads text[]; allowed text[]; required text[];
  field text; n numeric; linked uuid; actual_owner uuid; instance_id uuid;
begin
  if r is null then
    if tg_op='UPDATE' and old.result_v2 is not null then
      raise exception 'Cannot erase v2 semantics' using errcode='23514';
    end if;
    return new;
  end if;
  if jsonb_typeof(r) <> 'object' or r->>'metric_version' is distinct from 'v2'
    or r->>'weight_unit' is distinct from 'kg'
    or r->>'set_type' is distinct from new.set_type
    or r->'completed' is distinct from to_jsonb(new.completed)
    or nullif(btrim(r->>'configuration_key'),'') is null
    or coalesce(r->>'laterality','') not in ('bilateral','unilateral','alternating','independent')
    or new.weight is not null or new.reps is not null then
    raise exception 'Invalid v2 snapshot envelope' using errcode='23514';
  end if;
  select e.exercise_id,s.user_id into linked,actual_owner
    from public.workout_session_exercises e join public.workout_sessions s on s.id=e.workout_session_id
    where e.id=new.workout_session_exercise_id;
  if linked is null or r->>'exercise_id' is distinct from linked::text then
    raise exception 'Snapshot exercise mismatch' using errcode='23514';
  end if;
  if tg_op='INSERT' or old.result_v2 is null then
    if not exists (select 1 from public.exercises e where e.id=linked
      and e.measurement_type=r->>'measurement_type' and e.load_mode=r->>'load_mode'
      and e.laterality=r->>'laterality') then
      raise exception 'Initial snapshot must match exercise contract' using errcode='23514';
    end if;
  end if;
  if tg_op='UPDATE' then
    if old.result_v2 is null and (old.completed or old.weight is not null) then
      raise exception 'Legacy result must not be reinterpreted' using errcode='23514';
    end if;
    if old.result_v2 is not null then
      foreach field in array array['exercise_id','measurement_type','load_mode','weight_unit','configuration_key','laterality','side','equipment_instance_id'] loop
        if old.result_v2->field is distinct from r->field then
          raise exception 'Snapshot context is immutable: %',field using errcode='23514';
        end if;
      end loop;
    end if;
  end if;
  if r->>'laterality' in ('unilateral','independent') then
    if coalesce(r->>'side','') not in ('left','right') then raise exception 'Choose a side' using errcode='23514'; end if;
  elsif r->>'side' is not null then raise exception 'Unexpected side' using errcode='23514'; end if;
  if r->>'equipment_instance_id' is not null then
    instance_id := (r->>'equipment_instance_id')::uuid;
    if not exists (select 1 from public.equipment_instances i join public.exercise_machine_profiles p
      on p.machine_profile_id=i.machine_profile_id where i.id=instance_id and i.owner_user_id=actual_owner and p.exercise_id=linked) then
      raise exception 'Equipment instance inaccessible or incompatible' using errcode='23514';
    end if;
  end if;
  kind:=r->>'measurement_type';
  case kind
    when 'weight_reps' then allowed:=array['weight','reps'];required:=allowed;
      loads:=array['barbell_total','dumbbell_each','kettlebell_each','external_total','stack','plates','machine_indicated'];
    when 'bodyweight_reps' then allowed:=array['reps','weight'];required:=array['reps'];loads:=array['bodyweight'];
    when 'assisted_reps' then allowed:=array['reps','assistance_weight'];required:=allowed;loads:=array['assistance'];
    when 'duration' then allowed:=array['duration_seconds'];required:=allowed;loads:=array['bodyweight','none'];
    when 'carry' then allowed:=array['weight','duration_seconds','distance_meters'];required:=array['weight'];loads:=array['dumbbell_each','kettlebell_each','external_total'];
    when 'cardio' then allowed:=array['duration_seconds','distance_meters'];required:=array['duration_seconds'];loads:=array['none'];
    else raise exception 'Unknown measurement format' using errcode='23514';
  end case;
  if not coalesce((r->>'load_mode')=any(loads),false) then raise exception 'Invalid load mode' using errcode='23514'; end if;
  foreach field in array array['weight','reps','duration_seconds','distance_meters','assistance_weight'] loop
    if r->>field is not null then
      if not field=any(allowed) or jsonb_typeof(r->field)<>'number' then raise exception 'Unexpected metric: %',field using errcode='23514'; end if;
      n:=(r->>field)::numeric;
      if n<0 or (field in ('weight','assistance_weight') and n>10000)
        or (field='reps' and (n<1 or n>999 or trunc(n)<>n))
        or (field in ('duration_seconds','distance_meters') and n<=0) then
        raise exception 'Invalid metric: %',field using errcode='23514';
      end if;
    elsif new.completed and field=any(required) then raise exception 'Missing metric: %',field using errcode='23514'; end if;
  end loop;
  if new.completed and kind='carry' and r->>'duration_seconds' is null and r->>'distance_meters' is null then
    raise exception 'Carry requires distance or time' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.validate_result_snapshot_v2() from public,anon,authenticated;
drop trigger if exists validate_result_snapshot_v2 on public.performed_sets;
create trigger validate_result_snapshot_v2 before insert or update on public.performed_sets
  for each row execute function public.validate_result_snapshot_v2();
-- Existing performed_sets owner RLS remains authoritative; no grants broadened.
create or replace function public.protect_result_exercise_v2() returns trigger
language plpgsql security invoker set search_path='' as $$ begin
  if new.exercise_id is distinct from old.exercise_id and exists
    (select 1 from public.performed_sets s where s.workout_session_exercise_id=old.id and s.result_v2 is not null) then
    raise exception 'Cannot replace an exercise with saved v2 results' using errcode='23514';
  end if;
  return new;
end $$;
revoke all on function public.protect_result_exercise_v2() from public,anon,authenticated;
drop trigger if exists protect_result_exercise_v2 on public.workout_session_exercises;
create trigger protect_result_exercise_v2 before update on public.workout_session_exercises
  for each row execute function public.protect_result_exercise_v2();
commit;
