import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// Issue #102: the app stays upright when the phone is turned on its side. An iPhone gives a web
// app no way to stop the page from turning, so the turned page is turned back by the app itself.
const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

const {
  landscapeTurn, isPhone, portraitLockTurn, turnViewportUnits, turnMediaQuery, turnPoint,
} = await import('../src/lib/portraitLock.js');

// Which way the phone lies.
const phone = (extra = {}) => ({ screen: { width: 390, height: 844 }, navigator: { maxTouchPoints: 5 }, innerWidth: 844, innerHeight: 390, ...extra });
assert.equal(landscapeTurn({ orientation: 90 }), 90, 'Turned counter-clockwise: the top of the phone points left.');
assert.equal(landscapeTurn({ orientation: -90 }), 270, 'Turned clockwise: the top of the phone points right.');
assert.equal(landscapeTurn({ orientation: 0 }), 0);
assert.equal(landscapeTurn({ orientation: 180 }), 0, 'Upside down is not on its side.');
assert.equal(landscapeTurn({ screen: { orientation: { angle: 270 } } }), 270, 'Without window.orientation the angle of the screen decides.');
assert.equal(landscapeTurn({ orientation: 90, screen: { orientation: { angle: 270 } } }), 90, 'window.orientation means the same on iOS and Android and wins.');

assert.equal(isPhone(phone()), true);
assert.equal(isPhone(phone({ screen: { width: 844, height: 390 } })), true, 'Android swaps the sides of the screen with the turn.');
assert.equal(isPhone(phone({ screen: { width: 820, height: 1180 } })), false, 'A tablet may be used on its side.');
assert.equal(isPhone(phone({ navigator: { maxTouchPoints: 0 } })), false, 'A narrow window on a computer is not a phone.');

assert.equal(portraitLockTurn(phone({ orientation: 90 })), 90);
assert.equal(portraitLockTurn(phone({ orientation: -90 })), 270);
assert.equal(portraitLockTurn(phone({ orientation: 0 })), 0);
assert.equal(portraitLockTurn(phone({ orientation: 90, innerWidth: 390, innerHeight: 844 })), 0, 'A page the system kept upright is left alone.');
assert.equal(portraitLockTurn(phone({ orientation: 90, screen: { width: 820, height: 1180 } })), 0);

// The stylesheets speak about the screen; while the lock is on they must speak about the app.
assert.equal(turnViewportUnits('width: min(100vw, 430px); height: 100dvh;'),
  'width: min(calc(100 * var(--portrait-lock-vw)), 430px); height: calc(100 * var(--portrait-lock-vh));');
assert.equal(turnViewportUnits('max-height:calc(100dvh - 36px)'), 'max-height:calc(calc(100 * var(--portrait-lock-vh)) - 36px)');
assert.equal(turnViewportUnits('right:max(var(--r), calc((100vw - 430px) / 2 + var(--r)))'),
  'right:max(var(--r), calc((calc(100 * var(--portrait-lock-vw)) - 430px) / 2 + var(--r)))');
assert.equal(turnViewportUnits('font-size: clamp(27px, 7vw, 31px)'), 'font-size: clamp(27px, calc(7 * var(--portrait-lock-vw)), 31px)');
assert.equal(turnViewportUnits('margin-left: -50vw; min-height: 52.5svh'),
  'margin-left: calc(-50 * var(--portrait-lock-vw)); min-height: calc(52.5 * var(--portrait-lock-vh))');
assert.equal(turnViewportUnits('color: #171717; padding: 0 18px'), 'color: #171717; padding: 0 18px', 'Nothing else changes.');

assert.equal(turnMediaQuery('(max-width: 370px)'), '(max-height: 370px)');
assert.equal(turnMediaQuery('(min-width: 371px) and (max-width: 400px)'), '(min-height: 371px) and (max-height: 400px)');
assert.equal(turnMediaQuery('(max-height: 760px)'), '(max-width: 760px)');
assert.equal(turnMediaQuery('(width <= 360px)'), '(height <= 360px)', 'The build may write a query as a range.');
assert.equal(turnMediaQuery('(prefers-reduced-motion: reduce)'), '(prefers-reduced-motion: reduce)');
assert.equal(turnMediaQuery('(pointer: coarse)'), '(pointer: coarse)');

// A finger on the turned page, the way the user sees the app. The page is 844 × 390.
const frame = { left: 0, top: 0, right: 844, bottom: 390 };
assert.deepEqual(turnPoint(90, frame, 0, 390), { x: 0, y: 0 }, 'Top on the left: the app starts at the bottom left of the page.');
assert.deepEqual(turnPoint(90, frame, 844, 0), { x: 390, y: 844 });
assert.deepEqual(turnPoint(270, frame, 844, 0), { x: 0, y: 0 }, 'Top on the right: the app starts at the top right of the page.');
assert.deepEqual(turnPoint(270, frame, 0, 390), { x: 390, y: 844 });
assert.deepEqual(turnPoint(0, frame, 12, 34), { x: 12, y: 34 });
{
  // A swipe to the right, as the user sees it, runs up the turned page.
  const from = turnPoint(90, frame, 300, 380);
  const to = turnPoint(90, frame, 300, 240);
  assert.deepEqual([to.x - from.x, to.y - from.y], [140, 0]);
}
{
  // The camera cutout keeps the app off the edge it lies at: <body> starts 47px in.
  const inset = { left: 47, top: 0, right: 844, bottom: 390 };
  assert.deepEqual(turnPoint(90, inset, 47, 390), { x: 0, y: 0 });
}

