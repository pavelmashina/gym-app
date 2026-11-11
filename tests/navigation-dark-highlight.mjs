import assert from 'node:assert/strict';
import fs from 'node:fs';

// #96: on the dark theme the active section highlight was too bright. The bottom navigation glow
// is built from --accent-soft, which the dark theme does not redefine, so it stayed a near-white
// spot; the active Training tile was an --ink (near-white) plate under a white icon, which vanished.
const read = (path) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const css = read('src/navigation-dark-highlight.css');
const main = read('src/main.jsx');

const rules = [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map(([, selectors, body]) => ({ selectors: selectors.split(',').map((s) => s.trim()), body }));
assert.equal(rules.length, 3, 'navigation-dark-highlight.css holds the bottom glow and the two slider tiles.');

// Only the dark theme is touched, so the light highlights stay as they were.
for (const { selectors } of rules) {
  for (const selector of selectors) {
    assert.match(selector, /^html\[data-theme='dark'\] /, `${selector}: dark-theme rules only.`);
  }
}

// Colours come only from the tokens the dark theme redefines (not --accent-soft).
const darkTokens = new Set(['--bg', '--surface', '--surface-2', '--ink', '--muted', '--line']);
for (const { selectors, body } of rules) {
  assert.doesNotMatch(body, /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i, `${selectors[0]}: no literal colours.`);
  for (const [, token] of body.matchAll(/var\((--[\w-]+)/g)) {
    assert.ok(darkTokens.has(token), `${selectors[0]} uses ${token}, which the dark theme does not redefine.`);
  }
}

const bodyOf = (selector) => {
  const rule = rules.find(({ selectors }) => selectors.includes(`html[data-theme='dark'] ${selector}`));
  assert.ok(rule, `A dark rule covers ${selector}.`);
  return rule.body;
};
const percents = (body) => [...body.matchAll(/var\(--ink\) (\d+)%/g)].map(([, n]) => Number(n));

// Bottom navigation keeps the inset radial glow, but dimmed: --ink at no more than 14% in the centre.
const glow = bodyOf('.app-bottom-nav .app-nav-item.active::before');
assert.match(glow, /background: radial-gradient\(ellipse 62% 60% at center,[\s\S]*transparent 100%\) !important;/, 'The glow stays a fading radial gradient.');
assert.ok(percents(glow).length >= 3 && Math.max(...percents(glow)) <= 14, 'The dark glow is at most 14% --ink.');
assert.doesNotMatch(glow, /solid|linear-gradient/, 'No solid block instead of the glow.');

// Training slider: the active tile is a grey plate (a dimmed --ink), so the white icon reads on it.
const tile = bodyOf('.exercise-catalog-content .training-tabs button.active::before');
assert.match(tile, /background-color: color-mix\(in srgb, var\(--ink\) (\d+)%, var\(--surface\)\);/);
assert.ok(Math.max(...percents(tile)) <= 45, 'The tile and its outline are a dimmed --ink, not --ink itself.');
assert.match(tile, /border-color: color-mix\(in srgb, var\(--ink\) \d+%, var\(--surface\)\);/, 'The active tile keeps an outline.');

// Nutrition slider gets the same plate and outline, with an --ink icon.
const nutrition = bodyOf('.nutrition-screen .nutrition-tabs button.active .nutrition-tab-icon');
assert.match(nutrition, /background: color-mix\(in srgb, var\(--ink\) 18%, var\(--surface\)\);/);
assert.match(nutrition, /color: var\(--ink\);/);
assert.match(tile, /var\(--ink\) 18%, var\(--surface\)/, 'Training and Nutrition tiles share one fill.');

// What it overrides is still where the light theme reads it.
const refinements = read('src/november-card-navigation-refinements.css');
assert.match(refinements, /\.app-bottom-nav \.app-nav-item\.active::before \{[^}]*radial-gradient\([^}]*var\(--accent-soft\)[^}]*!important;/);
const iconTabs = read('src/training-icon-tabs.css');
assert.match(iconTabs, /\.training-tabs button\.active::before \{[^}]*background-color: var\(--ink\);/);
assert.match(iconTabs, /data-training-tab="recommendations"\]\.active::before \{[^}]*stroke='%23ffffff'/, 'Active Training icons are drawn white.');

// Imported after every layer that styles the navigation highlight.
const imports = [...main.matchAll(/^import '\.\/([^']+\.css)';$/gm)].map((match) => match[1]);
assert.ok(imports.includes('navigation-dark-highlight.css'), 'main.jsx imports navigation-dark-highlight.css.');
for (const layer of ['training-icon-tabs.css', 'design-system.css', 'bottom-navigation.css', 'nutrition-standard.css', 'program-ui-refresh.css', 'november-card-navigation-refinements.css', 'training-catalog-standards.css']) {
  assert.ok(imports.indexOf(layer) < imports.indexOf('navigation-dark-highlight.css'), `navigation-dark-highlight.css comes after ${layer}.`);
}

console.log('Navigation dark highlight contracts passed.');
