// Issue #60: the sets of an exercise in an active workout can be dragged into a new order,
// and warm-up sets always stay above working sets. Runs the live schema (fixture), the
// performed_sets triggers added after it, and the migration in a disposable PGlite database.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const between = (text, start, end) => {
  const from = text.indexOf(start);
  assert.ok(from >= 0, `missing ${start}`);
  return text.slice(from, text.indexOf(end, from) + end.length);
};
const schema = JSON.parse(read('./fixtures/catalog-live-schema-20261015.json'));
const migration = read('../supabase/migrations/20261109161041_reorder_performed_sets.sql');
// The fixture predates these performed_sets triggers; production runs them on every set update.
const resultsV2 = read('../supabase/migrations/20261015100010_exercise_result_snapshots_v2.sql');
const inactivity = read('../supabase/migrations/20261105115500_workout_manual_completion_inactivity.sql');
const validateResult = between(resultsV2, 'create or replace function public.validate_result_snapshot_v2()', 'end $$;');
const touchSession = between(inactivity, 'CREATE OR REPLACE FUNCTION public.touch_workout_session_on_set_change()', '$function$\n;');

const db = new PGlite();
const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
const dumbbellPress = '00000000-0000-4000-8000-0000000000e1';
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => (await q(sql, args))[0]?.value;
const login = async (id) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated'); };
const asAdmin = async (sql, args = []) => { await db.exec('reset role'); const rows = await q(sql, args); await db.exec('set role authenticated'); return rows; };
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';

const reorder = (exerciseId, ids) => q('select reorder_performed_sets($1, $2::uuid[])', [exerciseId, ids]);
const rejects = async (promise, pattern, label) => {
  await assert.rejects(promise, (error) => { assert.match(error.message, pattern, label); return true; }, label);
};
// Sets of one session exercise in stored order, as the workout screen loads them.
const sets = (exerciseId) => q(`select id, set_number::int number, set_type type, weight::float weight, reps::int reps, completed, result_v2
  from performed_sets where workout_session_exercise_id = $1 order by set_number`, [exerciseId]);
const ids = (rows) => rows.map((row) => row.id);
const addSet = async (exerciseId, type) => {
  const next = (await scalar('select coalesce(max(set_number), 0) + 1 value from performed_sets where workout_session_exercise_id = $1', [exerciseId]));
  return scalar('insert into performed_sets (workout_session_exercise_id, set_number, set_type) values ($1, $2, $3) returning id value', [exerciseId, next, type]);
};

const program = (exercises) => ({
  name: 'Программа', week_count: 1, structure_mode: 'cycle', cycle_repeat_count: 1, schedule_mode: 'custom',
  weeks: [{ workouts: [{ name: 'Зал', rest_days_after: 1, exercises }] }],
});
const exercise = (name, exerciseId = null) => ({ exercise_id: exerciseId, exercise_name_snapshot: name, prescription_snapshot: '3×10', sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }] });
const startSession = async (exercises) => {
  const programId = await scalar('select create_program_with_schedule($1::jsonb) value', [JSON.stringify(program(exercises))]);
  const participationId = await scalar('select start_program($1,current_date) value', [programId]);
  const scheduledId = await scalar('select id value from scheduled_workouts where user_program_id = $1 order by sequence_number limit 1', [participationId]);
  const sessionId = await scalar('select start_workout($1) value', [scheduledId]);
  const exerciseIds = (await q('select id from workout_session_exercises where workout_session_id = $1 order by position', [sessionId])).map((row) => row.id);
  return { sessionId, exerciseIds };
};

