import assert from 'node:assert/strict';
import fs from 'node:fs';

// #74: on the home screen a long workout title broke mid-word («оздоровительна» / «я»),
// and «Белки» / «Жиры» slid under their values in the narrow «Питание» card.
const read = (path) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const home = read('src/components/HomeScreen.jsx');
const css = read('src/home-summary.css');
const main = read('src/main.jsx');
const nutrition = read('src/nutrition-screen.css');

// The workout title is measured and shrunk instead of being cut anywhere.
assert.match(home, /<WorkoutTitle title=\{workout\.title\} \/>/, 'The workout card renders its title through WorkoutTitle.');
assert.doesNotMatch(home, /<h3>\{workout\.title\}<\/h3>/, 'The workout card title must not be a plain h3 that wraps anywhere.');
assert.match(home, /const WORKOUT_TITLE_MIN_PX = 14;/, 'The title shrinks down to the body size, 14px.');
assert.match(home, /while \(node\.scrollWidth > node\.clientWidth && size > WORKOUT_TITLE_MIN_PX\)/, 'The title shrinks 1px at a time while a word is wider than the card.');
assert.match(home, /setProperty\('--workout-title-size', `\$\{size\}px`\)/);
assert.match(home, /node\.dataset\.titleFit = 'hyphenate'/, 'A word too wide even at 14px falls back to hyphenation.');
assert.match(home, /new ResizeObserver\(refitOnWidth\)/, 'The title refits when the card width changes.');
assert.match(home, /addEventListener\?\.\('loadingdone', refitOnFont\)/, 'The title refits when the web font arrives.');
assert.match(home, /useLayoutEffect\(\(\) => \{[\s\S]*fitWorkoutTitle\(node\)/, 'The first fit runs before paint, so the cut word never flashes.');

const titleRule = css.match(/\.summary-col\.workout > h3 \{([^}]*)\}/);
assert.ok(titleRule, 'home-summary.css styles the workout title.');
assert.match(titleRule[1], /font-size: var\(--workout-title-size, var\(--text-h2\)\) !important;/);
assert.match(titleRule[1], /line-height: 1\.2 !important;/);
assert.match(titleRule[1], /overflow-wrap: normal;/, 'Words stay whole: no overflow-wrap anywhere on the title.');
assert.match(titleRule[1], /hyphens: manual;/);
assert.match(css, /\.summary-col\.workout > h3\[data-title-fit='hyphenate'\] \{[^}]*hyphens: auto;/);

// Nutrition: one row per macro, label left and value right.
assert.match(css, /\.summary-col\.food \.food-grid \{\s*grid-template-columns: minmax\(0, 1fr\);/);
for (const file of fs.readdirSync('src').filter((name) => name.endsWith('.css'))) {
  assert.doesNotMatch(read(`src/${file}`), /food-grid\s*\{[^}]*grid-template-columns:\s*repeat\(/,
    `${file}: the home nutrition card is too narrow for macro columns.`);
}
assert.match(nutrition, /\.summary-col\.food \.food-stat:last-child\{display:none\}/, 'Carbs stay hidden on the home card.');

// Row plates come from theme tokens, so they stay readable on the dark theme.
assert.match(css, /\.summary-col\.food \.food-stat \{\s*background: color-mix\(in srgb, var\(--surface\) 72%, transparent\);/);
assert.match(css, /html\[data-theme='dark'\] \.summary-col\.food \.food-stat \{\s*background: var\(--surface-2\);/);

// Imported last: it overrides design-system.css and ui-layout-audit.css.
const imports = [...main.matchAll(/^import '\.\/([^']+\.css)';$/gm)].map((match) => match[1]);
assert.equal(imports.at(-1), 'home-summary.css', 'home-summary.css is the last stylesheet in main.jsx.');
assert.ok(imports.indexOf('design-system.css') < imports.indexOf('home-summary.css'));
assert.ok(imports.indexOf('ui-layout-audit.css') < imports.indexOf('home-summary.css'));

console.log('Home summary fit contracts passed.');
