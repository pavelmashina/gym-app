// Clock arithmetic and stored state of the timers on the active workout screen.
// A rest countdown is defined only by its end time, so a page that was suspended
// or reloaded shows the right value instead of continuing from where it stopped.

const REST_TIMER_STORAGE_KEY = 'gym-rest-timer-v1';
const REST_AUTOSTART_STORAGE_KEY = 'gym-rest-autostart-v1';
const TICK_MARGIN_MS = 15;
const FINISHED_REST_KEEP_MS = 5 * 60_000;
const REST_ALERT_WINDOW_MS = 5_000;

export function msUntilNextSecond(now, anchorMs) {
  if (!Number.isFinite(anchorMs)) return 1000;
  const intoSecond = (((now - anchorMs) % 1000) + 1000) % 1000;
  return 1000 - intoSecond + TICK_MARGIN_MS;
}

// Only a phone clock behind the server can be detected: the session then seems to start in the future.
export function clockSkewMs(startedAtMs, now) {
  return Math.max(0, startedAtMs - now);
}

export function workoutElapsedSeconds(session, now, skewMs = 0) {
  return Number(session.activeDurationSeconds || 0) + Math.max(0, Math.floor((now + skewMs - new Date(session.startedAt).getTime()) / 1000));
}

export function createRestTimer({ sessionId, setId = null, exerciseName = '', seconds, now }) {
  return { id: `${setId ?? 'manual'}:${now}`, sessionId, setId, exerciseName, duration: seconds, endsAt: now + seconds * 1000 };
}

export function extendRestTimer(timer, seconds, now) {
  const running = timer.endsAt > now;
  // After the end, extra time counts from now: added to a past end it could still be over.
  return { ...timer, duration: running ? timer.duration + seconds : seconds, endsAt: (running ? timer.endsAt : now) + seconds * 1000 };
}

// «−30 сек» (#105) only shortens a rest that stays running afterwards: ending it is what the stop cross is for.
export function canShortenRest(remainingSeconds, seconds) {
  return remainingSeconds > seconds;
}

export function shortenRestTimer(timer, seconds, now) {
  if (!canShortenRest(restRemainingSeconds(timer, now), seconds)) return timer;
  // The duration shrinks with the end time, as it grows in extendRestTimer: «+30 сек» then undoes a mistaken tap exactly.
  return { ...timer, duration: timer.duration - seconds, endsAt: timer.endsAt - seconds * 1000 };
}

export function restRemainingSeconds(timer, now) {
  return Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
}

// The last seconds of a rest, from 0:15 on the display down to 0:01: time to walk back to the machine.
export const REST_ENDING_SECONDS = 15;

export function isRestEnding(remainingSeconds) {
  return remainingSeconds > 0 && remainingSeconds <= REST_ENDING_SECONDS;
}

// A rest that ended while the page was suspended is not news: a buzz on return would come out of nowhere.
export function shouldAlertRestEnd(timer, now) {
  return now >= timer.endsAt && now - timer.endsAt <= REST_ALERT_WINDOW_MS;
}

export function readRestTimer(sessionId, now) {
  try {
    const stored = JSON.parse(localStorage.getItem(REST_TIMER_STORAGE_KEY) ?? 'null');
    if (!stored || stored.sessionId !== sessionId || !Number.isFinite(stored.endsAt) || !Number.isFinite(stored.duration)) return null;
    return now - stored.endsAt > FINISHED_REST_KEEP_MS ? null : stored;
  } catch { return null; }
}

export function writeRestTimer(timer) {
  try { localStorage.setItem(REST_TIMER_STORAGE_KEY, JSON.stringify(timer)); } catch {}
}

export function clearRestTimer() {
  try { localStorage.removeItem(REST_TIMER_STORAGE_KEY); } catch {}
}

export function readRestAutostart() {
  try { return localStorage.getItem(REST_AUTOSTART_STORAGE_KEY) !== 'off'; } catch { return true; }
}

export function writeRestAutostart(enabled) {
  try { localStorage.setItem(REST_AUTOSTART_STORAGE_KEY, enabled ? 'on' : 'off'); } catch {}
}
