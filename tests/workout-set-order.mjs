// Issue #60: one order for both kinds of set rows in an exercise card (warm-ups on top),
// and sets that can be moved by holding and dragging their number.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { applySetOrder, labelSets, moveSet, orderSets, renumberSets, sameSetOrder } from '../src/lib/setOrder.js';

// Windows checkouts get CRLF: the multi-line patterns below are written with \n.
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const screen = read('src/components/WorkoutSessionScreenV3.jsx');
const resultSet = read('src/components/ResultSetV2.jsx');
const sessions = read('src/lib/workoutSessions.js');
const css = read('src/workout-set-order.css');
const cardCss = read('src/workout-exercise-card.css');
const migration = read('supabase/migrations/20261109161041_reorder_performed_sets.sql');
const between = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
const rule = (source, selector) => {
  const start = source.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing rule ${selector}`);
  return source.slice(start, source.indexOf('}', start));
};

const set = (id, setNumber, setType = 'working') => ({ id, setNumber, setType });
const shown = (sets) => labelSets(orderSets(sets)).map((item) => `${item.id}:${item.displayLabel}`);

// 1. The reported case: «+ Разминка» stores the new set last, and it is still shown on top.
const working = [set('a', 1), set('b', 2), set('c', 3)];
assert.deepEqual(shown([...working, set('w1', 4, 'warmup')]), ['w1:Р1', 'a:1', 'b:2', 'c:3']);
// A second warm-up goes under the first one, above the working sets.
assert.deepEqual(shown([...working, set('w1', 4, 'warmup'), set('w2', 5, 'warmup')]), ['w1:Р1', 'w2:Р2', 'a:1', 'b:2', 'c:3']);
// Labels follow the shown order, not the stored numbers (gaps after a deletion).
assert.deepEqual(shown([set('a', 2), set('c', 7), set('w', 5, 'warmup')]), ['w:Р1', 'a:1', 'c:2']);

// 2. Dragging moves a set within its group and never across the warm-up / working boundary.
const order = ['w1', 'w2', 'a', 'b', 'c'];
const warmups = new Set(['w1', 'w2']);
assert.deepEqual(moveSet(order, 'c', 'a', warmups), ['w1', 'w2', 'c', 'a', 'b']);
assert.deepEqual(moveSet(order, 'a', 'b', warmups), ['w1', 'w2', 'b', 'a', 'c']);
assert.deepEqual(moveSet(order, 'w2', 'w1', warmups), ['w2', 'w1', 'a', 'b', 'c']);
assert.equal(moveSet(order, 'a', 'w1', warmups), order, 'a working set does not go above a warm-up');
assert.equal(moveSet(order, 'w1', 'c', warmups), order, 'a warm-up does not go below a working set');
assert.equal(moveSet(order, 'a', 'elsewhere', warmups), order, 'a row of another exercise is not a target');
// The dragged order is shown as is; sets it does not know follow in their own order.
const sets = [set('a', 1), set('b', 2), set('c', 3), set('w1', 4, 'warmup')];
assert.deepEqual(applySetOrder(sets, ['w1', 'c', 'a', 'b']).map((item) => item.id), ['w1', 'c', 'a', 'b']);
assert.deepEqual(applySetOrder([...sets, set('d', 9)], ['w1', 'c', 'a', 'b']).map((item) => item.id), ['w1', 'c', 'a', 'b', 'd']);
// After saving, the numbers are 1..n in the new order, as the server stores them.
assert.deepEqual(renumberSets(sets, ['w1', 'c', 'a', 'b']).map((item) => `${item.id}${item.setNumber}`), ['w11', 'c2', 'a3', 'b4']);
assert.ok(sameSetOrder(['a', 'b'], ['a', 'b']) && !sameSetOrder(['a', 'b'], ['b', 'a']) && !sameSetOrder(['a'], ['a', 'b']));

// 3. Both kinds of rows (weight × reps and results v2) get the same order, labels and handle.
assert.match(screen, /function buildDisplaySets\(sets, draggedOrder\) \{\n  return labelSets\(draggedOrder \? applySetOrder\(sets, draggedOrder\) : orderSets\(sets\)\);/);
assert.match(screen, /const drag = setDrag\?\.exerciseId === exercise\.id \? setDrag : null; const displaySets = buildDisplaySets\(exercise\.sets, drag\?\.order\);/);
const card = between(screen, '<article className="workout-exercise-card v3"', '</article>');
const list = between(card, '<div className={`exercise-set-list', '<div className="exercise-card-actions">');
assert.match(list, /displaySets\.map\(/);
assert.match(list, /<ResultSetV2 key=\{set\.id\} set=\{set\}[^>]*dragging=\{dragging\} handleProps=\{handleProps\}/);
assert.match(list, /<LegacySetRow key=\{set\.id\} set=\{set\}[^>]*dragging=\{dragging\} handleProps=\{handleProps\}/);
assert.match(list, /onPointerDown: \(event\) => holdSetHandle\(event, exercise, set\)/);
// Results v2 rows show the label of the shown order (Р1, 1, 2…) instead of the stored number.
assert.match(resultSet, /const label=set\.displayLabel\?\?/);
assert.match(resultSet, /<span className="result-set-v2-number" \{\.\.\.handleProps\}>\{label\}<\/span>/);
assert.match(resultSet, /data-set-id=\{set\.id\}/);
assert.match(resultSet, /\$\{set\.setType==='warmup'\?' warmup':''\}/);
const legacyRow = between(screen, 'function LegacySetRow(', 'function ActiveWorkout(');
assert.match(legacyRow, /data-set-id=\{set\.id\}/);
assert.match(legacyRow, /<span className="exercise-set-number" \{\.\.\.handleProps\}>\{set\.displayLabel\}<\/span>/);
// The order is in the markup now, so CSS no longer reorders warm-up rows of one kind only.
assert.doesNotMatch(cardCss, /order:\s*-1/);

// 4. Holding the number picks the row up; a swipe that starts there moves nothing.
assert.match(screen, /const SET_HOLD_MS = 250;/);
assert.match(screen, /const SET_HOLD_SLOP_PX = 8;/);
const hold = between(screen, 'function holdSetHandle(', 'async function addSet(');
assert.match(hold, /window\.setTimeout\(\(\) => \{/);
assert.match(hold, /> SET_HOLD_SLOP_PX\) release\(\)/);
assert.match(hold, /startsWith\('temp:'\)/, 'a set still being created cannot be dragged');
assert.match(hold, /orderSavesRef\.current\.has\(exercise\.id\)/, 'one save of the order at a time');
for (const selector of ['.exercise-set-number,\n.result-set-v2-number']) {
  assert.match(rule(css, selector), /touch-action: none;[\s\S]*user-select: none;[\s\S]*-webkit-touch-callout: none;/);
}
assert.match(rule(css, '.exercise-set-row.dragging,\n.result-set-v2.compact.dragging'), /box-shadow:/);
assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|\brgba?\(/i, 'theme tokens only, so the dark theme follows');

// 5. Dropping saves the whole order in one call; a cancelled gesture or a failed save restores it.
const drop = between(screen, 'function drop(event)', 'window.addEventListener');
assert.match(drop, /if \(event\.type === 'pointerup'\) saveSetOrder\(current\.exerciseId, current\.order, current\.numbers\);/);
const save = between(screen, 'async function saveSetOrder(', 'function holdSetHandle(');
assert.match(save, /patchExerciseSets\(exerciseId, \(sets\) => renumberSets\(sets, order\)\);/);
assert.match(save, /await reorderPerformedSets\(exerciseId, order\);/);
assert.match(save, /catch \(e\) \{\n\s+patchExerciseSets\(exerciseId, \(sets\) => sets\.map\(\(set\) => numbers\.has\(set\.id\) \? \{ \.\.\.set, setNumber: numbers\.get\(set\.id\) \}/);
assert.match(save, /if \(!quiet\) setLocalError\(e\.message\);/);
assert.match(sessions, /supabase\.rpc\('reorder_performed_sets', \{\n\s+p_workout_session_exercise_id: sessionExerciseId,\n\s+p_ordered_set_ids: orderedSetIds,/);

// 6. A new warm-up is stored under the other warm-ups too, so history and the next load agree.
const add = between(screen, 'async function addSet(', 'async function removeSet(');
assert.match(add, /if\(setType==='warmup'&&!sets\.some\(set=>String\(set\.id\)\.startsWith\('temp:'\)\)\) \{\n\s+void saveSetOrder\(exercise\.id,orderSets\(sets\)\.map\(set=>set\.id\),new Map\(sets\.map\(set=>\[set\.id,set\.setNumber\]\)\),\{quiet:true\}\);/);
// A new set never takes a number that a reorder in flight has not freed yet.
assert.match(add, /const nextNumber=Math\.max\(highestSetNumberRef\.current\.get\(exercise\.id\)\?\?0,\.\.\.exercise\.sets\.map\(set=>set\.setNumber\)\)\+1;/);

// 7. The server keeps warm-ups on top and writes the order in one transaction.
assert.match(migration, /create or replace function public\.reorder_performed_sets\(\n  p_workout_session_exercise_id uuid,\n  p_ordered_set_ids uuid\[\]\n\)/);
assert.match(migration, /security invoker/);
assert.match(migration, /ws\.user_id = v_user_id and ws\.status = 'active'/);
assert.match(migration, /raise exception 'Warm-up sets must come before working sets'/);
assert.match(migration, /revoke all on function public\.reorder_performed_sets\(uuid, uuid\[\]\) from public, anon;/);

console.log('workout set order ok');
