import { formatResultV2 } from './exerciseResultsV2.js';

/**
 * Completed workout summary. Legacy sets store weight/reps at the top level;
 * newer V2 sets store them in resultV2 and leave legacy fields empty.
 *
 * Tonnage sums the user-recorded external weight × reps for completed working
 * weight/reps sets. Do not infer body mass, double a dumbbell listed "per
 * implement", or add duration/cardio/assistance values as kilograms.
 */
export function readWorkingLoad(set) {
  if (!set?.completed || set.setType !== 'working') return null;
  const result = set.resultV2;
  if (result && (result.measurement_type !== 'weight_reps' || result.completed === false)) return null;
  const rawWeight = result ? result.weight : set.weight;
  const rawReps = result ? result.reps : set.reps;
  if (rawWeight === '' || rawWeight == null || rawReps === '' || rawReps == null) return null;
  const weight = Number(rawWeight);
  const reps = Number(rawReps);
  if (!Number.isFinite(weight) || !Number.isFinite(reps) || weight <= 0 || reps <= 0) return null;
  return { weight, reps, fromV2: Boolean(result), loadMode: result?.load_mode ?? null };
}

export function workingTonnage(sets) {
  return (sets ?? []).reduce((sum, set) => {
    const load = readWorkingLoad(set);
    return load ? sum + load.weight * load.reps : sum;
  }, 0);
}


function hasRecordedMetrics(set) {
  const result = set.resultV2;
  if (result) {
    const positive = field => field != null && field !== '' && Number.isFinite(Number(field)) && Number(field) > 0;
    switch (result.measurement_type) {
      case 'weight_reps': return positive(result.weight) && positive(result.reps);
      case 'bodyweight_reps': return positive(result.reps);
      case 'assisted_reps': return positive(result.reps) && result.assistance_weight != null;
      case 'duration':
      case 'cardio': return positive(result.duration_seconds);
      case 'carry': return positive(result.weight) && (positive(result.duration_seconds) || positive(result.distance_meters));
      default: return false;
    }
  }
  // Planned repetitions are prefilled before the workout starts. Repetitions
  // alone are not proof of a saved performance; require entered weight too.
  return set.weight !== '' && set.weight != null && Number.isFinite(Number(set.weight))
    && Number(set.weight) >= 0 && set.reps !== '' && set.reps != null
    && Number.isFinite(Number(set.reps)) && Number(set.reps) > 0;
}

function completedSetSummary(set) {
  const load = readWorkingLoad(set);
  if (load) return load.weight + ' кг' + (['dumbbell_each', 'kettlebell_each'].includes(load.loadMode) ? ' / снаряд' : '') + ' × ' + load.reps;
  // Unchecked but already persisted weight × reps must not lose its weight
  // when shown after the workout (readWorkingLoad only accepts checked sets).
  const result = set.resultV2;
  if (hasRecordedMetrics(set) && (!result || result.measurement_type === 'weight_reps')) {
    const weight = Number(result ? result.weight : set.weight);
    const reps = Number(result ? result.reps : set.reps);
    const perImplement = ['dumbbell_each', 'kettlebell_each'].includes(result?.load_mode) ? ' / снаряд' : '';
    return weight + ' кг' + perImplement + ' × ' + reps;
  }
  if (result) return formatResultV2(result);
  const reps = Number(set.reps);
  const weight = Number(set.weight);
  if (Number.isFinite(reps) && reps > 0) return reps + ' повт.';
  if (Number.isFinite(weight) && weight > 0) return weight + ' кг';
  return '—';
}

/**
 * The completed session is the source of truth, not the scheduled template.
 * Keep EVERY session exercise (including those added while training), even
 * when there is no completed working set with positive weight/repetitions.
 * Do not falsely present an unfinished set as a recorded result.
 */
export function completedWorkoutExerciseRows(exercises) {
  return (exercises ?? []).map(exercise => {
    const sets = exercise.sets ?? [];
    const working = sets.filter(set => set.completed && set.setType === 'working');
    const weighted = working.map(set => {
      const load = readWorkingLoad(set);
      return load ? { ...set, ...load } : null;
    }).filter(Boolean);
    const best = weighted.reduce((current, set) => {
      const score = set.weight * (1 + set.reps / 30);
      const currentScore = current ? current.weight * (1 + current.reps / 30) : -1;
      return score > currentScore ? set : current;
    }, null);
    const warmups = sets.filter(set => set.completed && set.setType === 'warmup');
    const completedFallback = working.at(-1) || warmups.at(-1);
    // A user can enter and persist weight/reps without pressing the set's
    // checkmark. After finishing the workout the values still exist, even
    // though "completed" is false. Show them rather than an incorrect dash;
    // do not silently turn them into completed sets or count them as tonnage.
    const savedUnmarked = !best && !completedFallback
      ? [...sets].reverse().find(set => !set.completed && hasRecordedMetrics(set))
      : null;
    const visibleSet = best || completedFallback || savedUnmarked;
    const warmupPrefix = visibleSet && visibleSet.setType === 'warmup' && !working.length ? 'Разминка: ' : '';
    return {
      exercise,
      best,
      score: best ? best.weight * (1 + best.reps / 30) : 0,
      summary: visibleSet
        ? warmupPrefix + completedSetSummary(visibleSet) + (savedUnmarked ? ' (не отмечен)' : '')
        : '—',
    };
  });
}
