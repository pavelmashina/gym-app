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
assert.ok(nav.indexOf("id: 'home'") < nav.indexOf("id: 'training'"), 'Home appears first');
assert.ok(nav.indexOf("id: 'training'") < nav.indexOf("id: 'statistics'"), 'Statistics follows Training');
assert.ok(nav.indexOf("id: 'statistics'") < nav.indexOf("id: 'nutrition'"), 'Nutrition follows Statistics');
assert.ok(nav.indexOf("id: 'nutrition'") < nav.indexOf("id: 'sportpit'"), 'SportPit is last');
assert.doesNotMatch(nav,/home \? ' home'/);
assert.doesNotMatch(navCss,/\.app-nav-item\.home|margin-top:\s*-22px|border:\s*2px solid var\(--ink\)/);
assert.match(navCss,/\.app-nav-item\.active \.app-nav-icon/);
const navigationPolish = read('src/november-card-navigation-refinements.css');
assert.match(navigationPolish,/\.app-nav-item\.active::before/);
assert.match(navigationPolish,/\.app-bottom-nav \.app-nav-item\.active::before \{[\s\S]*?inset: 6px 4px;/);
assert.match(navigationPolish,/radial-gradient\(ellipse 62% 60% at center,[\s\S]*?color-mix\(in srgb, var\(--accent-soft\) 90%, var\(--ink\) 10%\)[\s\S]*?transparent 100%\)/);
assert.match(navigationPolish,/\.app-bottom-nav \.app-nav-item\.active \{[\s\S]*?isolation: isolate;/);
assert.doesNotMatch(navigationPolish,/\.app-nav-item\.active:not\(\.home\)/);
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
