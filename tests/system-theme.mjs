import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

// «Как в системе» on a phone in dark mode used to reach <html> as data-theme="system": only the
// colour tokens followed the phone, the `html[data-theme='dark']` rules of the components did not,
// and the home «Питание» card stayed light under light text. Now 'system' resolves to light/dark.
const read = (file) => fs.readFileSync(file, 'utf8').replace(/\r\n/g, '\n');

// Behaviour: a fake phone whose dark mode can be switched while the app is open.
const listeners = new Set();
const phone = { matches: true, addEventListener: (type, listener) => { if (type === 'change') listeners.add(listener); } };
let matchMediaCalls = 0;
globalThis.document = { documentElement: { dataset: {} } };
globalThis.window = { matchMedia: (query) => { matchMediaCalls += 1; assert.equal(query, '(prefers-color-scheme: dark)'); return phone; } };
const switchPhone = (dark) => { phone.matches = dark; for (const listener of listeners) listener({ matches: dark }); };
const theme = () => document.documentElement.dataset.theme;

const { applyTheme, resolveTheme } = await import('../src/lib/appearance.js');

assert.equal(resolveTheme('system', true), 'dark');
assert.equal(resolveTheme('system', false), 'light');
assert.equal(resolveTheme('dark', false), 'dark');
assert.equal(resolveTheme('light', true), 'light');
assert.equal(resolveTheme(undefined, true), 'light', 'An unknown value falls back to the light theme.');

applyTheme('light');
assert.equal(theme(), 'light');
assert.equal(matchMediaCalls, 0, 'The phone mode is not watched until «Как в системе» is chosen.');

applyTheme('system');
assert.equal(theme(), 'dark', '«Как в системе» on a dark phone is the dark theme.');
switchPhone(false);
assert.equal(theme(), 'light', 'It follows the phone to light mode while the app is open.');
switchPhone(true);
assert.equal(theme(), 'dark', 'And back to dark mode.');

applyTheme('system');
assert.equal(listeners.size, 1, 'Choosing «Как в системе» again adds no second listener.');

applyTheme('light');
switchPhone(true);
assert.equal(theme(), 'light', 'An explicit light theme ignores the phone.');
applyTheme('dark');
switchPhone(false);
assert.equal(theme(), 'dark', 'An explicit dark theme ignores the phone.');

// Safari before 14: MediaQueryList has only addListener.
const legacyListeners = [];
globalThis.window = { matchMedia: () => ({ matches: false, addListener: (listener) => legacyListeners.push(listener) }) };
const legacy = await import(`../src/lib/appearance.js?legacy=${Date.now()}`);
legacy.applyTheme('system');
assert.equal(theme(), 'light');
assert.equal(legacyListeners.length, 1, 'Old Safari is watched through addListener.');

// Contracts: <html data-theme> is set only by appearance.js, and only to light or dark.
const sources = [];
const walk = (dir) => { for (const entry of fs.readdirSync(dir, { withFileTypes: true })) { const full = path.join(dir, entry.name); if (entry.isDirectory()) walk(full); else sources.push(full.replace(/\\/g, '/')); } };
walk('src');
for (const file of sources.filter((name) => /\.(jsx?|mjs)$/.test(name) && !name.endsWith('src/lib/appearance.js'))) {
  assert.doesNotMatch(read(file), /dataset\.theme\s*=|setAttribute\(\s*['"]data-theme['"]/, `${file} must set the theme through applyTheme.`);
}
for (const file of sources.filter((name) => name.endsWith('.css'))) {
  assert.doesNotMatch(read(file), /data-theme=['"]?system/, `${file}: data-theme is never "system" on <html>; write dark rules for html[data-theme='dark'].`);
}
assert.match(read('src/App.jsx'), /if \(cached\.theme\) applyTheme\(cached\.theme\);/);
assert.match(read('src/components/SettingsScreen.jsx'), /function applyLocalSettings\(next\)\{\n\s*applyTheme\(next\.theme\);/);
assert.match(read('src/components/SettingsScreen.jsx'), /localStorage\.setItem\('gym:user-settings',JSON\.stringify\(\{[^}]*theme:next\.theme/, 'The chosen value, not the resolved one, is stored.');

console.log('System theme contracts passed.');