// Behaviour: a fake phone that turns while the app is open.
function styleRule(selectorText, cssText) { return { type: 1, selectorText, style: { cssText } }; }
function mediaRule(mediaText, cssRules) { return { type: 4, media: { mediaText }, cssRules }; }
const page = styleRule('.phone', 'width: min(100vw, 430px); height: 100dvh;');
const plain = styleRule('.card', 'padding: 12px;');
const own = styleRule('html[data-portrait-lock="90"] body', 'transform: translate(var(--portrait-lock-top), 100dvh) rotate(-90deg);');
const sheetInside = styleRule('.sheet', 'max-height: 88dvh;');
const narrow = mediaRule('(max-width: 370px)', [sheetInside]);
const motion = mediaRule('(prefers-reduced-motion: reduce)', [styleRule('.spin', 'animation: none;')]);
const foreignSheet = { get cssRules() { throw new Error('SecurityError'); } };
const listeners = {};
const lockRequests = [];
globalThis.document = {
  documentElement: { dataset: {} },
  styleSheets: [foreignSheet, { cssRules: [page, plain, own, narrow, motion] }],
};
globalThis.window = {
  ...phone({ orientation: 0, innerWidth: 390, innerHeight: 844 }),
  addEventListener: (type, listener) => { listeners[type] = listener; },
};
window.screen.orientation = {
  lock: (mode) => { lockRequests.push(mode); return Promise.reject(new Error('NotSupportedError')); },
  addEventListener: (type, listener) => { listeners[`screen:${type}`] = listener; },
};
const turnPhone = (orientation) => {
  Object.assign(window, orientation ? { orientation, innerWidth: 844, innerHeight: 390 } : { orientation: 0, innerWidth: 390, innerHeight: 844 });
  listeners.orientationchange();
  listeners.resize();
};
const lock = () => document.documentElement.dataset.portraitLock;

const { installPortraitLock } = await import('../src/lib/portraitLock.js');
installPortraitLock();
installPortraitLock();
assert.deepEqual(lockRequests, ['portrait'], 'The system is asked once to hold the app upright; a refusal is not an error.');
assert.ok(listeners.orientationchange && listeners.resize && listeners['screen:change']);
assert.equal(lock(), undefined, 'Nothing is turned while the phone is upright.');
assert.equal(page.style.cssText, 'width: min(100vw, 430px); height: 100dvh;');

turnPhone(90);
assert.equal(lock(), '90');
assert.equal(page.style.cssText, 'width: min(calc(100 * var(--portrait-lock-vw)), 430px); height: calc(100 * var(--portrait-lock-vh));');
assert.equal(narrow.media.mediaText, '(max-height: 370px)');
assert.equal(sheetInside.style.cssText, 'max-height: calc(88 * var(--portrait-lock-vh));', 'Rules inside a media query are turned too.');
assert.equal(motion.media.mediaText, '(prefers-reduced-motion: reduce)');
assert.equal(plain.style.cssText, 'padding: 12px;');
assert.match(own.style.cssText, /100dvh/, 'The rules of the lock itself describe the turned screen and keep their units.');

turnPhone(-90);
assert.equal(lock(), '270', 'Turned over to the other side without passing upright.');
assert.equal(page.style.cssText, 'width: min(calc(100 * var(--portrait-lock-vw)), 430px); height: calc(100 * var(--portrait-lock-vh));', 'Nothing is turned twice.');
assert.equal(narrow.media.mediaText, '(max-height: 370px)');

turnPhone(0);
assert.equal(lock(), undefined);
assert.equal(page.style.cssText, 'width: min(100vw, 430px); height: 100dvh;', 'Upright again, the stylesheets are as written.');
assert.equal(narrow.media.mediaText, '(max-width: 370px)');
assert.equal(sheetInside.style.cssText, 'max-height: 88dvh;');

turnPhone(90);
assert.equal(lock(), '90');
assert.equal(narrow.media.mediaText, '(max-height: 370px)', 'And it works on the next turn.');
turnPhone(0);

// Source contracts.
const lockSource = read('src/lib/portraitLock.js');
const lockCss = read('src/portrait-lock.css');
const main = read('src/main.jsx');
const manifest = JSON.parse(read('public/manifest.webmanifest'));

