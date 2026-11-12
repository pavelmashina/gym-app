import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Issue #65: the exercise information during a workout scrolls like the exercise list and keeps the rest timer.
// Windows checkouts get CRLF; comments are dropped so they cannot hide or fake a rule.
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const css = (path) => read(path).replace(/\/\*[\s\S]*?\*\//g, '');
const between = (source, from, to) => {
  const start = source.indexOf(from);
  assert.notEqual(start, -1, `${from} not found`);
  const end = source.indexOf(to, start + from.length);
  assert.notEqual(end, -1, `${to} not found`);
  return source.slice(start, end);
};
const rulesOf = (source) => [...source.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
  .map(([, selector, body]) => ({ selectors: selector.split(',').map((item) => item.trim().replace(/\s+/g, ' ')), body }));

const workout = read('src/components/WorkoutSessionScreenV3.jsx');
const activeV2 = css('src/workout-session-active-v2.css');
const infoCss = css('src/workout-exercise-info-screen.css');
const swipe = read('src/lib/swipeBackNavigation.js');
const design = read('docs/design-system.md');

// 1. No second scroll container: no rule makes the information a fixed layer with a scroll of its own.
for (const file of ['src/workout-session.css', 'src/workout-session-figma.css', 'src/workout-session-active-v2.css', 'src/workout-session-active-v3.css', 'src/workout-exercise-info-media.css', 'src/workout-exercise-info-screen.css', 'src/design-system.css', 'src/ui-layout-audit.css']) {
  for (const { selectors, body } of rulesOf(css(file))) {
    if (!selectors.includes('.exercise-info-screen')) continue;
    assert.doesNotMatch(body, /position:\s*(fixed|absolute)/, `${file}: the exercise information is not a layer over the workout`);
    assert.doesNotMatch(body, /overflow(-y)?:\s*(auto|scroll)/, `${file}: the exercise information has no scroll of its own`);
    assert.doesNotMatch(body, /100vh/, `${file}: no 100vh`);
  }
}
// The exercise order stays a layer over the workout, with its own scroll.
const reorderRules = rulesOf(activeV2).filter(({ selectors }) => selectors.length === 1 && selectors[0] === '.exercise-reorder-screen').map(({ body }) => body).join(';');
assert.match(reorderRules, /position:\s*fixed/);
assert.match(reorderRules, /overscroll-behavior:\s*contain/);

// 2. While it is open, the workout header and list are hidden and the footer keeps only the rest timer.
assert.match(infoCss, /\.phone\.workout-session-phone:has\(> \.exercise-info-screen\) > \.workout-session-header,\s*\.phone\.workout-session-phone:has\(> \.exercise-info-screen\) > \.workout-session-content \{\s*display: none;/);
assert.match(infoCss, /\.phone\.workout-session-phone:has\(> \.exercise-info-screen\) \.workout-session-footer > button \{\s*display: none;/);
assert.doesNotMatch(infoCss, /\.workout-session-footer \{[^}]*display:\s*none/, 'The footer itself stays: it holds the rest timer.');
assert.doesNotMatch(infoCss, /\.rest-(countdown|timer-idle)[^{]*\{[^}]*display:\s*none/, 'The rest timer is never hidden on this screen.');
assert.match(infoCss, /> \.exercise-info-screen > main \{\s*padding-bottom: calc\(56px \+ env\(safe-area-inset-bottom\)\);/, 'The end of the description clears a running timer.');
assert.match(workout, /import '\.\.\/workout-exercise-info-screen\.css';/);

// 3. The information is a screen of the workout, rendered next to the footer, not a modal over it.
const infoScreen = between(workout, 'function ExerciseInfoScreen(', 'function ReorderExerciseScreen(');
const shared = read('src/components/ExerciseDetailsContent.jsx');
assert.match(infoScreen, /<ExerciseDetailsContent exercise=\{resolved\} \/>/);
assert.match(infoScreen, /className="training-exercise-page-content"/);
assert.match(shared, /className="training-exercise-detail-heading"/);
assert.match(shared, /className="training-exercise-detail-tags"/);
assert.match(shared, /className="training-exercise-video-empty"/);
assert.match(shared, /-webkit-line-clamp|className=\{expanded \? 'training-exercise-description-text'/);
assert.match(shared, /Подробнее/);
assert.match(shared, /Скрыть/);
assert.doesNotMatch(infoScreen, /<ExerciseTechnique|exercise-info-meta|exercise-info-hero/);

assert.match(infoScreen, /<section className="exercise-info-screen" aria-label="Упражнение"><header><button type="button" data-swipe-back aria-label="Назад" onClick=\{onClose\}>/);
assert.doesNotMatch(infoScreen, /aria-modal|role="dialog"/);
assert.match(infoScreen, /<\/main><\/section>;/);
const active = between(workout, 'function ActiveWorkout(', 'function CompletedWorkout(');
assert.match(active, /<\/footer>[\s\S]*\{exerciseInfo && <ExerciseInfoScreen /);

// 4. It opens at its top, and Back returns the list to where it was scrolled.
assert.match(active, /<main ref=\{contentRef\} className="workout-session-content active v3">/);
assert.match(active, /listScrollRef\.current = contentRef\.current\?\.closest\('\.phone'\)\?\.scrollTop \?\? 0;\s*setExerciseInfo\(\{ exercise, details: null \}\)/);
assert.match(active, /useLayoutEffect\(\(\) => \{\s*const phone = contentRef\.current\?\.closest\('\.phone'\);\s*if \(!phone\) return;\s*if \(infoOpen\) phone\.scrollTop = 0;\s*else if \(infoWasOpenRef\.current\) phone\.scrollTop = listScrollRef\.current;\s*infoWasOpenRef\.current = infoOpen;\s*\}, \[infoOpen\]\);/);
// Back tapped while the description loads must not reopen the screen.
assert.match(active, /setExerciseInfo\(\(current\) => current\?\.exercise === exercise \? \{ exercise, details \} : current\);/);

// Issue #104: a failed load shows its error in the footer; the next attempt clears it before loading,
// so the error does not stay next to information that has loaded.
const openInfo = between(active, 'async function openInfo(exercise) {', 'async function removeExercise(');
assert.match(openInfo, /setExerciseInfo\(\{ exercise, details: null \}\); setInfoLoading\(true\);[\s\S]*?setLocalError\(''\);[\s\S]*?await getExerciseDetails\(/, 'The earlier error is cleared before the new load starts.');
assert.ok(openInfo.includes("setLocalError('')") && openInfo.indexOf("setLocalError('')") < openInfo.indexOf('try {'), 'The error is cleared outside try, whatever the load ends with.');
// Only the latest request reports a failure or ends the loading state.
assert.match(active, /const infoRequestRef = useRef\(0\);/);
assert.match(openInfo, /const request = \+\+infoRequestRef\.current;/);
assert.match(openInfo, /catch \(e\) \{[\s\S]*?if \(infoRequestRef\.current === request\) setLocalError\(e\.message\);/);
assert.match(openInfo, /finally \{ if \(infoRequestRef\.current === request\) setInfoLoading\(false\); \}/);
assert.equal((openInfo.match(/setLocalError\(e\.message\)/g) || []).length, 1, 'No unguarded failure report.');
// The failure stays visible where the user is: the footer error is not hidden on the information screen.
assert.doesNotMatch(infoCss, /\.workout-(session|footer)-error[^{]*\{[^}]*display:\s*none/);
assert.match(active, /\{\(error \|\| localError\) && <div className="workout-session-error workout-footer-error" role="alert">\{error \|\| localError\}<\/div>\}/);
// The stand can reproduce it: the first load fails, the next one succeeds.
const mock = read('tests/ui/workout-mock-services.js');
assert.match(mock, /let infoFailsLeft = params\.get\('info'\) === 'fail' \? 1 : 0;/);
assert.match(between(mock, 'export async function getExerciseDetails(', 'export async function reorderSessionExercises('), /if \(infoFailsLeft > 0\) \{ infoFailsLeft -= 1; throw new Error\('Не удалось загрузить информацию об упражнении\.'\); \}/);
assert.match(design, /A failed load \(#104\)/);
assert.match(read('tests/ui/README.md'), /&info=fail/);

// 5. «Запустить» on this screen starts the rest of the exercise on screen.
assert.match(active, /const restExercise = exerciseInfo\?\.exercise \?\? workout\.exercises\.find\(/);

// 6. The back swipe still closes it: without a modal it is found among the back buttons.
assert.match(swipe, /'\.exercise-info-screen > header > button:first-child',\n\]\.join\(','\);/);
assert.match(between(swipe, 'const SCREEN_SELECTORS', '].join'), /'\.exercise-info-screen'/);

assert.match(design, /## Exercise information during a workout — November 2026 \(#65\)/);

console.log('Workout exercise information screen checks passed.');
