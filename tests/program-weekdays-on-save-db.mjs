// Issue #70: a ready-made program joined on chosen weekdays (Mon/Wed/Fri) must keep
// the remaining workouts on those weekdays when the program is saved, resumed or
// rescheduled, instead of being re-laid "every other day" by rest_days_after.
// Runs the live schema (fixture) plus the migrations in a disposable PGlite database.
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';

const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const schema = JSON.parse(read('./fixtures/catalog-live-schema-20261015.json'));
const migrationsBefore = [
  '../supabase/migrations/20261108140000_start_program_with_selected_weekdays.sql',
  '../supabase/migrations/20261109145203_sync_not_started_workouts_with_program_edits.sql',
].map(read);
const migration = read('../supabase/migrations/20261109170000_keep_chosen_training_weekdays.sql');
const db = new PGlite();
const alice = '00000000-0000-4000-8000-000000000001';
const q = async (sql, args = []) => (await db.query(sql, args)).rows;
const scalar = async (sql, args = []) => (await q(sql, args))[0]?.value;
const login = async (id) => { await db.exec('reset role'); await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]); await db.exec('set role authenticated'); };
const asAdmin = async (sql, args = []) => { await db.exec('reset role'); const rows = await q(sql, args); await db.exec('set role authenticated'); return rows; };
const quote = (value) => '"' + value.replaceAll('"', '""') + '"';

// Calendar helpers on 'YYYY-MM-DD' strings (ISO weekdays: 1 = Monday, 7 = Sunday).
const MWF = [1, 3, 5];
const TTS = [2, 4, 6];
const addDays = (date, days) => { const value = new Date(`${date}T00:00:00Z`); value.setUTCDate(value.getUTCDate() + days); return value.toISOString().slice(0, 10); };
const isoDow = (date) => new Date(`${date}T00:00:00Z`).getUTCDay() || 7;
const nextChosen = (date, days) => { let value = addDays(date, 1); while (!days.includes(isoDow(value))) value = addDays(value, 1); return value; };
const firstChosenFrom = (date, days) => nextChosen(addDays(date, -1), days);
const chain = (first, count, days) => { const dates = [first]; while (dates.length < count) dates.push(nextChosen(dates.at(-1), days)); return dates; };
const everyOtherDay = (first, count) => Array.from({ length: count }, (_, index) => addDays(first, index * 2));

const exercise = (name) => ({ exercise_id: null, exercise_name_snapshot: name, prescription_snapshot: '3×10', sets: [{ reps: 10 }, { reps: 10 }, { reps: 10 }] });
const program = (workoutNames = ['A', 'B', 'C'], scheduleMode = 'custom') => ({
  name: 'Готовая программа',
  week_count: 1,
  structure_mode: 'cycle',
  cycle_repeat_count: 2,
  schedule_mode: scheduleMode,
  weeks: [{ workouts: workoutNames.map((name) => ({ name, rest_days_after: 1, exercises: [exercise(`${name}1`)] })) }],
});
const save = (programId, payload = program()) => q('select update_program_with_schedule($1,$2::jsonb)', [programId, JSON.stringify(payload)]);
const plan = (participationId) => q(`select id, sequence_number::int seq, workout_name name, status, scheduled_date::text date
  from scheduled_workouts where user_program_id = $1 order by sequence_number`, [participationId]);
const dates = async (participationId) => (await plan(participationId)).map((row) => row.date);
const weekdaysOf = (participationId) => scalar('select training_weekdays value from user_programs where id = $1', [participationId]);

