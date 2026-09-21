import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');

const app = read('src/App.jsx');
const auth = read('src/components/AuthScreen.jsx');
const home = read('src/components/HomeScreen.jsx');
const nutrition = read('src/components/NutritionScreen.jsx');
const settings = read('src/components/SettingsScreen.jsx');
const statsCloud = read('src/lib/statisticsCloudSync.js');
const workoutV3 = read('src/components/WorkoutSessionScreenV3.jsx');
const workoutV4 = read('src/components/WorkoutSessionScreenV4.jsx');
const workoutSessions = read('src/lib/workoutSessions.js');
const programs = read('src/lib/programs.js');
const programControls = read('src/lib/programParticipation.js');
const scheduleControls = read('src/lib/scheduledWorkoutControls.js');
const lifecycleSql = read('supabase/schema/workout-session-lifecycle.sql');
const statusSql = read('supabase/schema/program-status-lifecycle.sql');
const statsSql = read('supabase/schema/statistics-cross-device-sync.sql');
const nutritionFavSql = read('supabase/schema/nutrition-favorites.sql');

// Auth/session recovery and logout reset.
assert.match(app, /supabase\.auth\.getSession\(\)/);
assert.match(app, /supabase\.auth\.onAuthStateChange/);
assert.match(app, /PASSWORD_RECOVERY/);
assert.match(auth, /signInWithPassword|signUp/);
assert.match(app, /setWorkoutScheduledId\(null\)/);

// Program lifecycle.
assert.match(programs, /create_program_with_schedule/);
assert.match(programs, /start_program/);
assert.match(programControls, /pause_program/);
assert.match(programControls, /resume_program/);
assert.match(statusSql, /active','paused','completed','cancelled/);

// Schedule recovery and future-start safeguards.
assert.match(home, /recoveryResponse[\s\S]*\.lt\('scheduled_date', dateKey\)/);
assert.match(home, /Перенести на сегодня/);
assert.match(scheduleControls, /reschedule_scheduled_workout_scoped/);
assert.match(lifecycleSql, /future/i);

// Workout persistence, pause/resume and history integrity.
assert.match(workoutV3, /workout-pause-button/);
assert.doesNotMatch(workoutV3, /Прервать тренировку/);
assert.doesNotMatch(workoutV4, /MutationObserver|onClickCapture/);
assert.match(workoutV4, /pause_workout/);
assert.match(workoutV4, /resume_workout/);
assert.match(workoutSessions, /\.eq\('status', 'completed'\)/);
assert.match(workoutSessions, /set_type !== 'working'/);
assert.match(lifecycleSql, /active_duration_seconds/);

// Reloading an active workout must not be treated as a normal back-navigation path.
assert.match(app, /if \(current === 'workout-session'\) return current/);

// Statistics cloud data must never merge a previous account's local cache into another account.
assert.match(statsCloud, /CACHE_OWNER_KEY/);
assert.match(statsCloud, /owner && owner !== userId/);
assert.match(statsCloud, /removeItem\(MEASUREMENTS_KEY\)/);
assert.match(statsCloud, /removeItem\(PHOTOS_KEY\)/);
assert.match(statsCloud, /removeItem\(FAVORITES_KEY\)/);
assert.match(statsCloud, /prepareAccountScopedCache\(userId\)/);
assert.match(statsSql, /user_statistics_measurements/);
assert.match(statsSql, /user_statistics_photos/);

// Nutrition persistence, filters and account-scoped favorites.
assert.match(nutrition, /nutrition_targets/);
assert.match(nutrition, /nutrition_favorites/);
assert.match(nutrition, /Приём пищи/);
assert.match(nutrition, /Ккал от/);
assert.match(nutrition, /Избранное/);
assert.match(nutritionFavSql, /auth\.uid\(\)/);

// Settings persistence and sign-out/account switching safety.
assert.match(settings, /user_app_settings/);
assert.match(settings, /weight_unit/);
assert.match(settings, /theme/);
assert.match(settings, /language/);
assert.match(app, /SIGNED_OUT/);
assert.match(app, /setProfile\(null\)/);
assert.match(app, /setNutritionPlan\(null\)/);

console.log('MVP product QA contracts passed.');
