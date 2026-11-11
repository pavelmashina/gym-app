import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { initialCompletedSetDraft, prepareCompletedSetUpdate } from '../src/lib/completedWorkoutEdits.js';
import { completedWorkoutExerciseRows, workingTonnage } from '../src/lib/completedWorkoutTonnage.js';

const legacy = { id: 'added-set', setType: 'working', completed: false, completedAt: null, weight: '65', reps: '12', resultV2: null };
const draft = initialCompletedSetDraft(legacy);
assert.equal(draft.completed, false);
assert.equal(prepareCompletedSetUpdate(legacy, draft), null, 'Saved metrics alone do not complete a set');
const finished = prepareCompletedSetUpdate(legacy, { ...draft, completed: true });
assert.equal(finished.completed, true);
assert.equal(finished.weight, '65');
assert.equal(finished.reps, '12');
assert.equal(workingTonnage([legacy]), 0);
assert.equal(workingTonnage([finished]), 780);
assert.equal(completedWorkoutExerciseRows([{ id: 'added', name: 'Тяга', addedInWorkout: true, sets: [finished] }])[0].summary, '65 кг × 12');
assert.equal(prepareCompletedSetUpdate(legacy, { ...draft, weight: '70' }).completed, false);
assert.equal(prepareCompletedSetUpdate({ ...legacy, completed: true }, { ...draft, completed: false }).completed, false);
assert.throws(() => prepareCompletedSetUpdate({ ...legacy, reps: '' }, { ...draft, reps: '', completed: true }),
  /укажите количество повторений/);

const resultV2 = {
  metric_version: 'v2', exercise_id: 'exercise', measurement_type: 'weight_reps', load_mode: 'dumbbell_each',
  weight_unit: 'kg', configuration_key: 'standard', laterality: 'bilateral',
  set_type: 'working', completed: false, weight: 12.5, reps: 8,
};
const v2 = { ...legacy, id: 'v2-added', weight: '', reps: '', resultV2 };
const v2Done = prepareCompletedSetUpdate(v2, { ...initialCompletedSetDraft(v2), completed: true });
assert.equal(v2Done.completed, true);
assert.equal(v2Done.resultV2.completed, true);
assert.equal(v2Done.resultV2.load_mode, 'dumbbell_each');
assert.equal(workingTonnage([v2Done]), 100);
assert.throws(() => prepareCompletedSetUpdate({ ...v2, resultV2: { ...resultV2, reps: null } },
  { ...initialCompletedSetDraft(v2), reps: '', completed: true }), /обязательные показатели/);
const duration = { ...v2, resultV2: { ...resultV2, measurement_type: 'duration', load_mode: 'none',
  weight: undefined, reps: undefined, duration_seconds: 45 } };
const durationDone = prepareCompletedSetUpdate(duration, { ...initialCompletedSetDraft(duration), completed: true });
assert.equal(durationDone.completed, true, 'Non-weight sets can be checked too');

const ui = readFileSync('src/components/CompletedWorkoutEditor.jsx', 'utf8');
const css = readFileSync('src/program-ui-refresh.css', 'utf8');
assert.match(ui, /type="checkbox" checked=\{Boolean\(drafts\[set\.id\]\?\.completed\)\}/);
assert.match(ui, /onChange=\{event => change\(set\.id, 'completed', event\.target\.checked\)\}/);
assert.match(ui, /entry\.workout\.exercises\.filter\(exercise => exercise\.sets\.length\)/);
assert.match(ui, /prepareCompletedSetUpdate\(set, drafts\[set\.id\]\)/);
assert.match(ui, /updatePerformedSet\(change\.id, change\.values\)/);
assert.match(ui, /await onReload\(\)/);
assert.doesNotMatch(ui, /completed: Boolean\(reps\)/);
assert.match(css, /\.completed-editor-set \.completed-editor-completion input\[type="checkbox"\]/);
console.log('Retrospective workout editor completion tests passed.');