// What the join screen does: save the program with the chosen days in its details, then join on those days.
const label = { 1: 'Понедельник', 3: 'среда', 5: 'пятница' };
const joinOnWeekdays = async (days, today) => {
  const programId = await scalar('select create_program_with_schedule($1::jsonb) value', [JSON.stringify(program())]);
  await asAdmin("update programs set details = jsonb_build_object('schedule', $2::text, 'frequency', '3 тренировки в неделю') where id = $1", [programId, days.map((day) => label[day]).join(', ')]);
  const start = firstChosenFrom(today, days);
  const participationId = await scalar('select start_program_with_weekdays($1,$2::date,$3::int[]) value', [programId, start, days]);
  return { programId, participationId, start };
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
  await db.exec("alter table public.programs add column if not exists details jsonb not null default '{}'::jsonb");
  for (const sql of migrationsBefore) await db.exec(sql);
  await login(alice);
  const today = await scalar('select current_date::text value');

  // Participations that exist before this migration is applied.
  const intact = await joinOnWeekdays(MWF, today);
  const broken = await joinOnWeekdays(MWF, today);
  await save(broken.programId);
  const brokenDates = await dates(broken.participationId);
  assert.notDeepEqual(brokenDates, chain(broken.start, 6, MWF), 'without the fix a save re-lays Mon/Wed/Fri every other day');
  assert.deepEqual(brokenDates, everyOtherDay(broken.start, 6), 'the bug as reported: 15 Sun, 17 Tue, 19 Thu');
  const plainBefore = await scalar('select create_program_with_schedule($1::jsonb) value', [JSON.stringify(program())]);
  await asAdmin("update programs set details = jsonb_build_object('schedule', 'Понедельник, среда, пятница') where id = $1", [plainBefore]);
  const plainBeforeParticipation = await scalar('select start_program($1,current_date) value', [plainBefore]);

  await db.exec('reset role');
  await db.exec(migration);
  await login(alice);

  // 0. Backfill: only the plan that still lies on its chosen days is marked.
  assert.deepEqual(await weekdaysOf(intact.participationId), MWF, 'intact Mon/Wed/Fri plan remembers its weekdays');
  assert.equal(await weekdaysOf(broken.participationId), null, 'a plan already re-laid by a save is left alone');
  assert.equal(await weekdaysOf(plainBeforeParticipation), null, 'a rest-days program with a weekday label is left alone');
  await save(intact.programId);
  assert.deepEqual(await dates(intact.participationId), chain(intact.start, 6, MWF), 'backfilled plan survives a save');

  // 1. The reported case: joined on Mon/Wed/Fri, the program is saved unchanged.
  const first = await joinOnWeekdays(MWF, today);
  const joined = await dates(first.participationId);
  assert.deepEqual(joined, chain(first.start, 6, MWF), 'join lays the plan on Mon/Wed/Fri');
  assert.deepEqual(await weekdaysOf(first.participationId), MWF, 'join stores the chosen weekdays');
  await save(first.programId);
  const saved = await dates(first.participationId);
  assert.deepEqual(saved, joined, 'saving the program keeps every date');
  assert.ok(saved.every((date) => MWF.includes(isoDow(date))), 'all workouts stay on Mon/Wed/Fri');

  // 2. An edit that adds a workout to the cycle (#59 grows the plan to 4 × 2) keeps the weekdays.
  await save(first.programId, program(['A', 'B', 'C', 'D']));
  const grown = await plan(first.participationId);
  assert.deepEqual(grown.map((row) => row.name), ['A', 'B', 'C', 'D', 'A', 'B', 'C', 'D']);
  assert.deepEqual(grown.map((row) => row.date), chain(first.start, 8, MWF), 'the grown plan is on Mon/Wed/Fri');

  // 3. With history: done and skipped workouts keep their dates, the rest go on the next chosen days from today.
  const history = await joinOnWeekdays(MWF, today);
  await asAdmin('update scheduled_workouts set scheduled_date = scheduled_date - 7 where user_program_id = $1', [history.participationId]);
  await asAdmin('update user_programs set start_date = start_date - 7 where id = $1', [history.participationId]);
  const [h1, h2] = await plan(history.participationId);
  await asAdmin("update scheduled_workouts set status = 'completed' where id = $1", [h1.id]);
  await asAdmin("update scheduled_workouts set status = 'skipped' where id = $1", [h2.id]);
  const beforeHistory = await plan(history.participationId);
  await save(history.programId);
  const afterHistory = await plan(history.participationId);
  const fixed = beforeHistory.filter((row) => row.date < today || ['completed', 'skipped'].includes(row.status));
  const lastFixed = fixed.at(-1);
  assert.deepEqual(afterHistory.slice(0, fixed.length), fixed, 'history keeps its dates and statuses');
  const anchor = lastFixed.date > addDays(today, -1) ? lastFixed.date : addDays(today, -1);
  assert.deepEqual(afterHistory.slice(fixed.length).map((row) => row.date), chain(nextChosen(anchor, MWF), afterHistory.length - fixed.length, MWF),
    'remaining workouts go on the next Mon/Wed/Fri, not before today');

  // 3b. After a long break the next workout goes on the first chosen day from today, not on today itself.
  const longBreak = await joinOnWeekdays(MWF, today);
  const [doneLongAgo] = await plan(longBreak.participationId);
  await asAdmin("update scheduled_workouts set scheduled_date = $2::date, status = 'completed' where id = $1", [doneLongAgo.id, addDays(longBreak.start, -14)]);
  await save(longBreak.programId);
  assert.deepEqual((await dates(longBreak.participationId)).slice(1), chain(firstChosenFrom(today, MWF), 5, MWF), 'after a break the plan restarts on the next Mon/Wed/Fri');

  // 4. Resume after a pause: the chosen date first, then the chosen weekdays.
  const paused = await joinOnWeekdays(MWF, today);
  await q('select pause_program($1)', [paused.participationId]);
  const resumeOn = firstChosenFrom(addDays(today, 7), MWF);
  await q('select resume_program($1,$2::date)', [paused.participationId, resumeOn]);
  assert.deepEqual(await dates(paused.participationId), chain(resumeOn, 6, MWF), 'resume keeps Mon/Wed/Fri');
  await q('select pause_program($1)', [paused.participationId]);
  const tuesday = firstChosenFrom(addDays(today, 1), [2]);
  await q('select resume_program($1,$2::date)', [paused.participationId, tuesday]);
  assert.deepEqual(await dates(paused.participationId), [tuesday, ...chain(nextChosen(tuesday, MWF), 5, MWF)], 'resume on a Tuesday, then back to Mon/Wed/Fri');

  // 5. Moving a workout with its tail, and the older reschedule RPC.
  const moved = await joinOnWeekdays(MWF, today);
  const movedPlan = await plan(moved.participationId);
  const thursday = nextChosen(movedPlan[1].date, [4]);
  await q("select reschedule_scheduled_workout_scoped($1,$2::date,'tail')", [movedPlan[2].id, thursday]);
  const afterTail = await dates(moved.participationId);
  assert.deepEqual(afterTail, [movedPlan[0].date, movedPlan[1].date, thursday, ...chain(nextChosen(thursday, MWF), 3, MWF)], 'tail after a moved workout stays on Mon/Wed/Fri');
  const saturday = nextChosen(afterTail[3], [6]);
  await q('select reschedule_scheduled_workout($1,$2::date)', [movedPlan[4].id, saturday]);
  assert.deepEqual(await dates(moved.participationId), [...afterTail.slice(0, 4), saturday, nextChosen(saturday, MWF)], 'reschedule_scheduled_workout keeps Mon/Wed/Fri');
  await q("select reschedule_scheduled_workout_scoped($1,$2::date,'single')", [movedPlan[5].id, addDays(saturday, 1)]);
  assert.equal((await dates(moved.participationId))[5], addDays(saturday, 1), 'a single move still goes exactly where the user put it');

  // 6. Changing the start date before the first workout.
  const restarted = await joinOnWeekdays(MWF, today);
  const laterStart = addDays(restarted.start, 7);
  await q('select change_program_start_date($1,$2::date)', [restarted.participationId, laterStart]);
  assert.deepEqual(await dates(restarted.participationId), chain(laterStart, 6, MWF), 'new start date keeps Mon/Wed/Fri');
  const sunday = nextChosen(laterStart, [7]);
  await q('select change_program_start_date($1,$2::date)', [restarted.participationId, sunday]);
  assert.deepEqual(await dates(restarted.participationId), [sunday, ...chain(nextChosen(sunday, MWF), 5, MWF)], 'start on a Sunday, then Mon/Wed/Fri');

  // 7. Choosing a preset rhythm in the editor replaces the chosen days for good.
  const rhythm = await joinOnWeekdays(MWF, today);
  await save(rhythm.programId, program(['A', 'B', 'C'], 'weekly_tts'));
  assert.equal(await weekdaysOf(rhythm.participationId), null, 'preset rhythm clears the chosen weekdays');
  const tts = await dates(rhythm.participationId);
  assert.deepEqual(tts, chain(firstChosenFrom(rhythm.start, TTS), 6, TTS), 'plan follows Tue/Thu/Sat');
  await save(rhythm.programId, program(['A', 'B', 'C'], 'custom'));
  assert.deepEqual(await dates(rhythm.participationId), everyOtherDay(tts[0], 6), 'back in custom mode the rest days apply');

  // 8. A participation started without chosen weekdays keeps the rest-days rhythm.
  const plainProgram = await scalar('select create_program_with_schedule($1::jsonb) value', [JSON.stringify(program())]);
  const plain = await scalar('select start_program($1,current_date) value', [plainProgram]);
  assert.equal(await weekdaysOf(plain), null);
  await save(plainProgram);
  assert.deepEqual(await dates(plain), everyOtherDay(today, 6), 'rest_days_after = 1 still means every other day');

  // 9. Only real ISO weekdays can be stored.
  await assert.rejects(q("update user_programs set training_weekdays = '{0,8}' where id = $1", [plain]), /training_weekdays_check/);

  console.log('program-weekdays-on-save-db: ok');
} finally {
  await db.close();
}
