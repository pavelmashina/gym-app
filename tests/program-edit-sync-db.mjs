// Issue #59: saving a program must reach the workouts that have not started yet,
// while started, completed and skipped workouts keep their snapshots.
// Runs the live schema (fixture) plus the migration in a disposable PGlite database.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const schema = JSON.parse(read('./fixtures/catalog-live-schema-20261015.json'));
const migration = read('../supabase/migrations/20261109145203_sync_not_started_workouts_with_program_edits.sql');
const db = new PGlite();
const alice = '00000000-0000-4000-8000-000000000001';
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => (await q(sql, args))[0]?.value;
const login = async (id) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated'); };
const asAdmin = async (sql, args = []) => { await db.exec('reset role'); const rows = await q(sql, args); await db.exec('set role authenticated'); return rows; };
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';

const exercise = (name, reps = [10, 10, 10]) => ({ exercise_id: null, exercise_name_snapshot: name, prescription_snapshot: `${reps.length}×${reps[0]}`, sets: reps.map((value) => ({ reps: value })) });
const names = (prefix, count) => Array.from({ length: count }, (_, index) => `${prefix} ${index + 1}`);
const program = (workouts, cycleRepeatCount = 2) => ({
  name: 'Программа',
  week_count: 1,
  structure_mode: 'cycle',
  cycle_repeat_count: cycleRepeatCount,
  schedule_mode: 'custom',
  weeks: [{ workouts: workouts.map(([name, exercises]) => ({ name, rest_days_after: 1, exercises })) }],
});

const createAndStart = async (payload) => {
  const programId = await scalar('select create_program_with_schedule($1::jsonb) value', [JSON.stringify(payload)]);
  const participationId = await scalar('select start_program($1,current_date) value', [programId]);
  return { programId, participationId };
};
const save = (programId, payload) => q('select update_program_with_schedule($1,$2::jsonb)', [programId, JSON.stringify(payload)]);

// What Home ("N упражнений") and the planned workout screen read for each plan position.
const plan = async (participationId) => {
  const rows = await q(`
    select sw.id, sw.sequence_number::int seq, sw.workout_name name, sw.status, sw.scheduled_date::text date,
      sw.week_number::int week, sw.cycle_number::int cycle, sw.source_program_workout_id source,
      (select count(*)::int from scheduled_workout_exercises swe where swe.scheduled_workout_id = sw.id) exercise_count,
      coalesce((select json_agg(json_build_object('name', swe.exercise_name_snapshot, 'source', swe.source_program_workout_exercise_id,
        'reps', (select json_agg(ss.planned_reps order by ss.set_number) from scheduled_sets ss where ss.scheduled_workout_exercise_id = swe.id))
        order by swe.position) from scheduled_workout_exercises swe where swe.scheduled_workout_id = sw.id), '[]') exercises
    from scheduled_workouts sw where sw.user_program_id = $1 order by sw.sequence_number`, [participationId]);
  return rows;
};
const template = async (programId) => q(`
  select w.id, w.name,
    (select json_agg(json_build_object('name', pwe.exercise_name_snapshot, 'source', pwe.id,
      'reps', (select json_agg(pes.reps order by pes.set_number) from program_exercise_sets pes where pes.workout_exercise_id = pwe.id))
      order by pwe.position) from program_workout_exercises pwe where pwe.workout_id = w.id) exercises
  from program_weeks pw join program_workouts w on w.week_id = pw.id
  where pw.program_id = $1 order by pw.position, w.position`, [programId]);
