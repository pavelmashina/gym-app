import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { matchPreviousSets, previousLegacyValues, previousResultV2Value } from '../src/lib/previousWorkoutHints.js';

// Issue #100: an empty cell of a set row shows, in light grey, what the same set held in the previous
// workout; with nothing from last time the cell stays empty.
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

// --- Pairing: the Nth warm-up with the Nth warm-up, the Nth working set with the Nth working set.
const shown = [
  { id: 'w1', setType: 'warmup', setNumber: 1 },
  { id: 's1', setType: 'working', setNumber: 2 },
  { id: 's2', setType: 'working', setNumber: 3 },
  { id: 's3', setType: 'working', setNumber: 4 },
];
const last = [
  { id: 'p2', setType: 'working', setNumber: 3, reps: '5' },
  { id: 'p1', setType: 'working', setNumber: 2, reps: '8' },
  { id: 'pw', setType: 'warmup', setNumber: 1, reps: '15' },
];
const paired = matchPreviousSets(shown, last);
assert.equal(paired.get('w1').id, 'pw');
assert.equal(paired.get('s1').id, 'p1', 'set numbers decide the order of last time, not the order rows arrive in');
assert.equal(paired.get('s2').id, 'p2');
assert.equal(paired.get('s3'), null, 'a set that was not done last time gets nothing');
assert.equal(matchPreviousSets(shown, undefined).get('s1'), null, 'an exercise done for the first time gets nothing');
// Warm-ups never borrow from working sets: without a warm-up last time, the warm-up stays empty.
assert.equal(matchPreviousSets(shown, [{ id: 'x', setType: 'working', setNumber: 1 }]).get('w1'), null);

// --- Results v2 rows: the screenshot of the issue, pull-ups with «Повторения» and «Дополнительный вес, кг».
const pullUp = (reps, weight) => ({ resultV2: { measurement_type: 'bodyweight_reps', load_mode: 'bodyweight', reps, weight } });
assert.equal(previousResultV2Value(pullUp(8, 0), 'reps', 'bodyweight'), '8');
assert.equal(previousResultV2Value(pullUp(8, 0), 'weight', 'bodyweight'), '0', 'a zero added weight is still last time\'s value');
assert.equal(previousResultV2Value(pullUp(8, 12.5), 'weight', 'bodyweight'), '12.5');
assert.equal(previousResultV2Value(pullUp(8, null), 'weight', 'bodyweight'), '', 'no value last time, no hint');
assert.equal(previousResultV2Value(null, 'reps', 'bodyweight'), '', 'no set last time, no hint');
// A load measured another way is not shown as this one (per dumbbell vs. whole load).
const dumbbells = { resultV2: { measurement_type: 'weight_reps', load_mode: 'dumbbell_each', weight: 20, reps: 10 } };
assert.equal(previousResultV2Value(dumbbells, 'weight', 'external_total'), '');
assert.equal(previousResultV2Value(dumbbells, 'reps', 'external_total'), '10');
// A legacy weight is never read as a v2 load; its reps are the same reps.
assert.equal(previousResultV2Value({ weight: '40', reps: '10' }, 'weight', 'bodyweight'), '');
assert.equal(previousResultV2Value({ weight: '40', reps: '10' }, 'reps', 'bodyweight'), '10');

// --- Weight × reps rows.
assert.deepEqual(previousLegacyValues({ weight: '42.5', reps: '8' }), { weight: '42.5', reps: '8' });
assert.deepEqual(previousLegacyValues({ weight: '', reps: '' }), { weight: '', reps: '' });
assert.deepEqual(previousLegacyValues(null), { weight: '', reps: '' });
assert.deepEqual(previousLegacyValues({ resultV2: { measurement_type: 'weight_reps', load_mode: 'barbell_total', weight: 60, reps: 5 } }), { weight: '60', reps: '5' });
assert.deepEqual(previousLegacyValues(dumbbells), { weight: '', reps: '10' });

