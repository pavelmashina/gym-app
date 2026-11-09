// Issue #61: an exercise can be added to an active workout, from a program or standalone. During a
// program workout the user chooses: only this workout, or the program too (the template workout and
// every such workout that has not started yet). Runs the live schema (fixture), the published catalog
// and the migrations in a disposable PGlite.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import { buildCatalogRelease } from '../scripts/exercise-catalog-release.mjs';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const schema = JSON.parse(read('./fixtures/catalog-live-schema-20261015.json'));
const legacy = JSON.parse(read('../docs/exercise-catalog-v2/legacy-shared-catalog.json'));
const db = new PGlite();
const alice = '00000000-0000-4000-8000-000000000001';
const bob = '00000000-0000-4000-8000-000000000002';
const aliceOwn = '00000000-0000-4000-8000-0000000000a1';
const bobOwn = '00000000-0000-4000-8000-0000000000b1';
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => (await q(sql, args))[0]?.value;
const login = async (id) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated'); };
const asAdmin = async (sql, args = []) => { await db.exec('reset role'); const rows = await q(sql, args); await db.exec('set role authenticated'); return rows; };
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';
// Without a scope: the call of app builds that know only two arguments.
const add = (sessionId, exerciseId, scope) => scope === undefined
  ? scalar('select add_session_exercise($1, $2) value', [sessionId, exerciseId])
  : scalar('select add_session_exercise($1, $2, $3) value', [sessionId, exerciseId, scope]);
const rejects = async (promise, pattern, label) => {
  await assert.rejects(promise, (error) => { assert.match(error.message, pattern, label); return true; }, label);
};
// The session's exercises in screen order with their sets, as the workout screen loads them.
const sessionExercises = (sessionId) => q(`select wse.id, wse.exercise_id, wse.exercise_name_snapshot name, wse.position::int position,
  wse.source_scheduled_workout_exercise_id source,
  (select json_agg(json_build_object('n', ps.set_number, 'type', ps.set_type, 'reps', ps.reps, 'done', ps.completed, 'source', ps.source_scheduled_set_id)
    order by ps.set_number) from performed_sets ps where ps.workout_session_exercise_id = wse.id) sets
  from workout_session_exercises wse where wse.workout_session_id = $1 order by wse.position`, [sessionId]);
// The plan of one scheduled workout: exercises in order with their planned reps and template links.
const planOf = (scheduledWorkoutId) => q(`select swe.id, swe.exercise_name_snapshot name, swe.source_program_workout_exercise_id template,
  (select json_agg(ss.planned_reps order by ss.set_number) from scheduled_sets ss where ss.scheduled_workout_exercise_id = swe.id) reps
  from scheduled_workout_exercises swe where swe.scheduled_workout_id = $1 order by swe.position`, [scheduledWorkoutId]);
const templateOf = (templateWorkoutId) => q(`select pwe.id, pwe.exercise_id, pwe.exercise_name_snapshot name,
  (select json_agg(pes.reps order by pes.set_number) from program_exercise_sets pes where pes.workout_exercise_id = pwe.id) reps
  from program_workout_exercises pwe where pwe.workout_id = $1 order by pwe.position`, [templateWorkoutId]);
