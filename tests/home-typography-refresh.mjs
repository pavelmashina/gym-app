import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = path => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const home = read('src/components/HomeScreen.jsx');
const app = read('src/App.jsx');
const styles = read('src/styles.css');
const design = read('src/design-system.css');
const summary = read('src/home-summary.css');
const modal = read('src/home-schedule-edit.css');
const nav = read('src/bottom-navigation.css');

assert.match(design, /\.month\{font-size:20px!important;/);
assert.match(styles, /\.weekdays\s*\{\s*font-size: 10px;/);
assert.match(summary, /\.summary-col \.summary-label\s*\{[^}]*text-transform: none !important;/);
assert.match(summary, /\.summary-col\.workout > h3\s*\{[^}]*font-size: var\(--workout-title-size, var\(--text-h3\)\) !important;/);
assert.match(summary, /\.summary-col\.food > h3,\s*\.summary-col \.home-empty-copy h3\s*\{[^}]*font-size: var\(--text-h3\) !important;/);
assert.match(summary, /\.summary-col\.food \.food-stat span\s*\{[^}]*font-size: var\(--text-caption\) !important;/);
assert.match(summary, /\.summary-col\.food \.food-stat\s*\{[^}]*flex-direction: row;/);
assert.match(summary, /\.summary-col\.food \.food-stat\s*\{[^}]*white-space: nowrap;/);

assert.doesNotMatch(home, /formatExerciseCount/, 'Hide the standard exercise count');
assert.match(home, /\{recovery && <p>Плановая дата:/, 'Recovery still shows its original planned date');
assert.match(home, /const buttonLabel = workout.active \? 'Продолжить'/);
assert.match(home, /skipped \? 'Пропущена' : 'Начать'/);
assert.match(nav, /\.app-nav-label\s*\{[^}]*font-size: 10px;/);
assert.match(nav, /@media \(max-width: 370px\) \{[\s\S]*?\.app-nav-label \{ font-size: 10px; \}/);
assert.match(app, /\{showBottomNavigation && !menuOpen && <BottomNavigation/, 'Hide bottom navigation when drawer is open');

assert.match(modal, /\.home-schedule-head h2 \{[^}]*font-size:20px;/);
assert.match(modal, /\.home-schedule-workout strong \{[^}]*font-size:16px;/);
assert.match(modal, /\.home-schedule-option span \{[^}]*font-size:10px;/);
assert.match(modal, /\.home-schedule-error \{[^}]*font-size: 10px;/);
assert.doesNotMatch(home, /Раскладка дня|Изменение расписания|История тренировок/, 'No eyebrow text above edit sheet title');
assert.match(styles, /\.drawer-title\s*\{[^}]*font-size: 20px;/);
assert.match(styles, /\.drawer-link\s*\{[^}]*font-size: 16px;/);
const drawer = home.slice(home.indexOf('function Drawer('), home.indexOf('async function loadWorkoutCard('));
assert.doesNotMatch(drawer, /drawer-profile|Мой профиль|Дмитрий/, 'No profile information in the side menu');
console.log('Home typography, menu, schedule editor and bottom navigation contracts passed.');
