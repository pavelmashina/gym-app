import assert from 'node:assert/strict';
import fs from 'node:fs';

// #74: on the home screen a long workout title broke mid-word («оздоровительна» / «я»),
// and «Белки» / «Жиры» slid under their values in the narrow «Питание» card.
// #94: «Углеводы» were hidden on that card; now all three macros show, as list rows.
const read = (path) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');

const home = read('src/components/HomeScreen.jsx');
const css = read('src/home-summary.css');
const main = read('src/main.jsx');

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
assert.match(titleRule[1], /font-size: var\(--workout-title-size, var\(--text-h3\)\) !important;/);
assert.match(titleRule[1], /line-height: 1\.2 !important;/);
assert.match(titleRule[1], /overflow-wrap: normal;/, 'Words stay whole: no overflow-wrap anywhere on the title.');
assert.match(titleRule[1], /hyphens: manual;/);
assert.match(css, /\.summary-col\.workout > h3\[data-title-fit='hyphenate'\] \{[^}]*hyphens: auto;/);

// Nutrition: one row per macro, with label and value stacked to avoid collisions at 12px.
assert.match(css, /\.summary-col\.food \.food-grid \{\s*grid-template-columns: minmax\(0, 1fr\);\s*gap: 0;/);
for (const file of fs.readdirSync('src').filter((name) => name.endsWith('.css'))) {
  const source = read(`src/${file}`);
  assert.doesNotMatch(source, /food-grid\s*\{[^}]*grid-template-columns:\s*repeat\(/,
    `${file}: the home nutrition card is too narrow for macro columns.`);
  // #94: carbs were the last row and hid behind `.summary-col.food .food-stat:last-child{display:none}`.
  assert.doesNotMatch(source, /\.food-stat(?::last-child|:nth-child\(3\)|\.carbs)[^{}]*\{[^}]*display:\s*none/,
    `${file}: «Углеводы» must stay visible on the home nutrition card.`);
}

// All three macros are rendered: «Белки», «Жиры», «Углеводы», each with its grams.
const foodGrid = home.match(/<div className="food-grid">([\s\S]*?)<\/div><\/section>/);
assert.ok(foodGrid, 'NutritionSummary renders the macro list.');
const macros = [...foodGrid[1].matchAll(/<div className="food-stat (\w+)"><span>([^<]+)<\/span><strong>\{nutritionPlan\.(\w+)\} г<\/strong><\/div>/g)]
  .map(([, kind, label, field]) => `${kind}:${label}:${field}`);
assert.deepEqual(macros, ['protein:Белки:protein', 'fat:Жиры:fat', 'carbs:Углеводы:carbs']);

// Rows without plates: the plate's 8px padding left «Углеводы» and «420 г» 93px on a
// 375px phone, where they need 102px. Hairlines between rows come from --ink, so they
// show on --accent-soft and on the dark --surface alike, with no dark-theme rule of their own.
const rowRule = css.match(/\.summary-col\.food \.food-stat \{([^}]*)\}/);
assert.ok(rowRule, 'home-summary.css styles the macro rows.');
assert.match(rowRule[1], /padding: 6px 0 !important;/, 'No side padding: it overrides the 8px !important of design-system.css.');
assert.match(rowRule[1], /background: none;/);
assert.match(rowRule[1], /border-radius: 0 !important;/);
assert.match(rowRule[1], /flex-direction: column;/);
assert.match(css, /\.summary-col\.food \.food-stat span \{[^}]*font-size: var\(--text-caption\) !important;/);
assert.match(css, /\.summary-col\.food \.food-stat \+ \.food-stat \{\s*border-top: 1px solid color-mix\(in srgb, var\(--ink\) 10%, transparent\);/);
assert.doesNotMatch(css, /html\[data-theme='dark'\] \.summary-col\.food \.food-stat/, 'No dark plate colour is left behind.');

// Imported after the layers it overrides: design-system.css and ui-layout-audit.css.
const imports = [...main.matchAll(/^import '\.\/([^']+\.css)';$/gm)].map((match) => match[1]);
assert.ok(imports.includes('home-summary.css'), 'main.jsx imports home-summary.css.');
assert.ok(imports.indexOf('design-system.css') < imports.indexOf('home-summary.css'));
assert.ok(imports.indexOf('ui-layout-audit.css') < imports.indexOf('home-summary.css'));

console.log('Home summary fit contracts passed.');
