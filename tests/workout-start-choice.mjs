// #66: a workout that has not started offers «К тренировке», then «Начать» or «Отметить выполненной».
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const choice = read('src/components/WorkoutStartChoice.jsx');
const v5 = read('src/components/WorkoutSessionScreenV5.jsx');
const v3 = read('src/components/WorkoutSessionScreenV3.jsx');
const sessions = read('src/lib/workoutSessions.js');
const css = read('src/workout-start-choice.css');
const docs = read('docs/design-system.md');
const mock = read('tests/ui/workout-mock-services.js');

// --- The footer button leads to the choice instead of starting at once ---
const sources = fs.readdirSync('src/components').map((name) => read(`src/components/${name}`)).join('\n');
assert.doesNotMatch(sources, /Начать тренировку/, 'No screen starts a planned workout straight from «Начать тренировку»');
assert.match(choice, /<footer className="workout-session-footer"><button type="button" onClick=\{open\} disabled=\{busy\}>\{starting \? 'Начинаем…' : 'К тренировке'\}<\/button><\/footer>/);
assert.match(choice, /className="workout-modal-shell workout-start-choice" role="dialog" aria-modal="true"/, 'The choice is the shared bottom sheet of the workout');
assert.match(choice, /<button className="primary" type="button" disabled=\{busy\} onClick=\{start\}><strong>\{starting \? 'Начинаем…' : 'Начать'\}<\/strong>/);
assert.match(choice, /onClick=\{\(\) => goTo\('complete'\)\}><strong>Отметить выполненной<\/strong><span>Без таймера и без отметки подходов\.<\/span>/);

// --- Both not-started screens use it: the first one and the one after «move to today» ---
for (const [name, screen] of [['V5', v5], ['V3', v3]]) {
  assert.match(screen, /import \{ WorkoutStartChoice \} from '\.\/WorkoutStartChoice\.jsx';/, `${name} imports the choice`);
  assert.match(screen, /<WorkoutStartChoice workout=\{workout\} starting=\{starting\} onStart=\{onStart\} onMarkedCompleted=\{onMarkedCompleted\} \/>/, `${name} renders it in the footer`);
}
assert.match(v5, /onMarkedCompleted=\{\(completed\) => \{ setLoadedEntry\(completed\); setDelegate\(true\); \}\}/, 'A workout marked done opens its saved result');
assert.match(v3, /onMarkedCompleted=\{setEntry\}/, 'A workout marked done opens its saved result');
assert.match(v5, /Перейти к текущей тренировке/, 'A refused start still links to the other active workout');

// --- Marking done: a date no later than today, and no double or lost save ---
assert.match(choice, /workout\.scheduledDate && workout\.scheduledDate <= today \? workout\.scheduledDate : today/, 'An overdue workout defaults to its own date');
assert.match(choice, /<input type="date" value=\{completionDate\} max=\{today\}/);
assert.match(choice, /if \(busy \|\| !completionDate \|\| completionDate > today\) return;/, 'Rapid taps send one request');
assert.match(choice, /markScheduledWorkoutCompleted\(workout\.id, completionDate\)/);
assert.match(choice, /requestError\?\.code \? null : await getWorkoutEntry\(workout\.id\)[\s\S]*latest\?\.mode === 'completed'\) onMarkedCompleted\(latest\)/,
  'A save whose answer was lost is recognised instead of reported as a failure');
assert.match(choice, /disabled=\{saving \|\| !completionDate \|\| completionDate > today\}/);
assert.match(choice, /<button type="button" disabled=\{saving\} onClick=\{\(\) => goTo\('choice'\)\}>Назад<\/button>/);

// --- The server's refusals reach the user in Russian, with a deadline on the request ---
const mark = sessions.slice(sessions.indexOf('const MARK_COMPLETED_REFUSALS'), sessions.indexOf('export async function changeCompletedWorkoutDate'));
assert.match(mark, /await settled\(supabase\.rpc\('mark_scheduled_workout_completed'/);
assert.match(mark, /\['Another workout is already active', 'У вас уже есть другая активная тренировка\. Сначала завершите её\.', 'another-active'\]/);
for (const serverText of ['already completed', 'Skipped or cancelled', 'Future workout', 'cannot be in the future', 'Program is not active']) {
  assert.ok(mark.includes(`['${serverText}', '`), `«${serverText}» is translated`);
}
assert.match(mark, /describeRequestError\(error,'Не удалось отметить тренировку выполненной\.'\)/);
assert.doesNotMatch(mark, /new Error\(error\?\.message/, 'Raw server text is never shown');

// --- Styles: theme tokens and the six type sizes only ---
assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, 'Colours come from the tokens the dark theme redefines');
for (const token of css.match(/var\(--[a-z0-9-]+\)/g)) {
  assert.match(token, /--(bg|surface|surface-2|ink|muted|line|gym-type-(xs|s|m|l)|lh-(caption|body|h2|h3)|weight-(medium|semibold|bold)|space-[1-4]|radius-md|control-h)\)/, `${token} is a shared token`);
}
assert.doesNotMatch(css, /font-size:\s*\d/, 'Font sizes use the --gym-type tokens');
assert.match(css, /\.workout-start-choice \.workout-modal-head > div > span \{[^}]*text-transform: none;/, 'No automatic uppercase in the sheet');
assert.match(css, /\.workout-start-date input \{[^}]*font-size: var\(--gym-type-m\);/, '16px keeps iOS from zooming into the date field');
assert.match(choice, /import '\.\.\/workout-start-choice\.css';/);

// --- The stand and the design notes know about it ---
assert.match(mock, /export async function markScheduledWorkoutCompleted\(scheduledWorkoutId, date\)/);
assert.match(mock, /params\.get\('planned'\) === '1'/);
assert.match(docs, /## Starting or marking a workout done — November 2026 \(#66\)/);

console.log('Workout start choice tests passed.');
