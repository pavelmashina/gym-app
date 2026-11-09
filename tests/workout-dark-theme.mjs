import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Windows checkouts get CRLF; comments are dropped so they cannot hide or fake a rule.
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n').replace(/\/\*[\s\S]*?\*\//g, '');

// The dark theme redefines these tokens; any other token (--accent, --muted-2…) keeps its light value.
const settings = read('src/settings-screen.css');
const darkTokens = settings.match(/html\[data-theme='dark'\],html\[data-theme='dark'\] body\{([^}]*)\}/)?.[1] ?? '';
const flipped = [...darkTokens.matchAll(/(--[a-z0-9-]+):/g)].map((match) => match[1]);
for (const token of ['--bg', '--surface', '--surface-2', '--ink', '--muted', '--line']) assert.ok(flipped.includes(token), `dark theme defines ${token}`);
const allowedTokens = new Set([...flipped, '--workout-danger', '--workout-rest-ending']);

const files = [
  'src/workout-session.css',
  'src/workout-session-figma.css',
  'src/workout-session-active-v2.css',
  'src/workout-session-active-v3.css',
  'src/workout-exercise-info-media.css',
];
const rules = files.flatMap((file) => [...read(file).matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({ file, selector: selector.trim().replace(/\s+/g, ' '), body })));
const rule = (selector) => {
  const found = rules.filter((item) => item.selector === selector);
  assert.ok(found.length > 0, `missing rule ${selector}`);
  return found.map((item) => item.body).join(';');
};

// Active workout outside the exercise cards: header, footer with the rest timer, and the workout popups
// (⋯ menu, exercise history, exercise order and its confirmation, exercise information, pause confirmation).
// Scrims and shadows stay black on both themes; the video frame of the exercise information stays dark.
const inScope = /workout-active-head|workout-timer|workout-session-footer|workout-pause-button|rest-countdown|rest-timer-idle|exercise-actions-|exercise-action-row|exercise-unit-|exercise-rest-settings|workout-modal-|history-|exercise-reorder-|reorder-scope-|exercise-info-(screen|hero|loading|meta|copy|placeholder)|workout-interrupt-confirm/;
const colourProperty = /^(color|background(-color)?|border(-[a-z]+)?|outline(-color)?|fill|stroke)$/;
const literal = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?)\(|\b(white|black)\b/i;
const checked = rules.filter((item) => inScope.test(item.selector) && !/-scrim\b/.test(item.selector));
assert.ok(checked.length >= 40, `found ${checked.length} rules of the workout screen`);
for (const { file, selector, body } of checked) {
  for (const declaration of body.split(';').map((part) => part.trim()).filter(Boolean)) {
    const [property, ...rest] = declaration.split(':');
    const value = rest.join(':').trim();
    if (!colourProperty.test(property.trim())) continue;
    assert.doesNotMatch(value, literal, `${file} ${selector}: ${declaration} must use theme tokens`);
    for (const [, token] of value.matchAll(/var\((--[a-z0-9-]+)/g)) assert.ok(allowedTokens.has(token), `${file} ${selector}: ${token} does not change with the dark theme`);
  }
}

// «Тренировка идёт», «Завершить тренировку» and the best set in history are filled with --ink and written
// in --surface, so they invert together with the theme instead of turning into white text on a light plate.
for (const selector of ['.workout-active-head', '.workout-session-footer button', '.history-best-card']) {
  assert.match(rule(selector), /background: var\(--ink\);[\s\S]*color: var\(--surface\);/, selector);
}
assert.match(rule('.workout-active-head > div > span'), /color: color-mix\(in srgb, var\(--surface\) 62%, transparent\)/);
assert.match(rule('.workout-timer'), /background: color-mix\(in srgb, var\(--surface\) 10%, transparent\)/);
assert.match(rule('.rest-countdown'), /background: var\(--ink\);\s*color: var\(--surface\);/);

// Popups and full-screen sheets take the theme surfaces.
assert.match(rule('.exercise-actions-popup, .reorder-scope-card'), /background: var\(--surface\);/);
assert.match(rule('.exercise-info-screen, .exercise-reorder-screen'), /background: var\(--bg\);/);
assert.match(rule('.exercise-unit-toggle button.active'), /background: var\(--ink\); color: var\(--surface\);/);
assert.match(rule('.exercise-reorder-screen > footer > button'), /background: var\(--ink\); color: var\(--surface\);/);

// Pause and delete share one red, mixed into --ink so it keeps its contrast on both themes.
const session = read('src/workout-session.css');
assert.match(session, /:root \{\s*--workout-danger: color-mix\(in srgb, #bc3f3f 75%, var\(--ink\)\);\s*\}/);
assert.match(rule('.workout-session-footer-dual .workout-pause-button'), /border: 1px solid color-mix\(in srgb, var\(--workout-danger\) 30%, var\(--surface\)\);[\s\S]*color: var\(--workout-danger\);/);
assert.match(rule('.exercise-actions-popup .exercise-action-row.danger'), /color: var\(--workout-danger\);/);

// The rest bar in its last 15 seconds (#63) lies on the --ink plate, which inverts with the theme, so its red
// is mixed into --surface: bright on the black plate, deeper on the light one. Mixed into --ink like
// --workout-danger, it would fade into the plate on both themes.
assert.match(session, /:root \{\s*--workout-rest-ending: color-mix\(in srgb, #ff453a 85%, var\(--surface\)\);\s*\}/);
assert.match(rule('.rest-countdown.ending .rest-countdown-track span'), /background:var\(--workout-rest-ending\)/);