// Everything a program keeps, to prove that adding to this workout only changes none of it.
const programData = async () => ({
  templates: await q('select * from program_workout_exercises order by id'),
  templateSets: await q('select * from program_exercise_sets order by id'),
  scheduled: await q('select * from scheduled_workout_exercises order by id'),
  sets: await q('select * from scheduled_sets order by id'),
});
// A finished workout's plan and result, IDs included.
const recordOf = async (scheduledWorkoutId) => ({
  plan: await planOf(scheduledWorkoutId),
  session: await q('select wse.* from workout_session_exercises wse join workout_sessions ws on ws.id = wse.workout_session_id where ws.scheduled_workout_id = $1 order by wse.position', [scheduledWorkoutId]),
  sets: await q('select ps.* from performed_sets ps join workout_session_exercises wse on wse.id = ps.workout_session_exercise_id join workout_sessions ws on ws.id = wse.workout_session_id where ws.scheduled_workout_id = $1 order by wse.position, ps.set_number', [scheduledWorkoutId]),
});
const emptySet = (source = null) => [{ n: 1, type: 'working', reps: null, done: false, source }];

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
  for (const e of legacy) await db.query('insert into exercises(id,name,muscle_group,exercise_type,movement_type,technique,equipment) values($1,$2,$3,$4,$5,$6,$7)', [e.id, e.name, e.muscle_group, e.exercise_type, e.movement_type, e.technique, e.equipment]);
  await db.exec(buildCatalogRelease({ publish: true }));
  await db.exec(read('../supabase/migrations/20261015115110_standalone_workouts.sql'));
  await db.exec(read('../supabase/migrations/20261109145203_sync_not_started_workouts_with_program_edits.sql'));
  await db.exec(read('../supabase/migrations/20261109190000_add_session_exercise.sql'));
  await db.exec(read('../supabase/migrations/20261109200000_add_exercise_to_program_from_workout.sql'));
  // Custom exercises are not published: each owner sees only their own.
  await db.query("insert into exercises(id,name,muscle_group,exercise_type,movement_type,owner_id,status) values($1,'Свой жим Алисы','Грудь','Базовое','Жим',$2,'draft'),($3,'Свой жим Боба','Грудь','Базовое','Жим',$4,'draft')", [aliceOwn, alice, bobOwn, bob]);
  assert.equal(await scalar("select count(*)::int value from pg_proc where proname = 'add_session_exercise'"), 1, 'one function: the scope has a default');

  await login(alice);
  const [chestExercise, backExercise, extra, another] = await q("select id, name from exercise_catalog_v2 where status = 'published' order by name limit 4");
  assert.ok(another, 'the published catalog has exercises');
  const item = (exercise) => ({ exercise_id: exercise.id, exercise_name_snapshot: exercise.name, prescription_snapshot: '2×8', sets: [{ reps: 8 }, { reps: 8 }] });
  // A cycle of «Грудь» and «Спина», four times: plan positions 1, 3, 5, 7 come from the same template workout.
  const payload = { name: 'Программа', week_count: 1, structure_mode: 'cycle', cycle_repeat_count: 4, schedule_mode: 'custom',
    weeks: [{ workouts: [{ name: 'Грудь', rest_days_after: 1, exercises: [item(chestExercise)] }, { name: 'Спина', rest_days_after: 1, exercises: [item(backExercise)] }] }] };
  const program = await scalar('select create_program_with_schedule($1::jsonb) value', [JSON.stringify(payload)]);
  const participation = await scalar('select start_program($1,current_date) value', [program]);
  const days = await q('select id, sequence_number::int seq, source_program_workout_id template from scheduled_workouts where user_program_id = $1 order by sequence_number', [participation]);
  assert.equal(days.length, 8);
  const [chest, back] = [days[0].template, days[1].template];
  assert.deepEqual(days.map((day) => day.template), [chest, back, chest, back, chest, back, chest, back]);

  // A «Грудь» workout already done (#3, moved to today to start it), then today's #1 in progress.
  await asAdmin('update scheduled_workouts set scheduled_date = current_date where id = $1', [days[2].id]);
  await q('select complete_workout($1)', [await scalar('select start_workout($1) value', [days[2].id])]);
  const done = await recordOf(days[2].id);
  // #7 still says «scheduled» but already has a session: started, so its plan is kept, as #59 does.
  await asAdmin("insert into workout_sessions(user_id, scheduled_workout_id, status, ended_at) values ($1, $2, 'abandoned', now())", [alice, days[6].id]);
  const startedBefore = await planOf(days[6].id);
  const session = await scalar('select start_workout($1) value', [days[0].id]);
  const [planned] = await sessionExercises(session);
  const backDays = days.filter((day) => day.template === back);
  const backPlans = await Promise.all(backDays.map((day) => planOf(day.id)));
  const backTemplate = await templateOf(back);

  // 1. «Во всю программу»: the template workout, this workout's plan and the not-started #5 get it.
  const toProgram = await add(session, extra.id, 'program');
  const chestTemplate = await templateOf(chest);
  assert.deepEqual(chestTemplate.map((row) => [row.exercise_id, row.name, row.reps]), [[chestExercise.id, chestExercise.name, [8, 8]], [extra.id, extra.name, [null]]],
    'appended to the template with one set without planned reps, as the program editor adds one');
  for (const day of [days[0], days[4]]) {
    const rows = await planOf(day.id);
    assert.deepEqual(rows.map((row) => [row.name, row.reps]), [[chestExercise.name, [8, 8]], [extra.name, [null]]], `plan of #${day.seq}`);
    assert.equal(rows[1].template, chestTemplate[1].id, `#${day.seq} is linked to the template, so later program edits keep it`);
  }
  assert.deepEqual(await recordOf(days[2].id), done, 'the finished «Грудь» keeps its plan and result');
  assert.deepEqual(await planOf(days[6].id), startedBefore, 'a workout with a session keeps its plan');
  assert.deepEqual(await Promise.all(backDays.map((day) => planOf(day.id))), backPlans, 'other template workouts stay as they were');
  assert.deepEqual(await templateOf(back), backTemplate);
  // In this workout: last, linked to its plan, with one empty working set linked to the planned set.
  let rows = await sessionExercises(session);
  const [, todayPlan] = await planOf(days[0].id);
  const plannedSet = await scalar('select id value from scheduled_sets where scheduled_workout_exercise_id = $1', [todayPlan.id]);
  assert.deepEqual(rows.map((row) => row.id), [planned.id, toProgram]);
  assert.deepEqual(rows[1], { id: toProgram, exercise_id: extra.id, name: extra.name, position: 2, source: todayPlan.id, sets: emptySet(plannedSet) });
  // Being part of the program, it can be moved in all such workouts too.
  await q("select reorder_workout_session_exercises($1, $2::uuid[], 'program')", [session, `{${toProgram},${planned.id}}`]);
  assert.deepEqual((await templateOf(chest)).map((row) => row.name), [extra.name, chestExercise.name]);
  assert.deepEqual((await planOf(days[4].id)).map((row) => row.name), [extra.name, chestExercise.name]);

  // 2. «Только в эту тренировку» (and the two-argument call): the program does not change.
  const programBefore = await programData();
  const onlyHere = await add(session, another.id, 'session');
  const own = await add(session, aliceOwn);
  assert.deepEqual(await programData(), programBefore, 'the program and its schedule stay as they were');
  rows = await sessionExercises(session);
  assert.deepEqual(rows.map((row) => [row.id, row.position]), [[toProgram, 1], [planned.id, 2], [onlyHere, 3], [own, 4]]);
  assert.deepEqual(rows.slice(2).map((row) => [row.name, row.source, row.sets]), [[another.name, null, emptySet()], ['Свой жим Алисы', null, emptySet()]],
    'not in the program, one empty working set');
  // Sets of an added exercise are recorded like any other.
  await q("update performed_sets set weight = 40, reps = 10, completed = true where workout_session_exercise_id = $1", [onlyHere]);

  // 3. Refusals change nothing.
  const snapshot = async () => ({ program: await programData(), session: await sessionExercises(session) });
  const before = await snapshot();
  await rejects(add(session, bobOwn, 'program'), /Exercise not available/, 'another user\'s own exercise');
  await rejects(add(session, '00000000-0000-4000-8000-00000000ffff'), /Exercise not available/, 'an unknown exercise');
  await rejects(add(session, extra.id, 'everywhere'), /Invalid add scope/, 'an unknown scope');
  await rejects(add(session, extra.id, null), /Invalid add scope/, 'no scope');
  await q('select pause_workout($1)', [days[0].id]);
  await rejects(add(session, extra.id, 'program'), /Active workout session not found/, 'a paused workout');
  await q('select resume_workout($1)', [days[0].id]);
  await login(bob);
  await rejects(add(session, extra.id, 'program'), /Active workout session not found/, 'another user');
  await db.exec('reset role; set role anon');
  await rejects(add(session, extra.id, 'session'), /permission denied/, 'anonymous');
  await login(alice);
  assert.deepEqual(await snapshot(), before);

  // 4. A completed workout keeps its exercises; the added ones are part of its result.
  await q('select complete_workout($1)', [session]);
  await rejects(add(session, extra.id), /Active workout session not found/, 'a completed workout');
  assert.deepEqual((await sessionExercises(session)).map((row) => row.id), [toProgram, planned.id, onlyHere, own]);

  // 5. Standalone workouts: only this workout, there is no program to add to.
  const standaloneDay = await scalar('select start_standalone_workout() value');
  const standalone = await scalar('select id value from workout_sessions where scheduled_workout_id = $1', [standaloneDay]);
  const first = await add(standalone, chestExercise.id, 'session');
  assert.deepEqual((await sessionExercises(standalone)).map((row) => [row.id, row.position, row.sets]), [[first, 1, emptySet()]]);
  const programNow = await programData();
  await rejects(add(standalone, extra.id, 'program'), /not linked to a program workout/, 'no program behind a standalone workout');
  assert.deepEqual(await programData(), programNow);
  assert.equal((await sessionExercises(standalone)).length, 1);
  await q('select abandon_workout($1)', [standalone]);
  await rejects(add(standalone, chestExercise.id), /Active workout session not found/, 'an abandoned workout');

  console.log('Adding exercises to active workouts passed: into the program (template, this plan, not-started workouts), only this workout, one empty set, refusals, standalone.');
} finally {
  await db.close();
}
