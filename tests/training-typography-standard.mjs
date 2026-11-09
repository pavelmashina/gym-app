import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = path => fs.readFileSync(path, 'utf8');
const standards = read('src/training-catalog-standards.css');
const tokens = read('src/design-system.css');
const doc = read('docs/design-system.md');
const agentRules = read('AGENTS.md');
const entry = read('src/main.jsx');
const navStyles = read('src/november-card-navigation-refinements.css');
const ui = read('src/components/ExercisesScreen.jsx');
const catalog = read('src/components/CatalogProgramsPanel.jsx');

const sizes = { xl: 24, l: 20, m: 16, s: 14, xs: 12, xxs: 10 };
for (const [tier, size] of Object.entries(sizes)) {
  assert.match(tokens, new RegExp('--gym-type-' + tier + ':'), 'Missing canonical size token ' + tier);
  assert.match(agentRules, new RegExp('\\*\\*' + size + 'px\\*\\*'), 'AGENTS.md missing ' + size + 'px');
  assert.match(doc, new RegExp('\\*\\*' + size + 'px\\*\\*'), 'Design docs missing ' + size + 'px');
}
assert.match(tokens, /--gym-type-xl:24px/);
assert.match(tokens, /--gym-type-l:var\(--text-h2\)/);
assert.match(tokens, /--gym-type-m:var\(--text-h3\)/);
assert.match(tokens, /--gym-type-s:var\(--text-body\)/);
assert.match(tokens, /--gym-type-xs:var\(--text-caption\)/);
assert.match(tokens, /--gym-type-xxs:var\(--text-micro\)/);
assert.match(tokens, /--text-micro:10px/);
assert.match(agentRules, /Read this file before changing UI/);
assert.match(agentRules, /Training → Recommendations & Catalog/);
assert.match(agentRules, /Upper navigation labels[^\n]*\*\*10px \(XXS\)\*\*/);
assert.match(doc, /Top navigation labels[^\n]*\*\*10px\*\*/);

const lastImport = "import './training-catalog-standards.css';";
assert.ok(entry.includes(lastImport), 'Training standards must be imported');
assert.ok(entry.indexOf(lastImport) > entry.indexOf("import './november-card-navigation-refinements.css';"), 'Typography rules must load after legacy catalog styles');
assert.ok(entry.indexOf(lastImport) > entry.indexOf("import './nutrition-card-alignment.css';"), 'Typography rules must be last');

function rule(selector) {
  const start = standards.indexOf(selector + ' {');
  assert.notEqual(start, -1, 'Missing scoped rule: ' + selector);
  const end = standards.indexOf('}', start);
  assert.ok(end > start);
  return standards.slice(start, end + 1);
}
function font(selector, tier) {
  assert.match(rule(selector), new RegExp('font-size: var\\(--gym-type-' + tier + '\\) !important'));
}
font('.exercise-catalog-content .training-tabs button', 'xxs');
font('.exercise-catalog-content .training-empty-programs > strong', 'm');
font('.exercise-catalog-content .training-empty-programs > span', 'xs');
font('.exercise-catalog-content .program-list-card-heading > strong', 's');
font('.exercise-catalog-content .program-list-unified-card .catalog-program-tag', 'xxs');
font('.exercise-catalog-content .catalog-filter-group > span', 's');
font('.exercise-catalog-content .catalog-filter-pills button', 'xs');
font('.exercise-catalog-content .catalog-filters-reset', 'xs');
font('.exercise-catalog-content .catalog-empty > span', 'xxs');

for (const selector of [
  '.exercise-catalog-content .catalog-filter-group > span',
  '.exercise-catalog-content .catalog-filter-pills button',
  '.exercise-catalog-content .catalog-filters-reset'
]) {
  assert.match(rule(selector), /text-transform: none !important/, 'No caps in filters: ' + selector);
}
assert.match(rule('.exercise-catalog-content .catalog-filter-group > span'), /letter-spacing: normal !important/);

for (const match of standards.matchAll(/font-size:\s*([^;]+);/g)) {
  assert.match(match[1], /^var\(--gym-type-(?:xl|l|m|s|xs|xxs)\) !important$/, 'New scoped rules may only use canonical type tokens');
}
assert.match(ui, /className="training-tabs"/);
assert.match(ui, /className="training-empty-programs"/);
assert.match(catalog, /className="catalog-filters"/);
assert.match(catalog, /className="catalog-empty"/);

const highlightStart = navStyles.indexOf('.app-bottom-nav .app-nav-item.active::before {');
assert.ok(highlightStart !== -1, 'Missing shared active navigation glow');
const highlight = navStyles.slice(highlightStart, navStyles.indexOf('}', highlightStart));
assert.match(highlight, /inset: 6px 4px;/, 'Navigation glow must be inset');
assert.match(highlight, /radial-gradient\(ellipse 62% 60% at center/);
assert.match(highlight, /color-mix\(in srgb, var\(--accent-soft\) 30%, transparent\) 76%/);
assert.match(highlight, /color-mix\(in srgb, var\(--accent-soft\) 8%, transparent\) 90%/);
assert.match(highlight, /transparent 100%/);
assert.doesNotMatch(highlight, /background:\s*var\(--accent-soft\)/);

console.log('Canonical six-size GYM typography and Training/Catalog/Nav design contracts verified.');