assert.equal(manifest.orientation, 'portrait', 'An installed Android app is held upright by the system.');
assert.doesNotMatch(lockSource.replace(/^\s*\/\/.*$/gm, ''), /\(\?<[=!]/, 'A lookbehind stops Safari before 16.4 from loading the whole app.');
assert.match(main, /import '\.\/portrait-lock\.css';/);
assert.ok(main.indexOf('installPortraitLock();') > 0 && main.indexOf('installPortraitLock();') < main.indexOf('createRoot('),
  'The lock is on before the first render, so a phone already on its side opens the app upright.');

const cssRule = (selector) => {
  const start = lockCss.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} is styled`);
  return lockCss.slice(start, lockCss.indexOf('}', start));
};
assert.match(cssRule('html[data-portrait-lock] body'), /position:\s*fixed;[\s\S]*width:\s*calc\(100 \* var\(--portrait-lock-vw\)\);[\s\S]*height:\s*calc\(100 \* var\(--portrait-lock-vh\)\);[\s\S]*transform-origin:\s*0 0;/);
assert.match(cssRule('html[data-portrait-lock="90"] body'), /transform:\s*translate\(var\(--portrait-lock-top\), 100dvh\) rotate\(-90deg\);/);
assert.match(cssRule('html[data-portrait-lock="270"] body'), /transform:\s*translate\(calc\(100vw - var\(--portrait-lock-top\)\), 0\) rotate\(90deg\);/);
assert.match(cssRule('html[data-portrait-lock="90"]'), /--portrait-lock-top:\s*env\(safe-area-inset-left, 0px\);/, 'The camera cutout is on the left of the turned page.');
assert.match(cssRule('html[data-portrait-lock="270"]'), /--portrait-lock-top:\s*env\(safe-area-inset-right, 0px\);/);
assert.match(cssRule('html[data-portrait-lock] #root'), /height:\s*100%;[\s\S]*align-items:\s*flex-start;[\s\S]*overflow-y:\s*auto;/,
  'The page cannot scroll under a turned <body>: #root scrolls, and fixed layers stay on <body>.');
for (const selector of lockCss.match(/^[^\s/@}][^{]*(?=\s*\{)/gm)) {
  assert.match(selector, /^html\[data-portrait-lock/, `${selector}: every rule of the lock applies only while the page is turned`);
}

// Every screen length and every screen query of the app is one the lock can re-point.
const cssFiles = fs.readdirSync('src').filter((file) => file.endsWith('.css') && file !== 'portrait-lock.css');
const rawViewportUnit = /\d[dsl]?v[hw]\b/;
for (const file of cssFiles) {
  const css = read(path.join('src', file)).replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(turnViewportUnits(css), rawViewportUnit, `${file}: a vh/vw length the portrait lock cannot turn`);
  for (const query of css.match(/@media[^{]*/g) ?? []) {
    assert.doesNotMatch(query, /orientation|aspect-ratio/, `${file}: ${query.trim()} would read the turned screen`);
  }
}
const sourceFiles = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => (
  entry.isDirectory() ? sourceFiles(path.join(dir, entry.name)) : /\.jsx?$/.test(entry.name) ? [path.join(dir, entry.name)] : []
));
for (const file of sourceFiles('src')) {
  const source = read(file);
  if (file.endsWith('portraitLock.js')) continue;
  assert.doesNotMatch(source, /['"`][^'"`\n]*\d[dsl]?v[hw]\b[^'"`\n]*['"`]/, `${file}: a vh/vw length in a script is out of the lock's reach, keep it in a stylesheet`);
  // Directions and edges of a gesture are read as the user sees the app.
  // `elementFromPoint` and a distance are the same on a turned page and keep the page's own point.
  const rawPoints = source.split('\n').filter((line) => /\.client[XY]\b|\bclient[XY]\b/.test(line)
    && !/elementFromPoint\(event\.clientX, event\.clientY\)|Math\.hypot\(|const \{ pointerId, clientX, clientY \} = event;/.test(line));
  assert.deepEqual(rawPoints, [], `${file}: read the finger through appPoint() of lib/portraitLock.js`);
  assert.doesNotMatch(source, /window\.innerHeight|window\.innerWidth/, `${file}: use appHeight() of lib/portraitLock.js`);
}
for (const file of ['src/lib/swipeBackNavigation.js', 'src/components/PullToRefresh.jsx', 'src/components/HomeScreen.jsx',
  'src/components/NutritionScreen.jsx', 'src/components/ExercisePhotoGallery.jsx', 'src/components/TrainingExerciseBrowser.jsx',
  'src/components/ProgramCoverCropEditor.jsx']) {
  assert.match(read(file), /appPoint\(/, `${file} reads the finger as the user sees the app`);
}
assert.match(read('src/lib/swipeBackNavigation.js'), /const box = page \? appBox\(page\) : null;/, 'The left edge of a swipe back is the left edge the user sees.');
assert.match(read('src/components/WorkoutExerciseAdder.jsx'), /appBox\(header\)\.bottom[\s\S]*appBox\(footer\)\.top : appHeight\(\)[\s\S]*appBox\(card\)/);

assert.match(read('docs/design-system.md'), /## Portrait only: the app stays upright — November 2026 \(#102\)/);

console.log('Portrait lock contracts passed.');
