import assert from 'node:assert/strict';
import fs from 'node:fs';

const read = (path) => fs.readFileSync(path, 'utf8');
const app = read('src/App.jsx');
const html = read('index.html');
const manifest = JSON.parse(read('public/manifest.webmanifest'));
const styles = read('src/styles.css');
const design = read('src/design-system.css');

assert.match(app, /import \{ SportPitScreen \}/);
assert.match(app, /activeScreen === 'sportpit'.*<SportPitScreen/s);
assert.doesNotMatch(app, /SectionPlaceholder/);

assert.match(html, /viewport-fit=cover/);
assert.match(html, /apple-mobile-web-app-capable/);
assert.match(html, /apple-mobile-web-app-status-bar-style/);
assert.match(html, /rel="manifest"/);
assert.equal(manifest.display, 'standalone');
assert.equal(manifest.start_url, '/gym-app/');
assert.equal(manifest.scope, '/gym-app/');
assert.ok(Array.isArray(manifest.icons) && manifest.icons.length > 0);

assert.match(styles, /100dvh/);
assert.match(styles, /env\(safe-area-inset-bottom\)/);
assert.match(styles, /\.bottom-nav\s*\{[\s\S]*position:\s*fixed/);
assert.match(styles, /body[\s\S]*background:\s*var\(--bg\)/);
assert.match(design, /env\(safe-area-inset-top\)/);
assert.match(design, /env\(safe-area-inset-bottom\)/);

console.log('Mobile/PWA smoke contracts passed.');
