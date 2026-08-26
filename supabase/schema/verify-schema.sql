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
  v_snapshot_column_count integer;
  v_adopt_authenticated boolean;
  v_adopt_anon boolean;
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

  select count(*) into v_rpc_count
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      (p.proname = 'create_program_with_schedule' and pg_get_function_identity_arguments(p.oid) = 'p_program jsonb' and not p.prosecdef)
      or (p.proname = 'update_program_with_schedule' and pg_get_function_identity_arguments(p.oid) = 'p_program_id uuid, p_program jsonb' and not p.prosecdef)
      or (p.proname = 'start_program' and pg_get_function_identity_arguments(p.oid) = 'p_program_id uuid, p_start_date date' and not p.prosecdef)
      or (p.proname = 'change_program_start_date' and pg_get_function_identity_arguments(p.oid) = 'p_user_program_id uuid, p_start_date date' and not p.prosecdef)
      or (p.proname = 'start_workout' and pg_get_function_identity_arguments(p.oid) = 'p_scheduled_workout_id uuid' and not p.prosecdef)
      or (p.proname = 'complete_workout' and pg_get_function_identity_arguments(p.oid) = 'p_workout_session_id uuid' and not p.prosecdef)
      or (p.proname = 'abandon_workout' and pg_get_function_identity_arguments(p.oid) = 'p_workout_session_id uuid' and not p.prosecdef)
      or (p.proname = 'move_workout_session_exercise' and pg_get_function_identity_arguments(p.oid) = 'p_session_exercise_id uuid, p_direction integer' and not p.prosecdef)
      or (p.proname = 'adopt_catalog_program' and pg_get_function_identity_arguments(p.oid) = 'p_catalog_program_id uuid' and not p.prosecdef)
    );

  if v_rpc_count <> 9 then
    raise exception 'Schema verification failed: expected 9 current SECURITY INVOKER application RPCs, found %', v_rpc_count;
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

  select has_function_privilege('authenticated', 'public.adopt_catalog_program(uuid)', 'EXECUTE')
    into v_adopt_authenticated;
  select has_function_privilege('anon', 'public.adopt_catalog_program(uuid)', 'EXECUTE')
    into v_adopt_anon;

  if not v_adopt_authenticated or v_adopt_anon then
    raise exception 'Schema verification failed: adopt_catalog_program execute grants are incorrect (authenticated %, anon %)', v_adopt_authenticated, v_adopt_anon;
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

  raise notice 'Schema verification passed: 16 tables, RLS, policies, 9 RPCs, catalog snapshots and Storage match the repository inventory.';
end
$verify$;
