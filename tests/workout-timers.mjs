import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  canShortenRest,
  clearRestTimer,
  clockSkewMs,
  createRestTimer,
  extendRestTimer,
  isRestEnding,
  msUntilNextSecond,
  REST_ENDING_SECONDS,
  readRestAutostart,
  readRestTimer,
  restRemainingSeconds,
  shortenRestTimer,
  shouldAlertRestEnd,
  workoutElapsedSeconds,
  writeRestAutostart,
  writeRestTimer,
} from '../src/lib/workoutTimers.js';

const store = new Map();
globalThis.localStorage = {
  getItem: (key) => store.get(key) ?? null,
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
};

const T0 = Date.parse('2026-11-06T10:00:00.000Z');

// The workout clock adds the segment since the last start to what was accumulated before a pause.
const session = { startedAt: new Date(T0).toISOString(), activeDurationSeconds: 600 };
assert.equal(workoutElapsedSeconds(session, T0), 600);
assert.equal(workoutElapsedSeconds(session, T0 + 61_900), 661);

// A phone clock behind the server still counts from zero instead of standing still.
assert.equal(workoutElapsedSeconds(session, T0 - 30_000), 600, 'Without a correction the display would stand still.');
const skew = clockSkewMs(T0, T0 - 30_000);
assert.equal(skew, 30_000);
assert.equal(workoutElapsedSeconds(session, T0 - 30_000 + 5_000, skew), 605);
assert.equal(clockSkewMs(T0, T0 + 5_000), 0, 'A session started in the past needs no correction.');

// Each tick lands just past the next displayed second, whatever the phase and even with jitter.
assert.equal(msUntilNextSecond(T0 + 15, T0), 1000, 'A tick on schedule keeps its phase.');
assert.equal(msUntilNextSecond(T0 + 900, T0), 115);
for (const jitter of [0, 3, 40, 400, 985]) {
  const tickAt = T0 + 5000 + jitter;
  const next = tickAt + msUntilNextSecond(tickAt, T0);
  assert.equal(Math.floor((next - T0) / 1000), 6, `Next tick after +${jitter} ms shows the next second, no skip and no stall.`);
}
assert.equal(msUntilNextSecond(T0 - 300, T0), 315, 'The anchor of a countdown is in the future.');
assert.equal(msUntilNextSecond(T0, Number.NaN), 1000, 'A bad anchor must not spin the loop with a zero delay.');

// Rest countdown.
const timer = createRestTimer({ sessionId: 's1', setId: 'set-1', exerciseName: 'Жим', seconds: 90, now: T0 });
assert.equal(restRemainingSeconds(timer, T0), 90);
assert.equal(restRemainingSeconds(timer, T0 + 500), 90);
assert.equal(restRemainingSeconds(timer, T0 + 89_500), 1);
assert.equal(restRemainingSeconds(timer, T0 + 90_000), 0);
assert.equal(restRemainingSeconds(timer, T0 + 600_000), 0);

// The bar turns red for the last 15 seconds (#63): from the moment the display shows 0:15 until 0:01.
assert.equal(REST_ENDING_SECONDS, 15);
const endingAt = (ms) => isRestEnding(restRemainingSeconds(timer, T0 + ms));
assert.equal(endingAt(0), false, 'A fresh rest is not ending.');
assert.equal(endingAt(74_999), false, 'At 0:16 the bar is still plain.');
assert.equal(endingAt(75_000), true, 'At 0:15 the bar turns red.');
assert.equal(endingAt(89_999), true, 'At 0:01 the bar is still red.');
assert.equal(endingAt(90_000), false, 'A finished rest has its own look, not the red bar.');
assert.equal(isRestEnding(restRemainingSeconds(extendRestTimer(timer, 30, T0 + 80_000), T0 + 80_000)), false, '+30 sec takes the rest out of its last seconds.');

// +30 sec works while running and also long after the end.
const extended = extendRestTimer(timer, 30, T0 + 45_000);
assert.equal(restRemainingSeconds(extended, T0 + 45_000), 75);
assert.equal(extended.duration, 120);
const late = T0 + 400_000;
const revived = extendRestTimer(timer, 30, late);
assert.equal(restRemainingSeconds(revived, late), 30, 'A past end plus 30 seconds would still be over.');
assert.equal(revived.duration, 30);
assert.equal(revived.id, timer.id);

