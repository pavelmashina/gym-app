import assert from 'node:assert/strict';
import fs from 'node:fs';
import { carouselSwipeIndex } from '../src/lib/carouselSwipe.js';

// #92: the advertising slide fills the whole banner card, the carousel has no arrows
// and the slides change by swipe. (#78 had put the arrows into gutters beside a narrower
// slide; the gutters showed as dark fields around the artwork.)
const read = (path) => fs.readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');
const css = stripComments(read('src/home-banner-swipe.css'));
const main = read('src/main.jsx');
const home = read('src/components/HomeScreen.jsx');

// The swipe rule. Left opens the next slide, right the previous one, the ends wrap around.
assert.equal(carouselSwipeIndex(0, 3, -80, 4), 1, 'A swipe to the left opens the next slide.');
assert.equal(carouselSwipeIndex(1, 3, 80, -6), 0, 'A swipe to the right opens the previous slide.');
assert.equal(carouselSwipeIndex(2, 3, -80, 0), 0, 'The last slide is followed by the first.');
assert.equal(carouselSwipeIndex(0, 3, 80, 0), 2, 'The first slide is preceded by the last.');
assert.equal(carouselSwipeIndex(1, 3, -30, 0), 1, 'A short movement or a tap changes nothing.');
assert.equal(carouselSwipeIndex(1, 3, -60, 140), 1, 'A vertical scroll that drifts sideways changes nothing.');
assert.equal(carouselSwipeIndex(1, 3, -60, 50), 1, 'A diagonal drag is not a swipe.');
assert.equal(carouselSwipeIndex(0, 1, -200, 0), 0, 'A single slide has nowhere to go.');

// No arrows anywhere: not in the markup and not in any stylesheet.
assert.doesNotMatch(home, /carousel-arrow|CarouselArrowIcon|Предыдущий баннер|Следующий баннер/, 'The banner has no arrow buttons.');
for (const file of fs.readdirSync('src').filter((name) => name.endsWith('.css'))) {
  assert.doesNotMatch(stripComments(read(`src/${file}`)), /carousel-arrow|--banner-arrow-gutter/, `${file} has no arrow or gutter rules.`);
}
assert.ok(!fs.existsSync('src/home-banner-arrows.css'), 'The gutter layout of #78 is removed.');

// The slides move horizontally, with endpoint clones for continuous looping.
assert.match(home, /import \{ carouselSwipeIndex \} from '\.\.\/lib\/carouselSwipe\.js';/);
assert.match(home, /onTouchStart=\{beginTouch\} onTouchEnd=\{endTouch\} onTouchCancel=\{cancelTouch\}/);
// The finger is read through appPoint(): the page is turned while the phone is on its side (#102).
assert.match(home, /carouselSwipeIndex\(activeSlide, BANNER_SLIDE_COUNT, dx, touch\.y - origin\.y\)/);
assert.match(home, /const BANNER_TRACK_SLIDES = \[HOME_SLIDES\[BANNER_SLIDE_COUNT - 1\], \.\.\.HOME_SLIDES, HOME_SLIDES\[0\]\]/);
assert.match(home, /onTransitionEnd=\{finishSlide\}/);
assert.match(home, /setTrackIndex\(trackIndex === 0 \? BANNER_SLIDE_COUNT : 1\)/);
assert.match(home, /window\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)/);
assert.match(home, /if \(held\) return undefined;/);
assert.match(home, /window\.setTimeout\(\(\) => \{[\s\S]*?changeSlide\(\(activeSlide \+ 1\) % BANNER_SLIDE_COUNT, 1\)/);
assert.match(home, /\}, \[activeSlide, held, snapping\]\);/);
assert.match(home, /className="banner-dot-indicator"/);
assert.match(home, /activeSlide \* 16/);
const motion = read('src/home-banner-swipe.css');
assert.match(motion, /\.banner-wrap \.banner-slide-track \{[\s\S]*?transition: transform 750ms cubic-bezier/);
assert.match(motion, /\.banner-wrap \.banner-dot-indicator \{[\s\S]*?transition: transform 750ms cubic-bezier/);
assert.match(motion, /\.banner-wrap \.dots \.dot.active::before \{ opacity: 0; \}/);
assert.match(motion, /\.banner-wrap \.dots \.dot,[\s\S]*?width: 10px;[\s\S]*?height: 6px;/, 'Fixed dot slots preserve the original pagination footprint.');
assert.match(motion, /\.banner-wrap \.banner-dot-indicator \{[\s\S]*?left: 5px;[\s\S]*?width: 18px;[\s\S]*?height: 6px;/, 'Active pagination marker keeps the original 18×6 px size.');
assert.match(motion, /transition: transform 750ms cubic-bezier\(\.4, 0, \.2, 1\)/, 'Slides move more slowly and gently.');
assert.match(motion, /@media \(prefers-reduced-motion: reduce\)/);

// The slide fills the card: the card takes the ratio of the artwork, no gutters, no padding.
const rules = Object.fromEntries([...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].map(([, selector, body]) => [selector.trim(), body]));
const bodyOf = (selector) => {
  assert.ok(rules[selector], `home-banner-swipe.css has a rule for ${selector}.`);
  return rules[selector];
};
const wrap = bodyOf('.banner-wrap');
assert.match(wrap, /touch-action: pan-y;/, 'Vertical drags on the banner still scroll the page.');
assert.doesNotMatch(wrap, /padding|grid/, 'The card keeps no room around the slide.');
const slides = bodyOf('.banner-wrap .banner-slides');
assert.match(slides, /height: auto;/, 'The fixed 190px height is released.');
assert.match(slides, /aspect-ratio: 800 \/ 385;/, 'The card has the 800 × 385 ratio of the artwork, so nothing is cropped.');
assert.doesNotMatch(slides, /grid-column|border-radius|width|margin/, 'The slide is as wide as the card.');
assert.match(bodyOf('.banner-wrap .banner-slide'), /height: 100%;/);
for (const n of [1, 2, 3]) {
  assert.match(read(`public/assets/home-slider-hq-${n}.svg`), /viewBox="0 0 800 385"/, `Slide ${n} still has the 800 × 385 artwork.`);
}
assert.doesNotMatch(css, /#[0-9a-f]{3,8}\b|rgba?\(/i, 'No literal colours.');

// Loaded after the global layers and after home-dynamic.css (imported through App → HomeScreen).
assert.match(main, /import '\.\/home-banner-swipe\.css';/);
assert.ok(main.indexOf("import App from './App.jsx';") < main.indexOf("import './home-banner-swipe.css';"));
assert.ok(main.indexOf("import './design-system.css';") < main.indexOf("import './home-banner-swipe.css';"));

console.log('home-banner-swipe: ok');
