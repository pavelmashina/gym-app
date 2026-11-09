import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');

const home=read('src/components/HomeScreen.jsx');
const sportpit=read('src/components/SportPitScreen.jsx');
const navCss=read('src/bottom-navigation.css');
const audit=read('src/ui-layout-audit.css');
const main=read('src/main.jsx');

const calendarIndex=home.indexOf('<CalendarCard');
const standaloneIndex=home.indexOf('<StandaloneWorkoutLauncher');
const summaryIndex=home.indexOf('<DailySummary');
assert.ok(calendarIndex >= 0 && standaloneIndex > calendarIndex && summaryIndex > standaloneIndex,
  'Standalone workout action must sit directly after the calendar and before daily summary.');

assert.doesNotMatch(sportpit,/SportPitBottomNav/);
assert.match(sportpit,/sportpit-state error/);
assert.match(sportpit,/setError\('Не удалось загрузить каталог\.'\)/);

assert.match(navCss,/\.app-nav-item\.active \.app-nav-icon/);
assert.doesNotMatch(navCss,/\.app-nav-item\.home|margin-top:\s*-22px/);

assert.match(main,/ui-layout-audit\.css/);
assert.match(audit,/\.program-detail-day,[\s\S]*\.program-schedule-day/);
assert.match(audit,/white-space:\s*normal/);
assert.match(audit,/overflow-wrap:\s*anywhere/);
assert.match(audit,/\.statistics-photo-date-head[\s\S]*flex-wrap:\s*wrap/);
assert.match(audit,/\.summary-col\.workout[\s\S]*padding-bottom:\s*68px/);
assert.match(audit,/@media \(max-width: 370px\)[\s\S]*\.summary[\s\S]*grid-template-columns:\s*1fr/);
assert.doesNotMatch(audit,/overflow:\s*hidden/);

console.log('Full UI audit contracts passed.');