// −30 sec (#105) takes 30 seconds off a running rest and leaves it running.
const shortened = shortenRestTimer(timer, 30, T0 + 20_000);
assert.equal(restRemainingSeconds(shortened, T0 + 20_000), 40);
assert.equal(shortened.duration, 60);
assert.equal(shortened.id, timer.id);
assert.deepEqual(extendRestTimer(shortened, 30, T0 + 21_000), timer, '+30 sec undoes a mistaken −30 sec.');
assert.equal(isRestEnding(restRemainingSeconds(shortenRestTimer(timer, 30, T0 + 50_000), T0 + 50_000)), true, '−30 sec can bring the rest into its last seconds.');
// It never ends the rest: with 30 seconds or less on the display it changes nothing, and the button is disabled.
assert.equal(canShortenRest(31, 30), true);
assert.equal(canShortenRest(30, 30), false);
assert.equal(canShortenRest(0, 30), false);
assert.equal(restRemainingSeconds(shortenRestTimer(timer, 30, T0 + 59_000), T0 + 59_000), 1, 'At 0:31 the rest goes down to 0:01.');
assert.equal(shortenRestTimer(timer, 30, T0 + 60_000), timer, 'At 0:30 nothing changes.');
assert.equal(shortenRestTimer(timer, 30, T0 + 400_000), timer, 'A finished rest is not shortened.');

// The end signal fires when the rest really ends, not on a return long afterwards.
assert.equal(shouldAlertRestEnd(timer, T0 + 89_000), false);
assert.equal(shouldAlertRestEnd(timer, T0 + 90_020), true);
assert.equal(shouldAlertRestEnd(timer, T0 + 300_000), false);

// The stored timer survives a remount or reload and belongs to one session only.
assert.equal(readRestTimer('s1', T0), null);
writeRestTimer(timer);
assert.deepEqual(readRestTimer('s1', T0 + 10_000), timer);
assert.equal(readRestTimer('other-session', T0 + 10_000), null);
assert.deepEqual(readRestTimer('s1', T0 + 90_000 + 60_000), timer, 'A rest that just ended is still shown as finished.');
assert.equal(readRestTimer('s1', T0 + 90_000 + 6 * 60_000), null, 'An old finished rest is not brought back.');
clearRestTimer();
assert.equal(readRestTimer('s1', T0), null);
store.set('gym-rest-timer-v1', '{broken');
assert.equal(readRestTimer('s1', T0), null, 'A damaged record is ignored.');
store.set('gym-rest-timer-v1', JSON.stringify({ sessionId: 's1', endsAt: 'soon' }));
assert.equal(readRestTimer('s1', T0), null, 'An incomplete record is ignored.');

// Turned off stays off.
assert.equal(readRestAutostart(), true, 'On by default, as before.');
writeRestAutostart(false);
assert.equal(readRestAutostart(), false);
writeRestAutostart(true);
assert.equal(readRestAutostart(), true);

// Storage that throws (private mode, full quota) must not break the workout screen.
const realStorage = globalThis.localStorage;
globalThis.localStorage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); }, removeItem() { throw new Error('denied'); } };
assert.equal(readRestTimer('s1', T0), null);
assert.equal(readRestAutostart(), true);
writeRestTimer(timer);
writeRestAutostart(false);
clearRestTimer();
globalThis.localStorage = realStorage;

// The screen wires these together.
const between = (source, from, to) => source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from)));
const v3 = fs.readFileSync('src/components/WorkoutSessionScreenV3.jsx', 'utf8');
const v4 = fs.readFileSync('src/components/WorkoutSessionScreenV4.jsx', 'utf8');
const lib = fs.readFileSync('src/lib/workoutSessions.js', 'utf8');
const active = between(v3, 'function ActiveWorkout(', 'function CompletedWorkout(');
const dock = between(v3, 'function RestTimerDock(', 'function LegacySetRow(');
// Up to the end of the scrolling content, which also holds «Добавить упражнение» (#61).
const list = between(active, 'className="workout-execution-list"', '</main>');
const footer = between(active, '<footer className="workout-session-footer', '</footer>');

