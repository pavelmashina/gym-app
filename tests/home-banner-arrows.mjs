import assert from 'node:assert/strict';
import fs from 'node:fs';

// #78: the carousel arrows lay on top of the advertising slide, and the left one crossed
// the headline «ВАША РЕКЛАМА». The slide is now narrower than its card and the arrows
// stand in the gutters beside it.
const read = (path) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const css = read('src/home-banner-arrows.css');
const main = read('src/main.jsx');
const home = read('src/components/HomeScreen.jsx');

const rules = Object.fromEntries([...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)]
  .map(([, selector, body]) => [selector.trim(), body]));
const bodyOf = (selector) => {
  assert.ok(rules[selector], `home-banner-arrows.css has a rule for ${selector}.`);
  return rules[selector];
};

// The card is three columns: gutter, slide, gutter. Both gutters are one variable.
const wrap = bodyOf('.banner-wrap');
assert.match(wrap, /display: grid;/);
assert.match(wrap, /grid-template-columns: var\(--banner-arrow-gutter\) minmax\(0, 1fr\) var\(--banner-arrow-gutter\);/,
  'The slide column sits between two arrow gutters.');
const gutter = Number(wrap.match(/--banner-arrow-gutter: (\d+)px;/)?.[1]);
assert.ok(gutter >= 32, 'The gutter is wide enough for the 25px arrow glyph with air around it.');

// The slide lives only in the middle column and keeps the proportions of its artwork.
const slides = bodyOf('.banner-wrap .banner-slides');
assert.match(slides, /grid-column: 2;/);
assert.match(slides, /aspect-ratio: 800 \/ 385;/, 'The slide is not cropped: it has the 800 × 385 ratio of the SVG.');
assert.match(slides, /height: auto;/, 'The fixed 190px height is released.');
assert.match(bodyOf('.banner-wrap .banner-slide'), /height: 100%;/);
for (const n of [1, 2, 3]) {
  assert.match(read(`public/assets/home-slider-hq-${n}.svg`), /viewBox="0 0 800 385"/, `Slide ${n} still has the 800 × 385 artwork.`);
}

// The arrows leave absolute positioning, so they cannot be placed over the slide again.
const arrow = bodyOf('.banner-wrap .carousel-arrow');
assert.match(arrow, /position: static;/, 'Arrows are grid items, not overlays.');
assert.match(arrow, /transform: none;/);
assert.match(arrow, /height: var\(--topbar-control\);/, 'The touch target keeps the 44px height.');
assert.match(bodyOf('.banner-wrap .carousel-arrow.left'), /grid-column: 1;/);
assert.match(bodyOf('.banner-wrap .carousel-arrow.right'), /grid-column: 3;/);
assert.doesNotMatch(css.replace(/\/\*[\s\S]*?\*\//g, ''), /#[0-9a-f]{3,8}\b|rgba?\(/i, 'No literal colours: the card keeps its own.');

// Loaded after the global layers and after home-dynamic.css (imported through App → HomeScreen).
assert.match(main, /import '\.\/home-banner-arrows\.css';/);
assert.ok(main.indexOf("import App from './App.jsx';") < main.indexOf("import './home-banner-arrows.css';"));
assert.ok(main.indexOf("import './design-system.css';") < main.indexOf("import './home-banner-arrows.css';"));

// The markup the rules rely on.
assert.match(home, /<section className="banner-wrap"[^>]*><div className="banner-slides">/);
assert.match(home, /className="carousel-arrow left"/);
assert.match(home, /className="carousel-arrow right"/);

console.log('home-banner-arrows: ok');
