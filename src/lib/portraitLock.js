// The app stays upright when the phone is turned on its side (#102).
//
// An installed Android app is held upright by the system: the manifest asks for "portrait" and
// `screen.orientation.lock` is tried here as well. An iPhone gives a web app neither, so there the
// page still turns. When that happens <html data-portrait-lock> gets the quarter turn ("90" or
// "270") and `portrait-lock.css` turns <body> back by it, so the app is drawn exactly as before.
//
// The turned <body> is as wide as the screen is high. Everything the stylesheets say about the
// screen (vh/vw units, width and height media queries) is therefore about the wrong side while the
// lock is on, and is re-pointed in the loaded stylesheets for that time, then put back.
// Touch coordinates stay those of the turned page: gestures read them through `appPoint`/`appBox`.

const PHONE_SHORT_SIDE = 600;
const STYLE_RULE = 1;
const MEDIA_RULE = 4;
const OWN_RULE = '[data-portrait-lock';

// 90: the top of the phone points left (turned counter-clockwise), 270: right, 0: not on its side.
export function landscapeTurn(win) {
  // `window.orientation` means the same on iOS and Android; `screen.orientation` is the fallback.
  const angle = typeof win.orientation === 'number' ? win.orientation : win.screen?.orientation?.angle;
  if (angle === 90) return 90;
  if (angle === -90 || angle === 270) return 270;
  return 0;
}

export function isPhone(win) {
  const shortSide = Math.min(Number(win.screen?.width) || 0, Number(win.screen?.height) || 0);
  return shortSide > 0 && shortSide < PHONE_SHORT_SIDE && (win.navigator?.maxTouchPoints ?? 0) > 0;
}

// The quarter turn to undo, or 0 when the page is upright: a tablet or a computer, a phone held
// upright, or a phone on its side whose system kept the page upright.
export function portraitLockTurn(win) {
  if (!isPhone(win) || !(win.innerWidth > win.innerHeight)) return 0;
  return landscapeTurn(win);
}

// `88dvh` -> `calc(88 * var(--portrait-lock-vh))`: the height and width of the turned app.
// No lookbehind here: Safari before 16.4 fails to parse a script that has one.
const VIEWPORT_LENGTH = /(^|[\s(,:*/])(-?\d*\.?\d+)[dsl]?v([hw])\b/g;
export function turnViewportUnits(cssText) {
  return cssText.replace(VIEWPORT_LENGTH, (match, before, amount, axis) => `${before}calc(${amount} * var(--portrait-lock-v${axis}))`);
}

// `(max-width: 370px)` -> `(max-height: 370px)`: the app is as wide as the turned screen is high.
const MEDIA_AXIS = /\b(width|height)\b/g;
export function turnMediaQuery(mediaText) {
  return mediaText.replace(MEDIA_AXIS, (axis) => (axis === 'width' ? 'height' : 'width'));
}

// A point of the turned page in the coordinates of the app. `frame` is the box of <body> on the page.
export function turnPoint(turn, frame, x, y) {
  if (turn === 90) return { x: frame.bottom - y, y: x - frame.left };
  if (turn === 270) return { x: y - frame.top, y: frame.right - x };
  return { x, y };
}

function activeTurn() {
  return Number(document.documentElement.dataset.portraitLock) || 0;
}

// Where a touch or pointer is, the way the user sees the app: x to the right, y down.
export function appPoint(point) {
  const turn = activeTurn();
  if (!turn) return { x: point.clientX, y: point.clientY };
  return turnPoint(turn, document.body.getBoundingClientRect(), point.clientX, point.clientY);
}

// `getBoundingClientRect` the way the user sees the app.
export function appBox(element) {
  const box = element.getBoundingClientRect();
  const turn = activeTurn();
  if (!turn) return box;
  const frame = document.body.getBoundingClientRect();
  const a = turnPoint(turn, frame, box.left, box.top);
  const b = turnPoint(turn, frame, box.right, box.bottom);
  const left = Math.min(a.x, b.x);
  const top = Math.min(a.y, b.y);
  const right = Math.max(a.x, b.x);
  const bottom = Math.max(a.y, b.y);
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

// The height of the screen the way the user sees the app.
export function appHeight() {
  return activeTurn() ? appBox(document.body).height : window.innerHeight;
}

const turnedStyles = new Map();
const turnedMedia = new Map();
let turnedSheetCount = -1;

function turnRules(rules) {
  for (const rule of rules) {
    if (rule.type === STYLE_RULE) {
      // The lock's own rules describe the turned screen itself and must keep their units.
      if (!turnedStyles.has(rule) && !rule.selectorText.includes(OWN_RULE)) {
        const original = rule.style.cssText;
        const turned = turnViewportUnits(original);
        if (turned !== original) {
          turnedStyles.set(rule, original);
          rule.style.cssText = turned;
        }
      }
    } else if (rule.type === MEDIA_RULE && !turnedMedia.has(rule)) {
      const original = rule.media.mediaText;
      const turned = turnMediaQuery(original);
      if (turned !== original) {
        turnedMedia.set(rule, original);
        rule.media.mediaText = turned;
      }
    }
    if (rule.cssRules?.length) turnRules(rule.cssRules);
  }
}

function turnStylesheets() {
  if (turnedSheetCount === document.styleSheets.length) return;
  turnedSheetCount = document.styleSheets.length;
  for (const sheet of document.styleSheets) {
    // A stylesheet from another site (the font) keeps its rules to itself.
    try { turnRules(sheet.cssRules); } catch { /* nothing of ours in it */ }
  }
}

function restoreStylesheets() {
  for (const [rule, original] of turnedStyles) rule.style.cssText = original;
  for (const [rule, original] of turnedMedia) rule.media.mediaText = original;
  turnedStyles.clear();
  turnedMedia.clear();
  turnedSheetCount = -1;
}

function sync() {
  const root = document.documentElement;
  const turn = portraitLockTurn(window);
  if (turn) {
    root.dataset.portraitLock = String(turn);
    turnStylesheets();
  } else if (root.dataset.portraitLock) {
    delete root.dataset.portraitLock;
    restoreStylesheets();
  }
}

let installed = false;

export function installPortraitLock() {
  if (installed || typeof window === 'undefined') return;
  installed = true;
  // Where the system can hold the app upright itself, the page never turns and nothing below runs.
  try {
    const locking = window.screen?.orientation?.lock?.('portrait');
    locking?.catch?.(() => {});
  } catch { /* not offered here */ }
  window.addEventListener('orientationchange', sync);
  // The size of the turned page arrives after `orientationchange`, with `resize`.
  window.addEventListener('resize', sync);
  window.screen?.orientation?.addEventListener?.('change', sync);
  sync();
}
