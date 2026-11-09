// Issue #61: «Добавить упражнение» is offered in every active workout (a program one too), under the
// last exercise card, and saves through add_session_exercise. In a program workout the user first
// chooses: only this workout, or the whole program. The database side: session-exercise-add-db.mjs.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Windows checkouts get CRLF; comments are dropped so they cannot hide or fake a rule.
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const code = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, '');
const screen = read('src/components/WorkoutSessionScreenV3.jsx');
const adder = read('src/components/WorkoutExerciseAdder.jsx');
const sessions = read('src/lib/workoutSessions.js');
const css = code('src/workout-exercise-adder.css');
const cardCss = code('src/workout-exercise-card.css');
const migration = read('supabase/migrations/20261109190000_add_session_exercise.sql');
const scopeMigration = read('supabase/migrations/20261109200000_add_exercise_to_program_from_workout.sql');
const modalCss = code('src/workout-session-figma.css');
const rule = (source, selector) => {
  const start = source.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing rule ${selector}`);
  return source.slice(start, source.indexOf('}', start));
};

// 1. The active workout renders the adder for every workout, right after the list of exercise cards.
const active = screen.slice(screen.indexOf('function ActiveWorkout('), screen.indexOf('function CompletedWorkout('));
assert.match(active, /<\/article>; \}\)\}<\/section><WorkoutExerciseAdder sessionId=\{session\.id\} empty=\{!workout\.exercises\.length\} standalone=\{workout\.standalone\} canAddToProgram=\{Boolean\(workout\.programWorkoutId\)\} onEntryChange=\{onEntryChange\} \/><\/main>/,
  'the button sits under the last exercise card, inside the scrolling content');
assert.doesNotMatch(screen, /standalone\s*&&\s*<WorkoutExerciseAdder|StandaloneExerciseEditor/, 'not only for standalone workouts');
assert.equal(screen.match(/<WorkoutExerciseAdder\b/g)?.length, 1, 'one button per workout');
assert.match(active, /<article className="workout-exercise-card v3" key=\{exercise\.id\} data-session-exercise-id=\{exercise\.id\}>/, 'the new card can be found to bring it into view');

// 2. An exercise added during the workout has no program exercise behind it, so its order can change
// only in this workout (the program scope would fail on it).
assert.match(sessions, /\.select\('id, exercise_id, source_scheduled_workout_exercise_id, /);
assert.match(sessions, /addedInWorkout: !row\.source_scheduled_workout_exercise_id,/);
assert.match(active, /<ReorderExerciseScreen sessionOnly=\{workout\.standalone \|\| workout\.exercises\.some\(\(exercise\) => exercise\.addedInWorkout\)\}/);
assert.match(screen, /\{!sessionOnly && <button type="button" disabled=\{saving\} onClick=\{\(\) => onSave\(draft\.map\(\(x\) => x\.id\), 'program'\)\}>/);

// 3. Where it goes: a workout made from a program workout asks first, a standalone one adds at once.
assert.match(sessions, /\.select\('id, workout_name, scheduled_date, status, standalone_owner_id, source_program_workout_id'\)/);
assert.match(sessions, /programWorkoutId: workout\.source_program_workout_id \?\? null,/);
assert.match(adder, /<ExerciseLibraryPicker onSelect=\{pick\} \/>/);
assert.match(adder, /function pick\(exercise\) \{\n    if \(pending\.current\) return;\n    if \(canAddToProgram\) \{ setError\(''\); setChoice\(exercise\); \} else add\(exercise, 'session'\);\n  \}/);
const ask = adder.slice(adder.indexOf('{choice && <div className="reorder-scope-shell workout-add-scope"'), adder.lastIndexOf('</section>;'));
assert.ok(ask.length > 0, 'the question is the scope sheet the workout screen already uses for moving exercises');
const answers = [...ask.matchAll(/<button (?:className="(\w+)" )?type="button" disabled=\{Boolean\(busy\)\} onClick=\{([^}]+)\}>([^<]+)<\/button>/g)].map(([, kind = '', action, label]) => [kind, action, label]);
assert.deepEqual(answers, [
  ['primary', "() => add(choice, 'session')", "{busy === 'session' ? 'Добавляем…' : 'Только в эту тренировку'}"],
  ['', "() => add(choice, 'program')", "{busy === 'program' ? 'Добавляем…' : 'Во всю программу'}"],
  ['cancel', 'closeChoice', 'Отмена'],
], 'two answers and a way back, «Только в эту тренировку» first');
assert.match(ask, /<span>Куда добавить упражнение\?<\/span>\n        <h3>\{choice\.name\}<\/h3>/);
assert.match(ask, /Завершённые тренировки не изменятся\./);

// 4. Adding: unsaved results first, one request at a time, then the reloaded workout.
const add = sessions.slice(sessions.indexOf('export async function addSessionExercise('), sessions.indexOf('const performedSetWriteQueues'));
assert.match(add, /export async function addSessionExercise\(sessionId, exerciseId, scope = 'session'\) \{/);
assert.match(add, /supabase\.rpc\('add_session_exercise', \{\n    p_session_id: sessionId, p_exercise_id: exerciseId, p_scope: scope,/);
assert.doesNotMatch(sessions, /addStandaloneExercise/, 'the standalone-only call is gone from the app');
const flow = adder.slice(adder.indexOf('async function add('), adder.indexOf('return <section'));
const order = ['if (pending.current) return;', 'assertResultsSaved();', 'await flushPendingSetEdits();', 'addedId = await addSessionExercise(sessionId, exercise.id, scope);', 'setOpen(false);', 'onEntryChange(await loadWorkoutSession(sessionId));', 'revealAddedCard(addedId)'];
let at = -1;
for (const step of order) {
  const next = flow.indexOf(step, at + 1);
  assert.ok(next > at, `step in order: ${step}`);
  at = next;
}
// A failed add goes back to the picker with the error; closing the picker dismisses it.
assert.match(flow, /catch \(e\) \{\n(?:      \/\/.*\n)?      setChoice\(null\);\n      setError\(e\.message\);\n      pending\.current = false; setBusy\(''\);\n      return;/);
assert.match(adder, /function closePicker\(\) \{ if \(!pending\.current\) \{ setOpen\(false\); setChoice\(null\); setError\(''\); \} \}/);
assert.match(adder, /function closeChoice\(\) \{ if \(!pending\.current\) setChoice\(null\); \}/);
assert.match(adder, /<button className="workout-add-exercise" type="button" disabled=\{Boolean\(busy\)\} onClick=\{openPicker\}><PlusIcon \/>Добавить упражнение<\/button>/);
// The new card is brought fully above the fixed footer.
assert.match(adder, /querySelector\('\.workout-session-footer'\)\?\.getBoundingClientRect\(\)\.top/);

// 5. Look: a full-width 48px tile in theme tokens, so it follows the dark theme.
const button = rule(css, '.workout-add-exercise');
for (const declaration of ['width: 100%', 'min-height: 48px', 'border: 1px solid var(--line)', 'border-radius: var(--radius-md)', 'background: var(--surface)', 'color: var(--ink)', 'font-size: var(--text-body)', 'font-weight: var(--weight-semibold)']) {
  assert.ok(button.includes(declaration), `.workout-add-exercise: ${declaration}`);
}
assert.doesNotMatch(button, /#[0-9a-f]{3,8}\b|rgba?\(|dashed/i, 'no literal colours or dashed outline');
assert.match(rule(css, '.workout-exercise-adder'), /margin-top: var\(--card-gap\)/, 'the same gap as between the cards');
// A card whose last set was deleted shows no column head.
assert.match(cardCss, /\.exercise-set-head:has\(\+ \.exercise-set-list:empty\) \{ display: none; \}/);
// The question opens over the exercise picker.
const pickerLayer = Number(rule(modalCss, '.workout-modal-shell').match(/z-index: (\d+)/)[1]);
const questionLayer = Number(rule(css, '.reorder-scope-shell.workout-add-scope').match(/z-index: (\d+)/)[1]);
assert.ok(questionLayer > pickerLayer, `«Куда добавить упражнение?» (${questionLayer}) over the picker (${pickerLayer})`);

// 6. The database function, first as applied: any active, not paused workout of the user, the catalog the picker shows.
const fn = migration.replace(/--.*$/gm, '');
assert.match(fn, /create or replace function public\.add_session_exercise\(p_session_id uuid, p_exercise_id uuid\)/);
assert.match(fn, /security invoker/);
assert.match(fn, /ws\.user_id = auth\.uid\(\) and ws\.status = 'active' and ws\.paused_at is null\s+for update;/);
assert.doesNotMatch(fn, /standalone_owner_id|user_program_id/, 'program workouts are not excluded');
assert.match(fn, /from public\.exercise_catalog_v2 where id = p_exercise_id/);
assert.doesNotMatch(fn, /insert into public\.performed_sets/, 'no sets are created');
assert.match(fn, /revoke all on function public\.add_session_exercise\(uuid, uuid\) from public, anon;/);
// Then with the choice: 'session' by default, 'program' also into the template workout and the
// workouts made from it that have not started; one empty set either way.
const scoped = scopeMigration.replace(/--.*$/gm, '');
assert.match(scoped, /drop function if exists public\.add_session_exercise\(uuid, uuid\);/, 'one function, so a two-argument call is not ambiguous');
assert.match(scoped, /create or replace function public\.add_session_exercise\(p_session_id uuid, p_exercise_id uuid, p_scope text default 'session'\)/);
assert.match(scoped, /security invoker/);
assert.match(scoped, /ws\.user_id = v_user_id and ws\.status = 'active' and ws\.paused_at is null\n  for update of ws;/);
assert.match(scoped, /if p_scope = 'program' and not exists \([\s\S]*?where w\.id = v_template_workout_id and p\.owner_id = v_user_id/);
const intoProgram = scoped.slice(scoped.indexOf("if p_scope = 'program' then"), scoped.indexOf('end loop;\n  end if;'));
for (const table of ['program_workout_exercises', 'program_exercise_sets', 'scheduled_workout_exercises', 'scheduled_sets']) {
  assert.ok(intoProgram.includes(`insert into public.${table} (`), `only the program scope writes ${table}`);
  assert.equal(scoped.split(`insert into public.${table} (`).length, 2, `${table} is written in one place`);
}
assert.match(scoped, /sw\.id = v_scheduled_workout_id\n          or \(up\.status in \('active', 'paused'\) and sw\.status = 'scheduled'\n              and not exists \(select 1 from public\.workout_sessions s where s\.scheduled_workout_id = sw\.id\)\)/,
  'this workout and the not-started ones only');
assert.match(scoped, /insert into public\.performed_sets \(workout_session_exercise_id, source_scheduled_set_id, set_number, set_type\)\n    values \(v_id, v_source_set_id, 1, 'working'\);/);
assert.match(scoped, /revoke all on function public\.add_session_exercise\(uuid, uuid, text\) from public, anon;/);
assert.match(scoped, /grant execute on function public\.add_session_exercise\(uuid, uuid, text\) to authenticated;/);

console.log('Adding exercises to an active workout: button for every workout, order of steps, look and database function passed.');