for (const label of ['Запустить', 'Выключить', 'Включить']) assert.match(dock, new RegExp(label), `${label} is on the dock.`);
const countdown = between(v3, 'function RestCountdown(', 'function RestTimerDock(');
assert.match(countdown, /Остановить/);
// «−30 сек» stands before «+30 сек» (#105).
assert.match(countdown, /<button type="button" onClick=\{\(\) => onShorten\(REST_STEP_SECONDS\)\} disabled=\{!canShortenRest\(remaining, REST_STEP_SECONDS\)\}>−30 сек<\/button><button type="button" onClick=\{\(\) => onAdd\(REST_STEP_SECONDS\)\}>\+30 сек<\/button>/);
assert.match(v3, /const REST_STEP_SECONDS = 30;/);
// Stopping is a cross at the right end of the row, named for screen readers; no text button (#105).
assert.match(countdown, /\+30 сек<\/button><button className="rest-countdown-stop" type="button" aria-label=\{remaining === 0 \? 'Закрыть таймер' : 'Остановить отдых'\} onClick=\{onStop\}><CloseIcon \/><\/button><\/div>/);
assert.equal(countdown.match(/<button /g).length, 3, 'Three buttons on the running countdown.');
// Turning the timer off is not next to stopping it: it stays on the idle dock only (#105).
assert.doesNotMatch(countdown, /Выключить|onTurnOff|canTurnOff/);
assert.doesNotMatch(dock, /onTurnOff|canTurnOff/);
assert.match(dock, /onShorten=\{onShorten\}/);
assert.match(active, /onShorten=\{\(seconds\) => setRestTimer\(\(current\) => current && shortenRestTimer\(current, seconds, Date\.now\(\)\)\)\}/);
assert.match(between(v3, 'function RestCountdown(', 'function RestTimerDock('), /className=\{`rest-countdown\$\{remaining === 0 \? ' finished' : isRestEnding\(remaining\) \? ' ending' : ''\}`\}/, 'The countdown marks its last 15 seconds.');
assert.match(footer, /<RestTimerDock /, 'The controls stay reachable wherever the list is scrolled.');
assert.doesNotMatch(list, /RestCountdown|RestTimerDock/, 'A timer inside the list moves the cards when it appears.');
assert.equal(active.match(/<RestTimerDock /g).length, 1, 'One timer on the screen.');
assert.match(active, /if \(restAutostart\) setRestTimer\(createRestTimer/, 'A set starts the rest only while the timer is on.');
assert.match(active, /if \(!enabled\) setRestTimer\(null\)/, 'Turning the timer off also stops the running countdown.');
assert.match(active, /useState\(\(\) => readRestTimer\(session\.id, Date\.now\(\)\)\)/);
assert.match(active, /if \(restTimer\) writeRestTimer\(restTimer\); else clearRestTimer\(\)/);
assert.match(active, /if \(state\.paused\) \{ onSessionPaused\?\.\(\); return; \}/, 'A session paused elsewhere does not keep ticking here.');
assert.match(v4, /if \(lifecycle\.paused\) clearRestTimer\(\)/, 'A rest from before the pause does not come back after it.');
assert.match(lib, /select\('status, paused_at, started_at, active_duration_seconds'\)/);

// At 320px a second row of timer buttons made the footer cover the end of the list.
const activeCss = fs.readFileSync('src/workout-session-active-v3.css', 'utf8');
const sessionCss = fs.readFileSync('src/workout-session.css', 'utf8');
assert.doesNotMatch(activeCss.match(/\.rest-countdown-actions \{[^}]*\}/)[0], /flex-wrap/);
// The two time buttons are compact and do not stretch (#105).
assert.match(activeCss, /\.rest-countdown-actions button \{ flex:0 0 auto; min-width:72px; padding:0 12px;/);
// The cross is red, keeps a fixed 44px and stands at the right end of the row, away from the time buttons (#105).
assert.match(activeCss, /\.workout-session-footer \.rest-countdown-actions \.rest-countdown-stop \{ flex:0 0 44px; min-width:44px; margin-left:auto; padding:0; display:grid; place-items:center; color:var\(--workout-rest-ending\); \}/);
assert.match(sessionCss, /\.workout-session-content\.active \{ padding-bottom: calc\(128px \+ env\(safe-area-inset-bottom\)\); \}/);

// In the last 15 seconds only the bar turns red (#63): the plate, the digits and the buttons keep their colours.
const endingRules = [...activeCss.matchAll(/([^{}]*\.rest-countdown\.ending[^{}]*)\{([^}]*)\}/g)];
assert.equal(endingRules.length, 1, 'One rule for the last seconds.');
assert.equal(endingRules[0][1].trim().split(/\s+/).pop(), 'span', 'It colours the bar only.');
assert.match(endingRules[0][1], /\.rest-countdown\.ending \.rest-countdown-track span\s*$/);
assert.match(endingRules[0][2], /background:var\(--workout-rest-ending\)/);

console.log('Workout timer tests passed.');