try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema private;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon,service_role;
    insert into auth.users values('${alice}'),('${bob}');`);
  for (const table of schema.tables) await db.exec(table.ddl);
  for (const constraint of [...schema.constraints].sort((a, b) => Number(a.foreign) - Number(b.foreign))) await db.exec(constraint.sql);
  for (const sql of schema.indexes) await db.exec(sql);
  for (const fn of schema.functions) await db.exec(fn.sql);
  for (const sql of schema.triggers) await db.exec(sql);
  for (const p of schema.policies) await db.exec(`create policy ${quote(p.name)} on public.${quote(p.table)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(quote).join(',')} ${p.qual ? 'using (' + p.qual + ')' : ''} ${p.check ? 'with check (' + p.check + ')' : ''}`);
  for (const table of schema.tables) if (table.rls) await db.exec(`alter table public.${quote(table.name)} enable row level security`);
  for (const grant of schema.grants) await db.exec(`grant ${grant.privilege} on public.${quote(grant.table)} to ${quote(grant.role)}`);
  // Production columns and triggers of performed_sets that came after the fixture (checked on 2026-11-09).
  await db.exec(`alter table public.exercises add column measurement_type text, add column load_mode text, add column laterality text;
    alter table public.workout_sessions add column last_activity_at timestamptz;
    alter table public.performed_sets add column result_v2 jsonb;
    alter table public.performed_sets drop constraint performed_sets_check;
    alter table public.performed_sets add constraint performed_sets_completion_metric check (not completed or reps is not null or result_v2 is not null);
    ${validateResult}
    create trigger validate_result_snapshot_v2 before insert or update on public.performed_sets for each row execute function public.validate_result_snapshot_v2();
    ${touchSession}
    create trigger gym_workout_activity_sets after insert or update or delete on public.performed_sets for each row execute function public.touch_workout_session_on_set_change();
    insert into public.exercises (id, muscle_group, exercise_type, movement_type, name, measurement_type, load_mode, laterality)
      values ('${dumbbellPress}', 'Плечи', 'Базовое', 'Жим', 'Жим гантелей сидя', 'weight_reps', 'dumbbell_each', 'bilateral');`);
  await db.exec(migration);
  await login(alice);

  // 1. The reported case: «+ Разминка» after three working sets. The screen then stores the order
  // with warm-ups first, so the warm-up becomes set 1 and the working sets follow in their order.
  const { sessionId, exerciseIds: [legs, shoulders] } = await startSession([exercise('Выпады'), exercise('Жим гантелей сидя', dumbbellPress)]);
  const [w1, w2, w3] = ids(await sets(legs));
  await q('update performed_sets set weight = 40, reps = 8, completed = true where id = $1', [w1]);
  const warm1 = await addSet(legs, 'warmup');
  assert.deepEqual(ids(await sets(legs)), [w1, w2, w3, warm1], 'a new set is stored last');
  await reorder(legs, [warm1, w1, w2, w3]);
  let rows = await sets(legs);
  assert.deepEqual(ids(rows), [warm1, w1, w2, w3], 'the warm-up is stored on top');
  assert.deepEqual(rows.map((row) => row.number), [1, 2, 3, 4], 'numbers are 1..n in the new order');
  assert.deepEqual(rows.find((row) => row.id === w1), { id: w1, number: 2, type: 'working', weight: 40, reps: 8, completed: true, result_v2: null }, 'a completed set keeps its result');

  // A second warm-up goes under the first one, still above the working sets.
  const warm2 = await addSet(legs, 'warmup');
  await reorder(legs, [warm1, warm2, w1, w2, w3]);
  assert.deepEqual(ids(await sets(legs)), [warm1, warm2, w1, w2, w3]);

  // 2. Dragging: working sets among themselves, warm-ups among themselves.
  await reorder(legs, [warm2, warm1, w3, w1, w2]);
  rows = await sets(legs);
  assert.deepEqual(ids(rows), [warm2, warm1, w3, w1, w2]);
  assert.deepEqual(rows.map((row) => row.number), [1, 2, 3, 4, 5]);

  // Gaps left by deleted sets close up.
  await q('delete from performed_sets where id = $1', [warm1]);
  const w4 = await addSet(legs, 'working');
  assert.deepEqual((await sets(legs)).map((row) => row.number), [1, 3, 4, 5, 6]);
  await reorder(legs, [warm2, w4, w3, w1, w2]);
  rows = await sets(legs);
  assert.deepEqual(ids(rows), [warm2, w4, w3, w1, w2]);
  assert.deepEqual(rows.map((row) => row.number), [1, 2, 3, 4, 5]);

  // 3. Results v2 rows (the second kind of row in the card) move the same way: the result snapshot
  // trigger lets the number change and keeps the result.
  const [v1, v2, v3] = ids(await sets(shoulders));
  const result = { metric_version: 'v2', weight_unit: 'kg', set_type: 'working', completed: true, configuration_key: 'standard', laterality: 'bilateral', exercise_id: dumbbellPress, measurement_type: 'weight_reps', load_mode: 'dumbbell_each', weight: 20, reps: 10 };
  // Saved the way the app saves it: the v2 snapshot replaces weight and reps.
  await q('update performed_sets set result_v2 = $2::jsonb, weight = null, reps = null, completed = true, completed_at = now() where id = $1', [v1, JSON.stringify(result)]);
  const vWarm = await addSet(shoulders, 'warmup');
  await reorder(shoulders, [vWarm, v3, v1, v2]);
  rows = await sets(shoulders);
  assert.deepEqual(ids(rows), [vWarm, v3, v1, v2]);
  assert.deepEqual(rows.find((row) => row.id === v1).result_v2, result, 'the v2 result is unchanged');
  assert.equal(rows.find((row) => row.id === v1).completed, true);

  // 4. Refusals leave the stored order exactly as it was.
  const before = await sets(legs);
  await rejects(reorder(legs, [w4, warm2, w3, w1, w2]), /Warm-up sets must come before working sets/, 'a warm-up below a working set');
  await rejects(reorder(legs, [warm2, w4, w3, w1]), /every set of the exercise exactly once/, 'a missing set');
  await rejects(reorder(legs, [warm2, w4, w3, w1, w1]), /every set of the exercise exactly once/, 'a repeated set');
  await rejects(reorder(legs, [warm2, w4, w3, w1, v2]), /every set of the exercise exactly once/, 'a set of another exercise');
  await rejects(reorder(legs, [warm2, w4, w3, w1, null]), /every set of the exercise exactly once/, 'an empty id');
  await rejects(reorder(legs, []), /Set order is required/, 'an empty order');
  assert.deepEqual(await sets(legs), before, 'refused calls change nothing');

  // 5. Only the owner, only while the workout is active.
  await login(bob);
  await rejects(reorder(legs, ids(before)), /not found or access denied/, 'another user');
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub','',false)");
  await db.exec('set role anon');
  await rejects(reorder(legs, ids(before)), /permission denied/, 'anonymous caller');
  await login(alice);
  await q('select complete_workout($1)', [sessionId]);
  await rejects(reorder(legs, [warm2, w1, w3, w4, w2]), /not found or access denied/, 'a completed workout');
  assert.deepEqual(await sets(legs), before, 'a completed workout keeps its order');

  // 6. The function runs with the caller's rights and only signed-in users may call it.
  const [meta] = await asAdmin(`select p.prosecdef definer, has_function_privilege('anon', p.oid, 'execute') anon,
    has_function_privilege('authenticated', p.oid, 'execute') authenticated
    from pg_proc p where p.proname = 'reorder_performed_sets'`);
  assert.deepEqual(meta, { definer: false, anon: false, authenticated: true });

  console.log('set order db ok');
} finally {
  await db.close();
}