// Stored content of one scheduled workout, IDs included, to prove it was not rewritten.
// Template links are left out: rewriting the template has always nulled them (on delete set null),
// and the rhythm pass may move the date of a started workout, as it did before this change.
const snapshotOf = async (scheduledWorkoutId) => ({
  workout: await q('select id, sequence_number, week_number, cycle_number, workout_name, status from scheduled_workouts where id = $1', [scheduledWorkoutId]),
  exercises: await q('select id, exercise_id, exercise_name_snapshot, prescription_snapshot, position from scheduled_workout_exercises where scheduled_workout_id = $1 order by position', [scheduledWorkoutId]),
  sets: await q('select ss.* from scheduled_sets ss join scheduled_workout_exercises swe on swe.id = ss.scheduled_workout_exercise_id where swe.scheduled_workout_id = $1 order by swe.position, ss.set_number', [scheduledWorkoutId]),
  sessionExercises: await q('select wse.* from workout_session_exercises wse join workout_sessions ws on ws.id = wse.workout_session_id where ws.scheduled_workout_id = $1 order by wse.position', [scheduledWorkoutId]),
  performedSets: await q('select ps.* from performed_sets ps join workout_session_exercises wse on wse.id = ps.workout_session_exercise_id join workout_sessions ws on ws.id = wse.workout_session_id where ws.scheduled_workout_id = $1 order by wse.position, ps.set_number', [scheduledWorkoutId]),
});
// Every not-started row must equal the template workout at its plan position.
const assertMatchesTemplate = async (participationId, programId, label) => {
  const workouts = await template(programId);
  const rows = await plan(participationId);
  const sessions = new Set((await q('select scheduled_workout_id id from workout_sessions')).map((row) => row.id));
  const notStarted = rows.filter((row) => row.status === 'scheduled' && !sessions.has(row.id));
  assert.ok(notStarted.length > 0, `${label}: expected not-started workouts`);
  for (const row of notStarted) {
    const source = workouts[(row.seq - 1) % workouts.length];
    assert.equal(row.name, source.name, `${label}: name at #${row.seq}`);
    assert.equal(row.source, source.id, `${label}: template link at #${row.seq}`);
    assert.equal(row.cycle, Math.floor((row.seq - 1) / workouts.length) + 1, `${label}: cycle at #${row.seq}`);
    assert.equal(row.week, row.cycle, `${label}: week at #${row.seq}`);
    assert.equal(row.exercise_count, source.exercises.length, `${label}: exercise count at #${row.seq}`);
    assert.deepEqual(row.exercises, source.exercises, `${label}: exercises and sets at #${row.seq}`);
  }
};
const assertDatesAscend = (rows, label) => {
  const scheduled = rows.filter((row) => row.status === 'scheduled');
  for (let index = 1; index < scheduled.length; index += 1) assert.ok(scheduled[index].date > scheduled[index - 1].date, `${label}: dates ascend at #${scheduled[index].seq}`);
};

