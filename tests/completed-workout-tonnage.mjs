import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readWorkingLoad, workingTonnage, completedWorkoutExerciseRows } from '../src/lib/completedWorkoutTonnage.js';

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
assert.match(screen, /import \{ completedWorkoutExerciseRows, workingTonnage \} from '\.\.\/lib\/completedWorkoutTonnage\.js'/);
assert.match(completed, /const tonnage = workingTonnage\(entry\.workout\.exercises\.flatMap\(\(exercise\) => exercise\.sets\)\)/);
assert.match(completed, /completedWorkoutExerciseRows\(entry\.workout\.exercises\)/);
assert.match(completed, /<div className="completed-result-table">/);
assert.doesNotMatch(completed, /Результаты по типам нагрузки/, 'Completed workout no longer contains the extra load-type section');
assert.match(completed, /<CompletedWorkoutEditor/, 'Editing completed sets remains possible');
assert.match(completed, /row\.best\.fromV2/, 'Do not compare V2 exercise personal records with legacy e1RM');
// Regression: all session exercises must show in the completed workout,
// including a manually added one even if its metric is not weight/reps.
const planned = { id: 'planned', name: 'Жим', exerciseId: 'a', sets: [legacy] };
const added = { id: 'added', name: 'Тяга гантели', exerciseId: 'b', addedInWorkout: true, sets: [v2] };
const addedBodyweight = { id: 'bodyweight', name: 'Подтягивания', exerciseId: 'c', addedInWorkout: true, sets: [bodyweight] };
const addedDuration = { id: 'duration', name: 'Планка', exerciseId: 'd', addedInWorkout: true, sets: [{
  ...v2, resultV2: { completed: true, measurement_type: 'duration', duration_seconds: 50 },
}] };
const unfinished = { id: 'unfinished', name: 'Новое упражнение', exerciseId: 'e', addedInWorkout: true, sets: [] };
const programAdded = { id: 'program-added', name: 'Приседания', exerciseId: 'f', addedInWorkout: false, sets: [barbell] };
const exercises = [planned, added, addedBodyweight, addedDuration, unfinished, programAdded];
const rows = completedWorkoutExerciseRows(exercises);
assert.deepEqual(rows.map(row => row.exercise.id), exercises.map(exercise => exercise.id),
  'All session exercises remain in order, including session-only and program-scope additions');
assert.equal(rows[1].summary, '12.5 кг / снаряд × 8');
assert.equal(rows[2].summary, '10 повт.');
assert.equal(rows[3].summary, '50 с');
assert.equal(rows[4].summary, '—');
assert.equal(rows[5].summary, '40 кг × 6');
assert.equal(workingTonnage(exercises.flatMap(exercise => exercise.sets)), 840);
assert.equal(rows[2].best, null, 'Bodyweight repetitions are shown without inventing external-weight records');

// The regression seen in a real completed workout: values were autosaved on
// an exercise added in-session, but the checkmark was never pressed. The set
// stays incomplete in storage, yet must not render as a misleading dash.
const uncheckedAdded = { id: 'saved-added', name: 'Тяга блока', addedInWorkout: true,
  sets: [{ ...legacy, weight: '65', reps: '12', completed: false }] };
const uncheckedV2 = { id: 'saved-v2', name: 'Жим гантелей', addedInWorkout: true,
  sets: [{ ...v2, completed: false, resultV2: { ...v2.resultV2, completed: false } }] };
const uncheckedCardio = { id: 'saved-cardio', name: 'Велотренажёр', addedInWorkout: true,
  sets: [{ ...cardio, completed: false, resultV2: { ...cardio.resultV2, completed: false } }] };
const fakePlanned = { id: 'planned-reps', name: 'Без результата', addedInWorkout: false,
  sets: [{ ...legacy, completed: false, weight: '', reps: '10' }] };
const summaries = completedWorkoutExerciseRows([uncheckedAdded, uncheckedV2, uncheckedCardio, fakePlanned]);
assert.equal(summaries[0].summary, '65 кг × 12 (не отмечен)');
assert.equal(summaries[1].summary, '12.5 кг / снаряд × 8 (не отмечен)');
assert.equal(summaries[2].summary, '900 с · 2000 м (не отмечен)');
assert.equal(summaries[3].summary, '—', 'Scheduled repetitions alone are not a saved workout result');
assert.equal(summaries[0].best, null, 'Unmarked results must not be treated as personal records');
assert.equal(workingTonnage(uncheckedAdded.sets.concat(uncheckedV2.sets)), 0,
  'Showing a saved value must not silently mark it completed or add it to tonnage');

assert.match(completed, /row\.summary/, 'The same inclusive summary appears in result cards and sharing');
assert.match(completed, /<span>Результат<\/span>/);
const loader = readFileSync('src/lib/workoutSessions.js', 'utf8');
assert.match(loader, /\.from\('workout_session_exercises'\)[\s\S]*?\.eq\('workout_session_id', sessionId\)/,
  'Completed sessions load every exercise in the actual workout, not only planned program exercises');
console.log('Completed workout tonnage and manually added exercise summaries passed.');
