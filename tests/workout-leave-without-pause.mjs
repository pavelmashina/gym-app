// Issue #103: «Назад» on a running workout must offer a way out that does not pause it.
// Before, the only way out was «Поставить на паузу»; «Выйти без паузы» appeared only after a failed pause.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Windows checkouts get CRLF.
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const v4 = read('src/components/WorkoutSessionScreenV4.jsx');
const v3 = read('src/components/WorkoutSessionScreenV3.jsx');

// 1. «Назад» and the pause button of the screen open different questions.
assert.match(v4, /onBack=\{requestLeave\}/, '«Назад» asks how to leave');
assert.match(v4, /onPauseRequest=\{requestPause\}/, '«Поставить на паузу» still asks only about the pause');
assert.match(v4, /const requestLeave = \(\) => openInterrupt\(true\)/);
assert.match(v4, /const requestPause = \(\) => openInterrupt\(false\)/);
assert.match(v3, /entry\?\.mode === 'active' \? onBack : \(onExit \?\? onBack\)/, 'Only a running session asks on the way out');

// 2. The leave question always has all three ways on: stay, pause, leave without a pause.
const dialog = v4.slice(v4.indexOf('{pauseConfirmOpen &&'), v4.indexOf('{replacementTarget &&'));
const [leaveActions, pauseActions] = dialog.slice(dialog.indexOf('workout-interrupt-confirm-actions')).split(': <div className="workout-interrupt-confirm-actions">');
assert.ok(pauseActions, 'The dialog has separate actions for leaving and for pausing');
assert.match(dialog, /leaveAsked \? 'Выйти из тренировки\?' : 'Поставить тренировку на паузу\?'/);
assert.match(leaveActions, /Остаться в тренировке/);
assert.match(leaveActions, /onClick=\{pauseWorkout\}/);
assert.match(leaveActions, /<button className="primary" type="button" onClick=\{leaveWithoutPause\} disabled=\{pauseLoading\}>Выйти без паузы<\/button>/);
assert.doesNotMatch(leaveActions, /pauseFailed/, 'Leaving without a pause does not wait for a failed pause');

// 3. The pause question is as before: leaving without a pause is offered only when the pause failed.
assert.match(pauseActions, /Продолжить сейчас/);
assert.match(pauseActions, /\{pauseFailed && <button type="button" onClick=\{leaveWithoutPause\}/);

// 4. Leaving without a pause sends no pause request and keeps what was entered.
const leave = v4.slice(v4.indexOf('function leaveWithoutPause()'), v4.indexOf('async function resumeWorkout()'));
assert.ok(leave.length > 0, 'leaveWithoutPause exists');
assert.doesNotMatch(leave, /runWorkoutRpc|pause_workout/, 'The session stays active on the server');
assert.match(leave, /assertResultsSaved\(\)[\s\S]*setPauseError\(e\.message\); return;/, 'An unconfirmed results v2 row stops the exit instead of being lost');
assert.match(leave, /props\.onBack\?\.\(\)/);
// A typed weight or rep count is sent by its row when the screen unmounts.
assert.match(v3, /return \(\)=>\{unregister\(\);clearTimer\(\);if\(dirtyRef\.current\)onPersistDraft\(\)\.catch\(\(\)=>\{\}\);\};/);

// 5. The leave question is only its title and the three buttons: no caption above, no note below.
assert.match(dialog, /\{!leaveAsked && <span>Текущая тренировка<\/span>\}/, 'Only the pause question keeps its caption');
assert.match(dialog, /\{!leaveAsked && <p>/, 'Only the pause question keeps its note');
assert.equal(dialog.match(/<p>/g).length, 1);
assert.equal(dialog.match(/<span>/g).length, 1);

console.log('workout leave without pause: ok');
