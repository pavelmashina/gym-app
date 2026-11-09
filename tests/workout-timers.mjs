import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  clearRestTimer,
  clockSkewMs,
  createRestTimer,
  extendRestTimer,
  msUntilNextSecond,
  readRestAutostart,
  readRestTimer,
  restRemainingSeconds,
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

// +30 sec works while running and also long after the end.
const extended = extendRestTimer(timer, 30, T0 + 45_000);
assert.equal(restRemainingSeconds(extended, T0 + 45_000), 75);
assert.equal(extended.duration, 120);
const late = T0 + 400_000;
const revived = extendRestTimer(timer, 30, late);
assert.equal(restRemainingSeconds(revived, late), 30, 'A past end plus 30 seconds would still be over.');
assert.equal(revived.duration, 30);
assert.equal(revived.id, timer.id);

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
assert.match(between(v3, 'function RestCountdown(', 'function RestTimerDock('), /Остановить/);
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
assert.match(activeCss, /\.rest-countdown-actions button \{ flex:1 1 auto; padding:0 6px;/);
assert.match(sessionCss, /\.workout-session-content\.active \{ padding-bottom: calc\(128px \+ env\(safe-area-inset-bottom\)\); \}/);

console.log('Workout timer tests passed.');
