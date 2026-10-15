import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(p,'utf8');

const app=read('src/App.jsx');
const nav=read('src/components/BottomNavigation.jsx');
const navCss=read('src/bottom-navigation.css');
const home=read('src/components/HomeScreen.jsx');
const training=read('src/components/ExercisesScreen.jsx');
const statistics=read('src/components/StatisticsScreenV3.jsx');
const nutrition=read('src/components/NutritionScreen.jsx');
const sportpit=read('src/components/SportPitScreen.jsx');
const workout=read('src/components/WorkoutSessionScreenV3.jsx');
const resultSet=read('src/components/ResultSetV2.jsx');
const standalone=read('src/components/StandaloneWorkoutLauncher.jsx');
const standaloneCss=read('src/standalone-workout.css');

// One shared bottom navigation, fixed 5-column geometry, centralized active route.
assert.match(app,/BottomNavigation/);
assert.match(app,/activeScreen=\{activeScreen\}/);
assert.match(nav,/id: 'training'/);
assert.match(nav,/id: 'statistics'/);
assert.match(nav,/id: 'home'/);
assert.match(nav,/id: 'nutrition'/);
assert.match(nav,/id: 'sportpit'/);
assert.match(nav,/aria-current=\{active \? 'page'/);
assert.match(navCss,/grid-template-columns:\s*repeat\(5/);
assert.match(navCss,/position:\s*fixed/);
assert.match(navCss,/\.app-nav-item\.home \.app-nav-icon[\s\S]*width:\s*60px[\s\S]*height:\s*60px[\s\S]*margin-top:\s*-22px/);
assert.match(navCss,/\.app-nav-item\.home\.active \.app-nav-icon[\s\S]*background:\s*var\(--ink\)/);
assert.match(navCss,/\.app-nav-item\.home \.app-nav-icon[\s\S]*border:\s*2px solid var\(--ink\)/);
assert.doesNotMatch(home,/function BottomNav\(/);
assert.doesNotMatch(training,/function TrainingBottomNav\(/);
assert.doesNotMatch(statistics,/function StatisticsBottomNav\(/);
assert.doesNotMatch(nutrition,/function NutritionBottomNav\(/);
assert.doesNotMatch(sportpit,/function SportPitBottomNav\(/);

// Execution settings belong to the exercise block, not each set.
assert.match(workout,/exercise-execution-settings/);
assert.match(workout,/executionSettings\[exercise\.id\]/);
assert.match(workout,/EXECUTION_SETTINGS_STORAGE_PREFIX/);
assert.match(workout,/configurationKeyValue=\{configurationKey\(execution\.configuration\)\}/);
assert.match(workout,/equipmentInstanceId=\{execution\.equipmentInstanceId\}/);
assert.doesNotMatch(resultSet,/ExerciseConfigurationEditor/);
assert.doesNotMatch(resultSet,/EquipmentInstancePicker/);
assert.match(resultSet,/result-set-v2 compact/);
assert.match(resultSet,/if\(!set\.resultV2\)\{result\.configuration_key=configurationKeyValue/);

// Standalone launcher is a compact one-line action without explanatory copy.
assert.match(standalone,/standalone-workout-trigger/);
assert.match(standalone,/>Разовая тренировка</);
assert.doesNotMatch(standalone,/С нуля, вне программы|Результаты попадут в статистику/);
assert.match(standaloneCss,/min-height:\s*40px/);
assert.doesNotMatch(standaloneCss,/standalone-workout-card/);

console.log('Workout UI and navigation contracts passed.');
