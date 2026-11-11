// Issue #100: an empty cell of a set row shows, in grey, what the same set held in the previous workout.
// The previous workout is the latest completed one with this exercise, the same one «История» shows.
import { isWarmupSet, orderSets } from './setOrder.js';

const present = (value) => value !== null && value !== undefined && value !== '';

// Lines the previous sets up with the shown ones: the Nth warm-up with the Nth warm-up of last time,
// the Nth working set with the Nth working set. A set with no counterpart gets null.
export function matchPreviousSets(displaySets, previousSets) {
  const ordered = orderSets(previousSets ?? []);
  const pools = { warmup: ordered.filter(isWarmupSet), working: ordered.filter((set) => !isWarmupSet(set)) };
  const seen = { warmup: 0, working: 0 };
  return new Map((displaySets ?? []).map((set) => {
    const kind = isWarmupSet(set) ? 'warmup' : 'working';
    return [set.id, pools[kind][seen[kind]++] ?? null];
  }));
}

// The value of one field of a results v2 row. A legacy weight is never read as a per-dumbbell,
// additional or assisted load (see exerciseResultsV2.js), so a legacy set gives only its reps.
export function previousResultV2Value(previous, field, loadMode) {
  if (!previous) return '';
  const result = previous.resultV2;
  if (!result) return field === 'reps' && present(previous.reps) ? String(previous.reps) : '';
  if (['weight', 'assistance_weight'].includes(field) && result.load_mode !== loadMode) return '';
  return present(result[field]) ? String(result[field]) : '';
}

// Weight (kg) and reps of a weight × reps row. A results v2 weight counts only when it is the whole load.
const PER_IMPLEMENT = ['dumbbell_each', 'kettlebell_each'];
export function previousLegacyValues(previous) {
  if (!previous) return { weight: '', reps: '' };
  const result = previous.resultV2;
  if (!result) return { weight: present(previous.weight) ? String(previous.weight) : '', reps: present(previous.reps) ? String(previous.reps) : '' };
  return {
    weight: result.measurement_type === 'weight_reps' && !PER_IMPLEMENT.includes(result.load_mode) && present(result.weight) ? String(result.weight) : '',
    reps: present(result.reps) ? String(result.reps) : '',
  };
}
