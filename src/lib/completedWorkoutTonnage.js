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