try {
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
    create schema auth;create schema private;create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema public,auth to authenticated,anon,service_role;
    insert into auth.users values('${alice}');`);
  for (const table of schema.tables) await db.exec(table.ddl);
  for (const constraint of [...schema.constraints].sort((a, b) => Number(a.foreign) - Number(b.foreign))) await db.exec(constraint.sql);
  for (const sql of schema.indexes) await db.exec(sql);
  for (const fn of schema.functions) await db.exec(fn.sql);
  for (const sql of schema.triggers) await db.exec(sql);
  for (const p of schema.policies) await db.exec(`create policy ${quote(p.name)} on public.${quote(p.table)} as ${p.permissive} for ${p.cmd} to ${p.roles.map(quote).join(',')} ${p.qual ? 'using (' + p.qual + ')' : ''} ${p.check ? 'with check (' + p.check + ')' : ''}`);
  for (const table of schema.tables) if (table.rls) await db.exec(`alter table public.${quote(table.name)} enable row level security`);
  for (const grant of schema.grants) await db.exec(`grant ${grant.privilege} on public.${quote(grant.table)} to ${quote(grant.role)}`);
  await db.exec(migration);
  await login(alice);

  // 1. The reported case: "Зал 2" had 8 exercises, the program now has 6.
  const hall1 = names('Зал 1 упражнение', 3).map((name) => exercise(name));
  const hall2 = names('Зал 2 упражнение', 8).map((name) => exercise(name, [12, 10, 8]));
  const first = await createAndStart(program([['Зал 1', hall1], ['Зал 2', hall2]], 3));
  const firstSeq1 = (await plan(first.participationId))[0].id;
  const firstSession = await scalar('select start_workout($1) value', [firstSeq1]);
  await q("update performed_sets set weight = 50, completed = true where workout_session_exercise_id in (select id from workout_session_exercises where workout_session_id = $1)", [firstSession]);
  await q('select complete_workout($1)', [firstSession]);
  const completedBefore = await snapshotOf(firstSeq1);
  const before = await plan(first.participationId);
  assert.equal(before[1].name, 'Зал 2');
  assert.equal(before[1].exercise_count, 8, 'fixture reproduces the 8-exercise card');

  const editedHall2 = [...hall2.slice(0, 5), exercise('Новое упражнение', [15, 15])];
  const editedHall1 = [hall1[2], hall1[0], hall1[1], exercise('Планка', [60])];
  await save(first.programId, program([['Зал 1 (верх)', editedHall1], ['Зал 2', editedHall2]], 3));
  const after = await plan(first.participationId);
  assert.equal(after.length, 6, 'plan size stays workouts × repeats');
  assert.equal(after[1].exercise_count, 6, 'Home card for the next "Зал 2" shows the saved count');
  assert.deepEqual(after.slice(1).map((row) => row.id), before.slice(1).map((row) => row.id), 'not-started workouts keep their IDs');
  await assertMatchesTemplate(first.participationId, first.programId, 'edit');
  assert.deepEqual(await snapshotOf(firstSeq1), completedBefore, 'completed workout and its results stay as they were');
  assert.equal(after[0].name, 'Зал 1', 'completed workout keeps its original name');
  assertDatesAscend(after, 'edit');

  // 2. A started workout keeps its snapshot; the rest of the plan follows the program.
  await asAdmin('update scheduled_workouts set scheduled_date = current_date where id = $1', [after[1].id]);
  const activeSession = await scalar('select start_workout($1) value', [after[1].id]);
  const activeBefore = await snapshotOf(after[1].id);
  await save(first.programId, program([['Зал 1 (верх)', editedHall1.slice(0, 2)], ['Зал 2', editedHall2.slice(0, 4)]], 3));
  assert.deepEqual(await snapshotOf(after[1].id), activeBefore, 'active workout and its session stay as they were');
  await assertMatchesTemplate(first.participationId, first.programId, 'edit during an active workout');
  assert.equal((await plan(first.participationId))[3].exercise_count, 4);

  // 3. Paused programs follow edits too; abandoned and skipped workouts keep their snapshots.
  await q('select abandon_workout($1)', [activeSession]);
  const abandonedBefore = await snapshotOf(after[1].id);
  const skippedId = (await plan(first.participationId))[2].id;
  await q('select skip_scheduled_workout($1)', [skippedId]);
  const skippedBefore = await snapshotOf(skippedId);
  await q('select pause_program($1)', [first.participationId]);
  await save(first.programId, program([['Зал 1 (верх)', hall1], ['Зал 2', hall2.slice(0, 7)]], 3));
  assert.deepEqual(await snapshotOf(after[1].id), abandonedBefore, 'abandoned workout stays as it was');
  assert.deepEqual(await snapshotOf(skippedId), skippedBefore, 'skipped workout stays as it was');
  await assertMatchesTemplate(first.participationId, first.programId, 'paused program');
  assert.equal(await scalar('select status value from user_programs where id = $1', [first.participationId]), 'paused');

  // 4. An overdue workout that was never started is still to be done: it follows the program and keeps its date.
  const second = await createAndStart(program([['A', [exercise('A1')]], ['B', [exercise('B1')]]], 2));
  const overdue = (await plan(second.participationId))[0];
  await asAdmin("update scheduled_workouts set scheduled_date = current_date - 3 where id = $1", [overdue.id]);
  await save(second.programId, program([['A', [exercise('A1'), exercise('A2')]], ['B', [exercise('B1')]]], 2));
  const overdueAfter = (await plan(second.participationId))[0];
  assert.equal(overdueAfter.exercise_count, 2, 'overdue workout gets the new exercise');
  assert.equal(overdueAfter.date, (await scalar("select (current_date - 3)::text value")), 'overdue date is not moved by the edit');
  await assertMatchesTemplate(second.participationId, second.programId, 'overdue');

  // 5. A workout added to the cycle extends the not-started tail: 2 × 2 becomes 3 × 2.
  const firstOfSecond = await scalar('select start_workout($1) value', [overdue.id]);
  await q('select complete_workout($1)', [firstOfSecond]);
  await save(second.programId, program([['A', [exercise('A1'), exercise('A2')]], ['B', [exercise('B1')]], ['C', [exercise('C1'), exercise('C2'), exercise('C3')]]], 2));
  const grown = await plan(second.participationId);
  assert.deepEqual(grown.map((row) => `${row.seq}:${row.name}:${row.status}`), ['1:A:completed', '2:B:scheduled', '3:C:scheduled', '4:A:scheduled', '5:B:scheduled', '6:C:scheduled']);
  await assertMatchesTemplate(second.participationId, second.programId, 'grown cycle');
  assertDatesAscend(grown, 'grown cycle');
  assert.ok(grown.slice(1).every((row) => row.date >= grown[0].date), 'new workouts are placed after the history');

  // 6. A workout removed from the cycle trims the tail: 3 × 2 becomes 2 × 2.
  await save(second.programId, program([['A', [exercise('A1')]], ['C', [exercise('C1')]]], 2));
  const trimmed = await plan(second.participationId);
  assert.deepEqual(trimmed.map((row) => `${row.seq}:${row.name}:${row.status}`), ['1:A:completed', '2:C:scheduled', '3:A:scheduled', '4:C:scheduled']);
  await assertMatchesTemplate(second.participationId, second.programId, 'trimmed cycle');

  // 7. When the shorter plan is already done, the participation completes like after the last workout.
  const third = await createAndStart(program([['A', [exercise('A1')]], ['B', [exercise('B1')]]], 1));
  const thirdFirst = await scalar('select start_workout($1) value', [(await plan(third.participationId))[0].id]);
  await q('select complete_workout($1)', [thirdFirst]);
  await save(third.programId, program([['A', [exercise('A1')]]], 1));
  assert.deepEqual((await plan(third.participationId)).map((row) => `${row.seq}:${row.status}`), ['1:completed']);
  assert.equal(await scalar('select status value from user_programs where id = $1', [third.participationId]), 'completed');

  // 8. Programs without a live participation have nothing to sync; their history stays.
  const history = async () => (await plan(third.participationId)).map((row) => [row.id, row.name, row.status, row.date, row.exercises.map((item) => item.name)]);
  const thirdHistory = await history();
  await save(third.programId, program([['A', [exercise('A1'), exercise('A2')]]], 1));
  assert.deepEqual(await history(), thirdHistory);

  // 9. "Во всей программе" reorder is stored in the template, so a later program edit keeps it.
  const fourth = await createAndStart(program([['A', [exercise('A1'), exercise('A2'), exercise('A3')]], ['B', [exercise('B1')]]], 3));
  const fourthFirst = (await plan(fourth.participationId))[0].id;
  const reorderSession = await scalar('select start_workout($1) value', [fourthFirst]);
  const sessionOrder = (await q('select id from workout_session_exercises where workout_session_id = $1 order by position', [reorderSession])).map((row) => row.id);
  await q("select reorder_workout_session_exercises($1,$2::uuid[],'program')", [reorderSession, [...sessionOrder].reverse()]);
  const reorderedTemplate = await template(fourth.programId);
  assert.deepEqual(reorderedTemplate[0].exercises.map((item) => item.name), ['A3', 'A2', 'A1'], 'template follows the program-wide reorder');
  assert.deepEqual((await plan(fourth.participationId))[2].exercises.map((item) => item.name), ['A3', 'A2', 'A1'], 'future copy follows the reorder');
  // The editor reads the template back and saves it unchanged.
  const fromEditor = program(reorderedTemplate.map((workout) => [workout.name, workout.exercises.map((item) => exercise(item.name, item.reps))]), 3);
  await save(fourth.programId, fromEditor);
  assert.deepEqual((await plan(fourth.participationId))[2].exercises.map((item) => item.name), ['A3', 'A2', 'A1'], 'a later edit keeps the reorder');
  await assertMatchesTemplate(fourth.participationId, fourth.programId, 'after reorder');

  // 10. A session-only reorder changes neither the template nor future copies.
  await q("select reorder_workout_session_exercises($1,$2::uuid[],'session')", [reorderSession, sessionOrder]);
  assert.deepEqual((await template(fourth.programId))[0].exercises.map((item) => item.name), ['A3', 'A2', 'A1']);

  console.log('program-edit-sync-db: ok');
} finally {
  await db.close();
}
