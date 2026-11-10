// Averages of "one workout" on the Statistics screen (#77).
//
// A workout whose timer was left running (forgotten, never really finished) is
// stored as completed with a duration of many hours. One such session turns an
// average of about an hour into 17 hours, so it is treated as an outlier and
// left out of every per-workout average. Totals are not touched.

// Longer than this is never a real workout: the timer was left running.
export const MAX_PLAUSIBLE_DURATION_SECONDS = 4 * 60 * 60;
// A workout this long is still plausible on its own, so it is an outlier only
// when it is also far above what is usual for the period.
export const SUSPICIOUS_DURATION_SECONDS = 2 * 60 * 60;
export const OUTLIER_MEDIAN_FACTOR = 3;
// The median says what is "usual" only when there are enough other workouts.
export const MIN_SESSIONS_FOR_MEDIAN_RULE = 3;

function median(values) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function durationOf(session) {
  const value = Number(session?.durationSeconds || 0);
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function findOutlierSessionIds(sessions) {
  const list = sessions ?? [];
  const outliers = new Set();
  list.forEach((session) => {
    if (durationOf(session) > MAX_PLAUSIBLE_DURATION_SECONDS) outliers.add(session.id);
  });

  // The median is taken without the sessions already rejected, so several
  // forgotten timers in one period cannot pass themselves off as the norm.
  const plausible = list.filter((session) => !outliers.has(session.id)).map(durationOf).filter((value) => value > 0);
  if (plausible.length >= MIN_SESSIONS_FOR_MEDIAN_RULE) {
    const usual = median(plausible);
    list.forEach((session) => {
      const duration = durationOf(session);
      if (duration > SUSPICIOUS_DURATION_SECONDS && duration > usual * OUTLIER_MEDIAN_FACTOR) outliers.add(session.id);
    });
  }
  return outliers;
}

export function workoutAverages(sessions, sets) {
  const list = sessions ?? [];
  const outliers = findOutlierSessionIds(list);
  const counted = list.filter((session) => !outliers.has(session.id));
  const countedIds = new Set(counted.map((session) => session.id));
  const workingSets = (sets ?? []).filter((set) => set.setType === 'working' && countedIds.has(set.sessionId));
  const count = counted.length;
  const duration = counted.reduce((sum, session) => sum + durationOf(session), 0);
  const volume = workingSets.reduce((sum, set) => sum + Number(set.volume || 0), 0);
  return {
    counted: count,
    excluded: outliers.size,
    duration: count ? duration / count : 0,
    volume: count ? volume / count : 0,
    sets: count ? workingSets.length / count : 0,
  };
}
