import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readWorkingLoad, workingTonnage } from '../src/lib/completedWorkoutTonnage.js';

const legacy = { setType: 'working', completed: true, weight: '50', reps: '10', resultV2: null };
const v2 = { setType: 'working', completed: true, weight: '', reps: '', resultV2: {
  completed: true, set_type: 'working', measurement_type: 'weight_reps',
  weight: 12.5, reps: 8, load_mode: 'dumbbell_each',
} };
const barbell = { ...v2, resultV2: { ...v2.resultV2, weight: 40, reps: 6, load_mode: 'barbell_total' } };
const warmup = { ...legacy, setType: 'warmup', weight: '30' };
const incomplete = { ...legacy, completed: false };
const withoutReps = { ...legacy, reps: '' };
const withoutWeight = { ...legacy, weight: '' };
const cardio = { ...v2, resultV2: { completed: true, measurement_type: 'cardio', duration_seconds: 900, distance_meters: 2000 } };
const assistance = { ...v2, resultV2: { completed: true, measurement_type: 'assisted_reps', assistance_weight: 20, reps: 10 } };
const bodyweight = { ...v2, resultV2: { completed: true, measurement_type: 'bodyweight_reps', reps: 10 } };
assert.deepEqual(readWorkingLoad(legacy), { weight: 50, reps: 10, fromV2: false, loadMode: null });
assert.deepEqual(readWorkingLoad(v2), { weight: 12.5, reps: 8, fromV2: true, loadMode: 'dumbbell_each' });
assert.equal(workingTonnage([legacy, v2, barbell]), 840);
assert.equal(workingTonnage([warmup, incomplete, withoutReps, withoutWeight, cardio, assistance, bodyweight]), 0);
assert.equal(workingTonnage([]), 0);
assert.equal(workingTonnage([{ ...v2, resultV2: { ...v2.resultV2, weight: Number.NaN } }]), 0);
assert.equal(workingTonnage([{ ...v2, completed: false }]), 0);
assert.equal(workingTonnage([{ ...v2, resultV2: { ...v2.resultV2, completed: false } }]), 0);
assert.equal(workingTonnage([{ ...legacy, weight: '0' }]), 0);

const screen = readFileSync('src/components/WorkoutSessionScreenV3.jsx', 'utf8');
const completed = screen.slice(screen.indexOf('function CompletedWorkout('), screen.indexOf('function AbandonedWorkout('));
assert.match(screen, /import \{ readWorkingLoad, workingTonnage \} from '\.\.\/lib\/completedWorkoutTonnage\.js'/);
assert.match(completed, /const tonnage = workingTonnage\(entry\.workout\.exercises\.flatMap\(\(exercise\) => exercise\.sets\)\)/);
assert.match(completed, /const load = readWorkingLoad\(set\)/);
assert.match(completed, /<div className="completed-result-table">/);
assert.doesNotMatch(completed, /Результаты по типам нагрузки/, 'Completed workout no longer contains the extra load-type section');
assert.match(completed, /<CompletedWorkoutEditor/, 'Editing completed sets remains possible');
assert.match(completed, /row\.best\.fromV2/, 'Do not compare V2 exercise personal records with legacy e1RM');
console.log('Completed workout tonnage: legacy + V2 weights, exclusions, summary and simplified layout passed.');
