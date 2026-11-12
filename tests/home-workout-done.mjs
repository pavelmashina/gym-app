import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  completedWorkoutFacts,
  formatWorkoutDuration,
  formatWorkoutTonnage,
  tonnageFromSetRows,
} from '../src/lib/completedWorkoutFacts.js';

// #107: after a workout was done, its home card changed only the button text
// («Посмотреть результат»). Now the card itself changes: light with an outline,
// «Выполнена» with a check mark, and the time and tonnage of the workout in rows.
const read = (path) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const home = read('src/components/HomeScreen.jsx');
const css = read('src/home-workout-done.css');
const main = read('src/main.jsx');

// --- The card of a finished workout is its own markup, not a relabelled button. ---
assert.match(home, /if \(workout\.completed && !workout\.active\) return <CompletedWorkoutSummary workout=\{workout\} onOpenWorkout=\{onOpenWorkout\} \/>;/,
  'A finished workout that is not running again renders the done card.');
const done = home.slice(home.indexOf('function CompletedWorkoutSummary('), home.indexOf('function WorkoutSummary('));
assert.ok(done.length > 0, 'CompletedWorkoutSummary is defined before WorkoutSummary.');
assert.match(done, /className="summary-col workout workout-done"/);
assert.match(done, /<div className="summary-label"><span className="workout-done-check"><DoneCheckIcon \/><\/span>Выполнена<\/div>/,
  'The label says «Выполнена» and carries the check mark.');
assert.match(done, /<WorkoutTitle title=\{workout\.title\} \/>/, 'The title keeps the fitting of #74.');
assert.match(done, /facts\.length > 0 && <dl className="workout-done-facts">/, 'No empty list when there is nothing to show.');
assert.match(done, /<dt>\{fact\.label\}<\/dt><dd>\{fact\.value\}<\/dd>/);
assert.match(done, /<button className="workout-btn" type="button" aria-label="Посмотреть результат" onClick=\{\(\) => onOpenWorkout\?\.\(workout\.id\)\}>Результат<\/button>/,
  'The button opens the result and still reads «Посмотреть результат» to a screen reader.');
assert.doesNotMatch(home, /workout\.completed \? 'Посмотреть результат'/, 'The old relabelled button is gone.');

// --- The totals come with the card and cannot break it. ---
const loader = home.slice(home.indexOf('async function loadCompletedSummary('), home.indexOf('async function loadWorkoutCard('));
assert.match(loader, /from\('workout_sessions'\)\.select\('id, active_duration_seconds'\)\.eq\('scheduled_workout_id', scheduledWorkoutId\)\.eq\('status', 'completed'\)/);
assert.match(loader, /from\('performed_sets'\)[\s\S]*\.eq\('completed', true\)/);
assert.match(loader, /tonnage: tonnageFromSetRows\(setRows\)/);
assert.match(loader, /catch \(error\) \{[\s\S]*return null;/, 'A failed summary gives a card without rows, not an error card.');
const card = home.slice(home.indexOf('async function loadWorkoutCard('), home.indexOf('export function HomeScreen('));
assert.match(card, /const completed = !active && workoutRow\.status === 'completed';/);
assert.match(card, /const summaryRequest = completed \? loadCompletedSummary\(workoutRow\.id\) : null;/);
assert.match(card, /summary: summaryRequest \? await summaryRequest : null,/);

// --- Wording of the rows. ---
assert.equal(formatWorkoutDuration(52 * 60), '52 мин');
assert.equal(formatWorkoutDuration(20), '1 мин', 'A started workout is at least a minute.');
assert.equal(formatWorkoutDuration(65 * 60), '1 ч 5 мин');
assert.equal(formatWorkoutDuration(2 * 3600), '2 ч');
assert.equal(formatWorkoutDuration(0), '');
assert.equal(formatWorkoutDuration(null), '');
const plain = (text) => text.replace(/\s/g, ' ');
assert.equal(plain(formatWorkoutTonnage(4850)), '4 850 кг');
assert.equal(plain(formatWorkoutTonnage(4849.6)), '4 850 кг');
assert.equal(plain(formatWorkoutTonnage(99999)), '99 999 кг');
assert.equal(plain(formatWorkoutTonnage(124850)), '124,9 т', 'Six digits and «кг» do not fit a 375px phone.');
assert.equal(formatWorkoutTonnage(0), '');

assert.deepEqual(completedWorkoutFacts(null), []);
assert.deepEqual(completedWorkoutFacts({ durationSeconds: 0, tonnage: 0 }), [],
  'A workout marked done by hand with no weights has no rows.');
assert.deepEqual(completedWorkoutFacts({ durationSeconds: 3120, tonnage: 0 }).map((fact) => `${fact.label}:${fact.value}`), ['Время:52 мин']);
assert.deepEqual(completedWorkoutFacts({ durationSeconds: 3120, tonnage: 4850 }).map((fact) => fact.label), ['Время', 'Тоннаж']);

// Tonnage follows the result screen: completed working sets, weight × reps.
assert.equal(tonnageFromSetRows([
  { completed: true, set_type: 'working', weight: 100, reps: 5 },
  { completed: true, set_type: 'warmup', weight: 60, reps: 10 },
  { completed: false, set_type: 'working', weight: 100, reps: 5 },
  { completed: true, set_type: 'working', weight: null, reps: 12 },
  { completed: true, set_type: 'working', weight: null, reps: null, result_v2: { measurement_type: 'weight_reps', weight: 20, reps: 10 } },
  { completed: true, set_type: 'working', weight: null, reps: null, result_v2: { measurement_type: 'bodyweight_reps', reps: 15 } },
]), 700);
assert.equal(tonnageFromSetRows(null), 0);

// --- Styles: a light card in both themes, from tokens only. ---
assert.match(main, /import '\.\/home-summary\.css';\nimport '\.\/home-workout-done\.css';/, 'Imported right after home-summary.css.');
const cardRule = css.match(/\.summary-col\.workout\.workout-done \{([^}]*)\}/);
assert.ok(cardRule, 'home-workout-done.css styles the done card.');
assert.match(cardRule[1], /background: var\(--surface\);/);
assert.match(cardRule[1], /color: var\(--ink\);/);
assert.match(cardRule[1], /box-shadow: inset 0 0 0 1\.5px var\(--ink\);/, 'An outline that does not change the size of the card.');
assert.match(css, /\.workout-done-check \{[^}]*background: var\(--ink\);[^}]*color: var\(--surface\);/);
assert.match(css, /\.summary-col\.workout-done \.workout-btn \{[^}]*background: var\(--ink\);[^}]*color: var\(--surface\);/,
  'The button swaps colours with the card.');
assert.match(css, /\.workout-done-facts > div \{[^}]*justify-content: space-between;[^}]*white-space: nowrap;/);
assert.match(css, /\.workout-done-facts > div \+ div \{\s*border-top: 1px solid color-mix\(in srgb, var\(--ink\) 10%, transparent\);/);
assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-fA-F]{3,8}\b|rgba?\(/,
  'No fixed colours: the card must follow the theme.');

console.log('Home completed workout card contracts passed.');
