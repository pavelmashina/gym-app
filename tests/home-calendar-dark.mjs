import assert from 'node:assert/strict';
import fs from 'node:fs';

// The home calendar was drawn with light-theme literals: on the dark theme the month arrows
// vanished on light plates, the shown month was dimmer than the other months, and the workout
// dots, the today ring and the selected circle were black on the black card.
const read = (path) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const css = read('src/home-calendar-dark.css');
const main = read('src/main.jsx');

const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map(([, selectors, body]) => ({ selectors: selectors.split(',').map((s) => s.trim()), body }));
assert.ok(rules.length >= 7, 'home-calendar-dark.css holds the dark calendar rules.');

// Only the dark theme is touched, so the light calendar stays as it was.
for (const { selectors } of rules) {
  for (const selector of selectors) {
    assert.match(selector, /^html\[data-theme='dark'\] \.calendar-card /, `${selector}: dark-theme calendar rules only.`);
  }
}

// Colours come only from the tokens the dark theme redefines.
const darkTokens = new Set(['--bg', '--surface', '--surface-2', '--ink', '--muted', '--line']);
for (const { selectors, body } of rules) {
  assert.doesNotMatch(body, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, `${selectors[0]}: no literal colours.`);
  for (const [, token] of body.matchAll(/var\((--[\w-]+)/g)) {
    assert.ok(darkTokens.has(token), `${selectors[0]} uses ${token}, which the dark theme does not redefine.`);
  }
}

const bodyOf = (selector) => {
  const rule = rules.find(({ selectors }) => selectors.includes(`html[data-theme='dark'] .calendar-card ${selector}`));
  assert.ok(rule, `A dark rule covers ${selector}.`);
  return rule.body;
};
assert.match(bodyOf('.month-row button'), /background: var\(--surface-2\);[\s\S]*color: var\(--ink\);/, 'Month arrows: --ink on --surface-2.');
assert.match(bodyOf('.day'), /color: color-mix\(in srgb, var\(--ink\) 84%, var\(--surface\)\);/, 'Days of the shown month: #3d3d3a-like contrast.');
assert.match(bodyOf('.day.out'), /color: color-mix\(in srgb, var\(--ink\) 30%, var\(--surface\)\);/, 'Other months stay dimmer than the shown one.');
assert.match(bodyOf('.day.workout::after'), /background: var\(--ink\);/, 'Workout dots are visible.');
assert.match(bodyOf('.day.selected::after'), /background: var\(--ink\);/);
assert.match(bodyOf('.day.today:not(.selected) span'), /border-color: var\(--ink\);[\s\S]*color: var\(--ink\);/, 'The today ring is visible.');
assert.match(bodyOf('.day.selected span'), /background: var\(--ink\);[\s\S]*color: var\(--surface\);/, 'The selected day inverts.');
assert.match(bodyOf('button.day:focus-visible span'), /outline-color: var\(--ink\);/);

// The light literals it overrides are still where the light theme reads them.
const styles = read('src/styles.css');
assert.match(styles, /\.day \{[^}]*color: #3d3d3a;/);
assert.match(styles, /\.day\.out \{\s*color: #b9b9b4;/);
assert.match(styles, /\.month-row button \{[^}]*background: var\(--accent-soft\);/);

// Imported after every global layer that styles the calendar.
const imports = [...main.matchAll(/^import '\.\/([^']+\.css)';$/gm)].map((match) => match[1]);
assert.ok(imports.includes('home-calendar-dark.css'), 'main.jsx imports home-calendar-dark.css.');
for (const layer of ['styles.css', 'design-system.css', 'ui-layout-audit.css']) {
  assert.ok(imports.indexOf(layer) < imports.indexOf('home-calendar-dark.css'), `home-calendar-dark.css comes after ${layer}.`);
}

console.log('Home calendar dark theme contracts passed.');
