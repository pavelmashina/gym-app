import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  MAX_PLAUSIBLE_DURATION_SECONDS,
  findOutlierSessionIds,
  workoutAverages,
} from '../src/lib/statisticsAverages.js';

const HOUR = 3600;
const MINUTE = 60;
const session = (id, durationSeconds) => ({ id, durationSeconds });
const working = (sessionId, volume) => ({ sessionId, setType: 'working', volume });
const ids = (sessions) => [...findOutlierSessionIds(sessions)].sort();

// The screenshot from #77: four workouts in the month, 69 h 18 min in total, 17 h 20 min "on average".
// Three of them are ordinary, the fourth is a timer that was never stopped.
const november = [session('a', 58 * MINUTE), session('b', 64 * MINUTE), session('c', 71 * MINUTE), session('forgotten', 66 * HOUR + 5 * MINUTE)];
assert.equal(november.reduce((sum, item) => sum + item.durationSeconds, 0), 69 * HOUR + 18 * MINUTE, 'fixture matches the reported total');
const novemberSets = [
  working('a', 400), working('a', 400), working('b', 300), working('b', 300), working('b', 300), working('c', 500),
  working('forgotten', 12),
  { sessionId: 'a', setType: 'warmup', volume: 0 },
];
const result = workoutAverages(november, novemberSets);
assert.equal(result.excluded, 1);
assert.equal(result.counted, 3);
assert.equal(result.duration, (58 + 64 + 71) * MINUTE / 3, 'average time ignores the forgotten timer');
assert.ok(result.duration < 2 * HOUR, 'the average is no longer 17 hours');
assert.equal(result.volume, 2200 / 3, 'tonnage is averaged over the same workouts');
assert.equal(result.sets, 6 / 3, 'working sets of the excluded workout and warm-ups are not counted');

// Longer than the hard limit is an outlier even when there is nothing to compare with.
assert.deepEqual(ids([session('only', MAX_PLAUSIBLE_DURATION_SECONDS + 1)]), ['only']);
assert.deepEqual(ids([session('x', HOUR), session('y', 30 * HOUR)]), ['y']);
assert.deepEqual(ids([session('x', MAX_PLAUSIBLE_DURATION_SECONDS)]), [], 'exactly the limit is still a workout');
const allForgotten = workoutAverages([session('only', 30 * HOUR)], [working('only', 100)]);
assert.deepEqual(allForgotten, { counted: 0, excluded: 1, duration: 0, volume: 0, sets: 0 }, 'no division by zero when nothing is left');

// Between two and four hours a workout is an outlier only against a clear norm of the period.
const short = [session('a', 40 * MINUTE), session('b', 45 * MINUTE), session('c', 50 * MINUTE)];
assert.deepEqual(ids([...short, session('long', 3 * HOUR)]), ['long'], '3 h against 45 min is a forgotten timer');
assert.deepEqual(ids([session('a', 40 * MINUTE), session('long', 3 * HOUR)]), [], 'two workouts give no norm');
assert.deepEqual(ids([session('a', 80 * MINUTE), session('b', 90 * MINUTE), session('c', 100 * MINUTE), session('long', 3 * HOUR)]), [], '3 h against 1.5 h is a long workout');
assert.deepEqual(ids([session('a', 20 * MINUTE), session('b', 20 * MINUTE), session('c', 20 * MINUTE), session('d', 110 * MINUTE)]), [], 'under two hours is never an outlier');

// Several forgotten timers must not become the norm themselves.
assert.deepEqual(ids([...short, session('f1', 20 * HOUR), session('f2', 22 * HOUR), session('f3', 25 * HOUR), session('long', 3 * HOUR)]), ['f1', 'f2', 'f3', 'long']);

// Ordinary periods are untouched: plain mean over every workout.
const ordinary = workoutAverages(short, [working('a', 100), working('b', 200)]);
assert.deepEqual(ordinary, { counted: 3, excluded: 0, duration: 45 * MINUTE, volume: 100, sets: 2 / 3 });
assert.deepEqual(workoutAverages([], []), { counted: 0, excluded: 0, duration: 0, volume: 0, sets: 0 });
assert.deepEqual(ids([session('a', 0), session('b', null), session('c', 'x')]), [], 'missing durations are not outliers');

// The screen takes every per-workout average from this module, in both places that show them.
const screen = fs.readFileSync(new URL('../src/components/StatisticsScreenV3.jsx', import.meta.url), 'utf8');
assert.match(screen, /import \{ workoutAverages \} from '\.\.\/lib\/statisticsAverages\.js'/);
assert.match(screen, /averages: workoutAverages\(filtered\.sessions, filtered\.sets\)/);
assert.doesNotMatch(screen, /metrics\.duration \/ |metrics\.volume \/ |metrics\.workingSets \/ /, 'no average is computed as total / count');
assert.match(screen, /formatDuration\(metrics\.averages\.duration\)/, 'favourites card uses the same average');
assert.match(screen, /excluded \? `\$\{counted\} из \$\{metrics\.workouts\} шт\.`/, 'the block says how many workouts were averaged');

console.log('Per-workout averages skip forgotten-timer outliers (#77)');
