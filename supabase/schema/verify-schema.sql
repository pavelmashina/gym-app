-- Read-only verification for the canonical application schema.
-- Raises an exception when the live database is missing a required object or access rule.

do $verify$
declare
  v_required_tables text[] := array[
    'profiles','exercises','user_exercises','programs','program_weeks','program_workouts',
    'program_workout_exercises','program_exercise_sets','user_programs','scheduled_workouts',
    'scheduled_workout_exercises','scheduled_sets','workout_sessions',
    'workout_session_exercises','performed_sets','catalog_programs'
  ];
  v_table_count integer;
  v_rls_count integer;
  v_policy_count integer;
  v_anon_grants integer;
  v_bucket_count integer;
  v_storage_policy_count integer;
  v_rpc_count integer;
  v_rpc_restricted_count integer;
  v_snapshot_column_count integer;
  v_source_index_count integer;
  v_cycle_column_count integer;
  v_cycle_constraint_count integer;
  v_cycle_guard_function_count integer;
  v_cycle_guard_trigger_count integer;
  v_bad_catalog_cycle_count integer;
begin
  select count(*) into v_table_count
  from information_schema.tables
  where table_schema = 'public'
    and table_type = 'BASE TABLE'
    and table_name = any(v_required_tables);

  if v_table_count <> array_length(v_required_tables, 1) then
    raise exception 'Schema verification failed: expected 16 public application tables, found %', v_table_count;
  end if;

  select count(*) into v_rls_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(v_required_tables)
    and c.relrowsecurity;

  if v_rls_count <> array_length(v_required_tables, 1) then
    raise exception 'Schema verification failed: RLS enabled on % of 16 tables', v_rls_count;
  end if;

  select count(*) into v_policy_count
  from pg_policies
  where schemaname = 'public'
    and tablename = any(v_required_tables);

  if v_policy_count <> 57 then
    raise exception 'Schema verification failed: expected 57 application RLS policies, found %', v_policy_count;
  end if;

  select count(*) into v_anon_grants
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = any(v_required_tables)
    and grantee = 'anon';

  if v_anon_grants <> 0 then
    raise exception 'Schema verification failed: anon has % application-table grants', v_anon_grants;
  end if;

  with current_rpcs as (
    select p.oid, p.prosecdef
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and (
        (p.proname = 'create_program_with_structure' and pg_get_function_identity_arguments(p.oid) = 'p_program jsonb')
        or (p.proname = 'update_program_with_structure' and pg_get_function_identity_arguments(p.oid) = 'p_program_id uuid, p_program jsonb')
        or (p.proname = 'create_program_with_schedule' and pg_get_function_identity_arguments(p.oid) = 'p_program jsonb')
        or (p.proname = 'update_program_with_schedule' and pg_get_function_identity_arguments(p.oid) = 'p_program_id uuid, p_program jsonb')
        or (p.proname = 'start_program' and pg_get_function_identity_arguments(p.oid) = 'p_program_id uuid, p_start_date date')
        or (p.proname = 'change_program_start_date' and pg_get_function_identity_arguments(p.oid) = 'p_user_program_id uuid, p_start_date date')
        or (p.proname = 'pause_program' and pg_get_function_identity_arguments(p.oid) = 'p_user_program_id uuid')
        or (p.proname = 'resume_program' and pg_get_function_identity_arguments(p.oid) = 'p_user_program_id uuid, p_resume_date date')
        or (p.proname = 'complete_program' and pg_get_function_identity_arguments(p.oid) = 'p_user_program_id uuid')
        or (p.proname = 'start_workout' and pg_get_function_identity_arguments(p.oid) = 'p_scheduled_workout_id uuid')
        or (p.proname = 'complete_workout' and pg_get_function_identity_arguments(p.oid) = 'p_workout_session_id uuid')
        or (p.proname = 'abandon_workout' and pg_get_function_identity_arguments(p.oid) = 'p_workout_session_id uuid')
        or (p.proname = 'move_workout_session_exercise' and pg_get_function_identity_arguments(p.oid) = 'p_session_exercise_id uuid, p_direction integer')
        or (p.proname = 'adopt_catalog_program' and pg_get_function_identity_arguments(p.oid) = 'p_catalog_program_id uuid')
      )
  )
  select
    count(*) filter (where not prosecdef),
    count(*) filter (
      where not prosecdef
        and has_function_privilege('authenticated', oid, 'EXECUTE')
        and not has_function_privilege('anon', oid, 'EXECUTE')
    )
  into v_rpc_count, v_rpc_restricted_count
  from current_rpcs;

  if v_rpc_count <> 14 then
    raise exception 'Schema verification failed: expected 14 current SECURITY INVOKER application RPCs, found %', v_rpc_count;
  end if;

  if v_rpc_restricted_count <> 14 then
    raise exception 'Schema verification failed: authenticated/anon execute grants are correct on % of 14 application RPCs', v_rpc_restricted_count;
  end if;

  select count(*) into v_snapshot_column_count
  from information_schema.columns
  where table_schema = 'public'
    and (
      (table_name = 'programs' and column_name = 'source_catalog_program_id')
      or (table_name = 'program_workout_exercises' and column_name in ('exercise_name_snapshot','prescription_snapshot'))
      or (table_name = 'scheduled_workout_exercises' and column_name in ('exercise_name_snapshot','prescription_snapshot'))
      or (table_name = 'workout_session_exercises' and column_name in ('exercise_name_snapshot','prescription_snapshot'))
    );

  if v_snapshot_column_count <> 7 then
    raise exception 'Schema verification failed: expected 7 catalog-adoption snapshot/source columns, found %', v_snapshot_column_count;
  end if;

  select count(*) into v_cycle_column_count
  from information_schema.columns
  where table_schema = 'public'
    and (
      (table_name = 'programs' and column_name in ('structure_mode','cycle_repeat_count'))
      or (table_name = 'scheduled_workouts' and column_name = 'cycle_number')
      or (table_name = 'catalog_programs' and column_name = 'equipment')
    );

  if v_cycle_column_count <> 4 then
    raise exception 'Schema verification failed: expected 4 cycle/catalog columns, found %', v_cycle_column_count;
  end if;

  select count(*) into v_cycle_constraint_count
  from pg_constraint c
  join pg_class t on t.oid = c.conrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and c.conname in (
      'programs_structure_mode_check',
      'programs_cycle_repeat_count_check',
      'scheduled_workouts_cycle_number_check'
    );

  if v_cycle_constraint_count <> 3 then
    raise exception 'Schema verification failed: expected 3 cycle constraints, found %', v_cycle_constraint_count;
  end if;

  select count(*) into v_cycle_guard_function_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'private'
    and p.proname = 'guard_active_program_cycle_configuration'
    and pg_get_function_identity_arguments(p.oid) = ''
    and not p.prosecdef;

  select count(*) into v_cycle_guard_trigger_count
  from pg_trigger tg
  join pg_class t on t.oid = tg.tgrelid
  join pg_namespace n on n.oid = t.relnamespace
  where n.nspname = 'public'
    and t.relname = 'programs'
    and tg.tgname = 'programs_guard_active_cycle_configuration'
    and not tg.tgisinternal;

  if v_cycle_guard_function_count <> 1 or v_cycle_guard_trigger_count <> 1 then
    raise exception 'Schema verification failed: active cycle configuration guard is incomplete (function %, trigger %)', v_cycle_guard_function_count, v_cycle_guard_trigger_count;
  end if;

  select count(*) into v_bad_catalog_cycle_count
  from public.catalog_programs cp
  where cp.published
    and (
      cp.week_count <> 1
      or coalesce(jsonb_typeof(cp.source_payload -> 'cycle' -> 'workouts'), '') <> 'array'
      or jsonb_array_length(coalesce(cp.source_payload -> 'cycle' -> 'workouts', '[]'::jsonb)) = 0
    );

  if v_bad_catalog_cycle_count <> 0 then
    raise exception 'Schema verification failed: % published catalog programs are not normalized to one non-empty cycle', v_bad_catalog_cycle_count;
  end if;

  select count(*) into v_source_index_count
  from pg_indexes
  where schemaname = 'public'
    and tablename = 'programs'
    and indexname = 'programs_source_catalog_idx'
    and indexdef like '%(source_catalog_program_id)%';

  if v_source_index_count <> 1 then
    raise exception 'Schema verification failed: programs_source_catalog_idx is missing';
  end if;

  select count(*) into v_bucket_count
  from storage.buckets
  where id = 'program-covers'
    and name = 'program-covers'
    and public = false
    and file_size_limit = 5242880
    and allowed_mime_types = array['image/jpeg','image/png','image/webp']::text[];

  if v_bucket_count <> 1 then
    raise exception 'Schema verification failed: program-covers bucket configuration does not match source of truth';
  end if;

  select count(*) into v_storage_policy_count
  from pg_policies
  where schemaname = 'storage'
    and tablename = 'objects'
    and policyname in (
      'program_covers_select_own',
      'program_covers_insert_own',
      'program_covers_update_own',
      'program_covers_delete_own'
    );

  if v_storage_policy_count <> 4 then
    raise exception 'Schema verification failed: expected 4 program cover Storage policies, found %', v_storage_policy_count;
  end if;

  raise notice 'Schema verification passed: 16 tables, RLS/policies, 14 restricted SECURITY INVOKER RPCs, cycle model/guard, participation controls, normalized catalog, snapshots/index and Storage match the repository inventory.';
end
$verify$;