// --- Loading: one batch for the whole workout, from the latest completed workout with each exercise.
const tables = {
  workout_sessions: [
    { id: 'current', status: 'active', started_at: '2026-11-11T10:00:00Z', ended_at: null },
    { id: 'old', status: 'completed', started_at: '2026-11-01T10:00:00Z', ended_at: '2026-11-01T11:00:00Z' },
    { id: 'last', status: 'completed', started_at: '2026-11-08T10:00:00Z', ended_at: '2026-11-08T11:00:00Z' },
    { id: 'gave-up', status: 'abandoned', started_at: '2026-11-10T10:00:00Z', ended_at: '2026-11-10T10:10:00Z' },
  ],
  workout_session_exercises: [
    { id: 'ex-old', workout_session_id: 'old', exercise_id: 'pull-up', exercise_name_snapshot: 'Подтягивания', position: 1 },
    { id: 'ex-last', workout_session_id: 'last', exercise_id: 'pull-up', exercise_name_snapshot: 'Подтягивания', position: 2 },
    { id: 'ex-custom', workout_session_id: 'old', exercise_id: null, exercise_name_snapshot: 'Моё упражнение', position: 2 },
    { id: 'ex-other', workout_session_id: 'last', exercise_id: 'squat', exercise_name_snapshot: 'Присед', position: 1 },
    { id: 'ex-gave-up', workout_session_id: 'gave-up', exercise_id: 'pull-up', exercise_name_snapshot: 'Подтягивания', position: 1 },
  ],
  performed_sets: [
    { id: 'a', workout_session_exercise_id: 'ex-old', set_number: 1, set_type: 'working', completed: true, reps: 6, weight: null, result_v2: null },
    { id: 'b2', workout_session_exercise_id: 'ex-last', set_number: 2, set_type: 'working', completed: true, reps: null, weight: null, result_v2: { measurement_type: 'bodyweight_reps', load_mode: 'bodyweight', reps: 5, weight: 0 } },
    { id: 'b1', workout_session_exercise_id: 'ex-last', set_number: 1, set_type: 'working', completed: true, reps: null, weight: null, result_v2: { measurement_type: 'bodyweight_reps', load_mode: 'bodyweight', reps: 8, weight: 0 } },
    { id: 'b3', workout_session_exercise_id: 'ex-last', set_number: 3, set_type: 'working', completed: false, reps: null, weight: null, result_v2: null },
    { id: 'c', workout_session_exercise_id: 'ex-custom', set_number: 1, set_type: 'working', completed: true, reps: 12, weight: 30, result_v2: null },
    { id: 'g', workout_session_exercise_id: 'ex-gave-up', set_number: 1, set_type: 'working', completed: true, reps: 99, weight: null, result_v2: null },
  ],
};
const requests = [];
// A stand-in for supabase-js that answers from the tables above.
function query(table) {
  const filters = [];
  let order = null;
  let limit = Infinity;
  const builder = {
    select() { return builder; },
    eq(key, value) { filters.push((row) => row[key] === value); return builder; },
    neq(key, value) { filters.push((row) => row[key] !== value); return builder; },
    in(key, values) { filters.push((row) => values.includes(row[key])); return builder; },
    order(key, { ascending = true } = {}) { order = { key, ascending }; return builder; },
    limit(count) { limit = count; return builder; },
    then(resolve, reject) {
      requests.push(table);
      let rows = tables[table].filter((row) => filters.every((test) => test(row)));
      if (order) rows = [...rows].sort((a, b) => (a[order.key] < b[order.key] ? -1 : a[order.key] > b[order.key] ? 1 : 0) * (order.ascending ? 1 : -1));
      return Promise.resolve({ data: rows.slice(0, limit), error: null }).then(resolve, reject);
    },
  };
  return builder;
}
globalThis.__previousTest = { client: { from: query }, resilience: await import('../src/lib/requestResilience.js'), results: await import('../src/lib/exerciseResultsV2.js') };
const sessionsSource = read('src/lib/workoutSessions.js')
  .replace("import { supabase } from './supabase.js';", 'const supabase=globalThis.__previousTest.client;')
  .replace("import { validateResultV2 } from './exerciseResultsV2.js';", 'const {validateResultV2}=globalThis.__previousTest.results;')
  .replace(/import \{([^}]*)\} from '\.\/requestResilience\.js';/, 'const {$1}=globalThis.__previousTest.resilience;');
