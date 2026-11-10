import assert from 'node:assert/strict';
import fs from 'node:fs';
import { backSwipeDirection } from '../src/lib/swipeBackNavigation.js';

const read = (path) => fs.readFileSync(path, 'utf8');
const workout = read('src/components/WorkoutSessionScreenV3.jsx');
const sessionCss = read('src/workout-session.css');
const activeV2 = read('src/workout-session-active-v2.css');
const activeV3 = read('src/workout-session-active-v3.css');
const figma = read('src/workout-session-figma.css');
const design = read('src/design-system.css');

const between = (source, from, to) => {
  const start = source.indexOf(from);
  assert.notEqual(start, -1, `${from} not found`);
  const end = source.indexOf(to, start);
  assert.notEqual(end, -1, `${to} not found`);
  return source.slice(start, end);
};
// Top-level rules only: the same selector may also appear nested or as a suffix of a longer one.
const rule = (css, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`(^|\\n)${escaped} \\{[^}]*\\}`));
  assert.ok(match, `${selector} rule not found`);
  return match[0];
};

// The back swipe takes only clearly horizontal drags; the rest stays a native scroll.
assert.equal(backSwipeDirection(4, 5), null, 'Too short to tell.');
assert.equal(backSwipeDirection(40, 3), 'back', 'Horizontal drag is a swipe.');
assert.equal(backSwipeDirection(2, 30), 'scroll', 'Vertical drag scrolls.');
assert.equal(backSwipeDirection(2, -30), 'scroll', 'Upward drag scrolls.');
assert.equal(backSwipeDirection(10, 7), 'scroll', 'A scroll drifting sideways stays a scroll.');
assert.equal(backSwipeDirection(-40, 0), 'scroll', 'A drag to the left is not a swipe back.');

// Nothing re-renders the whole exercise list on a timer or while it scrolls.
const activeWorkout = between(workout, 'function ActiveWorkout(', 'function CompletedWorkout(');
assert.doesNotMatch(activeWorkout, /setInterval|IntersectionObserver/);
assert.match(activeWorkout, /<WorkoutElapsedTime session=\{session\}/);
assert.match(between(workout, 'function RestCountdown(', 'function LegacySetRow('), /useSecondTick\(timer\.endsAt\)/);
assert.match(between(workout, 'function RestCountdown(', 'function LegacySetRow('), /navigator\.vibrate/);

// .phone stays the only scroll container of the workout.
assert.match(rule(activeV3, '.workout-session-content.active.v3'), /overflow-x:\s*clip/);
assert.match(rule(sessionCss, '.phone.workout-session-phone'), /scroll-behavior:\s*auto/);
assert.match(rule(sessionCss, '.phone.workout-session-phone'), /overscroll-behavior-y:\s*contain/);
assert.match(rule(sessionCss, 'html:has(.workout-session-phone)'), /overscroll-behavior-y:\s*none/);

// Bars above the scrolling list are not re-blurred on every frame.
assert.doesNotMatch(rule(sessionCss, '.workout-session-header'), /backdrop-filter/);
assert.doesNotMatch(rule(sessionCss, '.workout-session-footer'), /backdrop-filter/);
assert.match(design, /\.workout-session-header\{background:var\(--bg\)!important;backdrop-filter:none\}/);

// Layers over the workout fit the visible screen and keep the scroll to themselves.
// The exercise information is no longer one (#65): it scrolls with .phone, see tests/workout-exercise-info-screen.mjs.
const fullScreenLayers = between(activeV2, '.exercise-reorder-screen {', '.exercise-info-screen > header,');
assert.doesNotMatch(fullScreenLayers, /100vh/, '100vh is taller than the screen while browser bars are shown.');
assert.match(fullScreenLayers, /overscroll-behavior:\s*contain/);
assert.match(between(activeV2, '.exercise-actions-popup,', '.exercise-actions-heading'), /max-height:\s*calc\(100dvh - 36px\)[\s\S]*overflow-y:\s*auto/);
assert.match(rule(figma, '.workout-modal-card'), /overscroll-behavior:\s*contain/);

// The reorder list scrolls under the finger; only the handle starts a drag.
assert.doesNotMatch(between(activeV2, '.exercise-reorder-row {', '.exercise-reorder-row.focused'), /touch-action/);
assert.match(between(activeV2, '.exercise-reorder-grip {', '.exercise-reorder-grip svg'), /touch-action:\s*none/);
const reorder = between(workout, 'function ReorderExerciseScreen(', 'function RestCountdown(');
assert.match(reorder, /className="exercise-reorder-grip" onPointerDown=/);
assert.doesNotMatch(reorder, /data-reorder-id=\{exercise\.id\} key=\{exercise\.id\} onPointer/);
assert.match(reorder, /window\.addEventListener\('pointercancel', stop\)/);

// With the keyboard open the last fields can rise above it, and the footer does not cover them;
// the delayed return keeps a tap that blurs a field on target.
const touchRules = between(sessionCss, '@media (pointer: coarse)', '.workout-session-header {');
assert.match(touchRules, /\.phone\.workout-session-phone \{\s*transition: padding-bottom 0s linear \.3s/);
assert.match(touchRules, /:has\(input:focus, textarea:focus\) \{\s*padding-bottom: 50dvh;\s*transition-delay: 0s/);
assert.match(touchRules, /\.workout-session-footer \{\s*transition: visibility 0s linear \.3s/);
assert.match(touchRules, /:has\(input:focus, textarea:focus\) \.workout-session-footer \{\s*visibility: hidden/);

console.log('Workout scroll contracts passed.');
