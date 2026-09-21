import assert from 'node:assert/strict';
import fs from 'node:fs';
import { formatExerciseCount, formatRussianCount } from '../src/lib/formatRussianCount.js';

const read = (path) => fs.readFileSync(path, 'utf8');

const app = read('src/App.jsx');
const home = read('src/components/HomeScreen.jsx');
const nutrition = read('src/components/NutritionScreen.jsx');
const workoutV3 = read('src/components/WorkoutSessionScreenV3.jsx');
const workoutV4 = read('src/components/WorkoutSessionScreenV4.jsx');
const workoutSessions = read('src/lib/workoutSessions.js');
const settings = read('src/components/SettingsScreen.jsx');

assert.equal(formatExerciseCount(1), '1 упражнение');
assert.equal(formatExerciseCount(2), '2 упражнения');
assert.equal(formatExerciseCount(5), '5 упражнений');
assert.equal(formatExerciseCount(11), '11 упражнений');
assert.equal(formatExerciseCount(21), '21 упражнение');
assert.equal(formatRussianCount(22, ['тренировка', 'тренировки', 'тренировок']), '22 тренировки');

assert.match(home, /formatExerciseCount\(workout\.exerciseCount\)/);
assert.doesNotMatch(app, /completion:\s*0/);

assert.doesNotMatch(workoutV3, /Прервать тренировку/);
assert.doesNotMatch(workoutV3, /onAbandon=/);
assert.doesNotMatch(workoutV3, /abandonWorkout/);
assert.match(workoutV3, /workout-pause-button/);
assert.match(workoutV3, /onPauseRequest/);
assert.doesNotMatch(workoutV4, /MutationObserver/);
assert.doesNotMatch(workoutV4, /onClickCapture/);
assert.match(workoutV4, /onPauseRequest=\{requestPause\}/);
assert.match(workoutV4, /onBack=\{requestPause\}/);

assert.doesNotMatch(app, /if \(current === 'workout-session'\) \{[\s\S]{0,180}setWorkoutScheduledId\(null\)/);
assert.match(app, /if \(current === 'workout-session'\) return current/);

assert.match(nutrition, /Избранное/);
assert.match(nutrition, /Приём пищи/);
assert.match(nutrition, /Цель/);

assert.match(settings, /kg/);
assert.match(settings, /lb/);
assert.match(settings, /theme/);
assert.match(settings, /language/);

assert.match(workoutSessions, /\.eq\('status', 'completed'\)/);
assert.match(workoutSessions, /set_type !== 'working'/);

console.log('MVP core contract tests passed.');