const { getPreviousWorkoutSets } = await import(`data:text/javascript;base64,${Buffer.from(sessionsSource).toString('base64')}`);

const found = await getPreviousWorkoutSets(['pull-up', 'snapshot:Моё упражнение', 'new-exercise', 'pull-up'], 'current');
assert.deepEqual(requests, ['workout_sessions', 'workout_session_exercises', 'performed_sets'], 'three requests for the whole workout');
assert.deepEqual(found.get('pull-up').map((set) => set.id), ['b1', 'b2'], 'the latest completed workout, its completed sets in order');
assert.equal(found.get('pull-up')[0].resultV2.reps, 8);
assert.deepEqual(found.get('snapshot:Моё упражнение').map((set) => set.reps), ['12'], 'an exercise without a catalog id is found by its name');
assert.equal(found.has('new-exercise'), false, 'an exercise never done gets nothing');
assert.equal(found.has('squat'), false, 'only the exercises of this workout');
requests.length = 0;
assert.equal((await getPreviousWorkoutSets([], 'current')).size, 0);
assert.deepEqual(requests, [], 'a workout without exercises asks for nothing');

// --- Wiring: both kinds of set rows get last time's set and show it as a placeholder.
const screen = read('src/components/WorkoutSessionScreenV3.jsx');
const resultSet = read('src/components/ResultSetV2.jsx');
assert.match(screen, /getPreviousWorkoutSets\(JSON\.parse\(previousKeys\), session\.id\)\.then\(\(found\) => \{ if \(active\) setPreviousSets\(found\); \}\)\.catch\(\(\) => \{\}\)/,
  'the hints load once per workout and a failure leaves the cells empty, without an error');
assert.match(screen, /const previousBySet = matchPreviousSets\(displaySets, previousSets\.get\(String\(exercise\.exerciseId\)\)\);/);
assert.match(screen, /<ResultSetV2 key=\{set\.id\} set=\{set\} previous=\{previousBySet\.get\(set\.id\)\}/);
assert.match(screen, /<LegacySetRow key=\{set\.id\} set=\{set\} previous=\{previousBySet\.get\(set\.id\)\}/);
assert.match(resultSet, /const hint=previousResultV2Value\(previous,field,draft\.load_mode\);/);
assert.match(resultSet, /placeholder=\{shownHint\(field\)\} value=\{shownValue\(field\)\}/,
  'a results v2 field shows last time\'s value only while it is empty');
const legacyRow = screen.slice(screen.indexOf('function LegacySetRow('), screen.indexOf('function ActiveWorkout('));
assert.match(legacyRow, /placeholder=\{weightHint\}/);
assert.match(legacyRow, /placeholder=\{repsHint\}/);
assert.match(legacyRow, /const repsHint=last\.reps!==''\?last\.reps:set\.plannedReps\?String\(set\.plannedReps\):'—';/, 'without last time, the planned reps as before');

// --- Light grey, from theme tokens only, the same on both kinds of rows.
assert.match(screen, /import '\.\.\/workout-previous-hints\.css';/);
const css = read('src/workout-previous-hints.css').replace(/\/\*[\s\S]*?\*\//g, '');
assert.match(css, /\.workout-exercise-card\.v3 \.exercise-set-row input::placeholder,\n\.workout-exercise-card\.v3 \.result-set-v2 input::placeholder \{[^}]*color: var\(--muted\);[^}]*opacity: \.75;/);
assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'no literal colours, so the dark theme applies');

console.log('workout previous hints: ok');
