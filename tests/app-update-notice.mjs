import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const read = (path) => readFileSync(path, 'utf8');
const notice = read('src/components/AppUpdateNotice.jsx');
const css = read('src/app-update-notice.css');
const design = read('src/design-system.css');
const home = read('src/components/HomeScreen.jsx');
const app = read('src/App.jsx');

// Issue #49: a small icon in the top-right corner replaces the bottom banner.
assert.match(app, /<AppUpdateNotice \/>/);
assert.doesNotMatch(notice, />Обновить<\/button>/, 'the icon itself updates, there is no text button');
assert.match(notice, /<button[^>]*aria-label="Доступна новая версия GYM APP\. Обновить"/);
assert.match(notice, /role="status">Доступна новая версия GYM APP</, 'screen readers still hear about the new version');
// Two circular arrows chasing each other, each with its own head.
const arcs = [...notice.matchAll(/M([\d.]+) ([\d.]+)A([\d.]+) [\d.]+ 0 0 1 ([\d.]+) ([\d.]+)/g)];
assert.equal(arcs.length, 2);
const [, x1, y1, radius] = arcs[0].map(Number);
const [, x2, y2] = arcs[1].map(Number);
// The second arc is the first turned half a circle, so both share one centre.
const ringCentre = [(x1 + x2) / 2, (y1 + y2) / 2];
assert.ok(Math.abs(Math.hypot(x1 - ringCentre[0], y1 - ringCentre[1]) - radius) < 0.05, 'the arcs form one ring');
// The small exclamation mark sits at the bottom right of the arrows, not inside the ring.
const mark = notice.match(/className="app-update-notice-mark" d="M([\d.]+) ([\d.]+)v([\d.]+)M[\d.]+ ([\d.]+)h\.01"/);
assert.ok(mark, 'the exclamation mark is a stem and a dot');
const [, markX, markTop] = mark.map(Number);
assert.ok(markX > ringCentre[0] + radius * 0.7, 'the mark is to the right of the arrows');
assert.ok(markTop > ringCentre[1] + radius * 0.5, 'the mark is in the lower part');
assert.ok(Math.hypot(markX - ringCentre[0], markTop - ringCentre[1]) > radius, 'the mark is outside the ring');
assert.match(css, /transform-origin:10\.5px 10\.5px/, 'the reload spin turns around the ring centre');
assert.deepEqual(ringCentre.map((value) => Math.round(value * 10) / 10), [10.5, 10.5]);

// The check and the hard navigation stay as they were.
assert.match(notice, /version\.json\?t=/);
assert.match(notice, /document\.visibilityState === 'hidden'/);
assert.match(notice, /url\.searchParams\.set\('app_version'/);
assert.match(notice, /window\.location\.replace\(url\.href\)/);
assert.match(notice, /if \(!available \|\| reloading\) return;/, 'a second tap does not navigate twice');
// StrictMode re-runs the effect while the first request is in flight: the guard must belong to the run.
assert.doesNotMatch(notice, /useRef/);
assert.match(notice, /let checking = false;/);

// Top-right corner of the 430px app column, below the safe area; nothing left at the bottom.
const base = css.match(/^\.app-update-notice\{([^}]*)\}/m)[1];
assert.match(base, /position:fixed/);
assert.match(base, /top:calc\(env\(safe-area-inset-top\) \+ var\(--update-top\)\)/);
assert.match(base, /right:max\(var\(--update-right\), calc\(\(100vw - 430px\) \/ 2 \+ var\(--update-right\)\)\)/);
assert.doesNotMatch(base, /bottom:|left:/);
assert.doesNotMatch(css, /\.app-update-notice\{bottom:/);

// Every nested top bar of the design system lends the icon its empty right slot.
const bars = design.match(/^\.account-topbar,[^{]*(?=\{min-height:64px)/m)[0].split(',').map((item) => item.trim());
const slotRule = css.match(/body:has\(:is\(([^)]*)\)\) \.app-update-notice\{/)[1].split(',');
assert.ok(bars.length >= 8);
for (const bar of bars) assert.ok(slotRule.includes(bar), `${bar} is missing from the top-bar slot rule`);

// Occupied right slots: the icon sits just left of the home profile and account settings buttons.
assert.match(home, /<button className="profile-btn"[^]*?<\/button><\/header>/, 'the profile button is the last control of the home bar');
assert.match(css, /body:has\(\.appbar > button:last-child\) \.app-update-notice\{[^}]*--update-right:calc\(var\(--page-x\) \+ 54px\)/);
assert.match(css, /body:has\(\.account-topbar > button:last-child\) \.app-update-notice\{--update-right:calc\(var\(--page-x\) \+ 54px\)\}/);
// The workout result keeps «Готово» in that corner.
assert.match(css, /body:has\(\.completed-reference-header\) \.app-update-notice\{display:none\}/);

// Root tabs without a top bar (Тренировки, Статистика, Питание, СпортПит) do not show the icon at all.
// Home (.appbar) and details opened inside a tab (nested top bars) still do.
const rootTabs = css.match(/body:has\(\.app-bottom-nav\):not\(:has\(:is\(([^)]*)\)\)\) \.app-update-notice\{display:none\}/);
assert.ok(rootTabs, 'root tabs hide the icon');
const keepsIcon = rootTabs[1].split(',');
assert.ok(keepsIcon.includes('.appbar'), 'home keeps the icon');
for (const bar of bars) assert.ok(keepsIcon.includes(bar), `${bar} inside a root tab keeps the icon`);
assert.match(read('src/components/BottomNavigation.jsx'), /<nav className="app-bottom-nav"/, 'the root-tab marker exists');
assert.match(app, /showBottomNavigation && !menuOpen && <BottomNavigation/, 'Root tab navigation is hidden while the home drawer is open');

console.log('App update icon: top-right placement, top-bar slots and icon contract passed.');
