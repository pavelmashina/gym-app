import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
// Windows checkouts get CRLF: the multi-line selectors below are written with \n.
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const screen = read('src/components/WorkoutSessionScreenV3.jsx');
const resultSet = read('src/components/ResultSetV2.jsx');
const css = read('src/workout-exercise-card.css');
const v3Css = read('src/workout-session-active-v3.css');
const between = (text, start, end) => text.slice(text.indexOf(start), text.indexOf(end, text.indexOf(start)));
const card = between(screen, '<article className="workout-exercise-card v3"', '</article>');
const setRow = between(screen, 'function LegacySetRow(', 'function ActiveWorkout(');
const rule = (source, selector) => {
  const start = source.indexOf(`${selector} {`);
  assert.ok(start >= 0, `missing rule ${selector}`);
  return source.slice(start, source.indexOf('}', start));
};

// Issues #56 and #57: the exercise card of an active workout is recomposed, smaller and with less text.
assert.match(screen, /import '\.\.\/workout-exercise-card\.css';/);
assert.ok(card.length > 0, 'the card markup is found');

// The note field shows only an ellipsis under a short caption; the old hint and long caption are gone.
assert.match(card, /<label className="exercise-card-note-field"><span>Заметка<\/span><textarea className="exercise-card-note" rows="1" value=\{exercise\.note \?\? ''\} placeholder="…"/);
assert.doesNotMatch(screen, /Техника, ощущения/);
assert.doesNotMatch(card, /Заметка к упражнению/);

// The info icon stands for information about the exercise: it sits on the name that opens it.
assert.match(card, /<button className="exercise-card-title" type="button" onClick=\{\(\) => openInfo\(exercise\)\}>[\s\S]*?<span className="exercise-card-name">\{exercise\.name\}<InfoIcon \/><\/span><\/button>/);
// Past results open from a history button with a clock-back icon, never with the info icon.
const history = card.match(/<button className="exercise-card-history"[\s\S]*?<\/button>/)?.[0] ?? '';
assert.match(history, /onClick=\{\(\) => openHistory\(exercise\)\}/);
assert.match(history, /<HistoryIcon \/>/);
assert.doesNotMatch(history, /InfoIcon/);
assert.equal(card.match(/<InfoIcon \/>/g).length, 1, 'only the exercise name carries the info icon');
assert.doesNotMatch(screen, /'Предыдущий результат'/);

// Shorter labels, all actions in one row.
assert.match(card, />\+ Подход</);
assert.match(card, />\+ Разминка</);
assert.match(card, /'История'/);
assert.doesNotMatch(card, /Рабочий подход|Разминочный/);
assert.match(rule(css, '.exercise-card-actions'), /grid-template-columns: repeat\(3, minmax\(0, 1fr\)\)/);
// #57: the add buttons have no dashed outline.
assert.doesNotMatch(css, /dashed/);
assert.match(rule(css, '.exercise-card-actions button'), /border: 0;/);

// The unit is named once, in the column head; the weight field no longer repeats it.
assert.match(card, /<div className="exercise-set-head" aria-hidden="true"><span \/><span>\{unit === 'lb' \? 'lb' : 'кг'\}<\/span><span>Повт\.<\/span><\/div>/);
assert.match(setRow, /aria-label=\{`Вес, \$\{unit==='lb'\?'lb':'кг'\}`\} inputMode="decimal" enterKeyHint="next" placeholder="—"/);
assert.match(setRow, /aria-label="Повторы" data-reps-set-id=\{set\.id\}/);
assert.match(setRow, /aria-label="Удалить подход"/);

// Smaller controls: every field and button of a set row is 32px high.
assert.match(rule(css, '.exercise-set-row input'), /height: 32px;[\s\S]*border-radius: 10px !important;/);
assert.match(rule(css, '.exercise-set-check,\n.exercise-set-delete'), /height: 32px;/);
assert.match(rule(css, '.exercise-card-actions button'), /height: 32px;/);
assert.match(rule(css, '.exercise-card-more'), /width: 32px;\s*height: 32px;/);
assert.match(rule(css, '.exercise-card-note'), /min-height: 36px;/);
// Results v2 rows use the same sizes and icons as the other set rows.
assert.match(rule(v3Css, '.result-set-v2.compact input,\n.result-set-v2.compact select'), /height: 32px;[\s\S]*border-radius: 10px !important;/);
assert.match(rule(v3Css, '.result-set-v2-complete,\n.result-set-v2-delete'), /height: 32px;/);
assert.match(resultSet, /<CheckIcon \/>/);
assert.match(resultSet, /<TrashIcon \/>/);
assert.doesNotMatch(resultSet, /'✓'|>×</);

// One type scale: card text uses design-system tokens; 16px stays only where iOS would zoom on focus.
const sizes = [...css.matchAll(/font-size: ([^;]+);/g)].map((match) => match[1]);
assert.ok(sizes.length > 0);
for (const size of sizes) assert.match(size, /^var\(--text-(micro|caption|body|h3)\)$|^16px$/, `font-size ${size} is outside the scale`);
for (const weight of [...css.matchAll(/font-weight: ([^;]+);/g)].map((match) => match[1])) assert.match(weight, /^var\(--weight-/);
for (const [, selector] of css.matchAll(/([^{}]+)\{[^}]*font-size: 16px;/g)) assert.match(selector, /input|note/, `${selector.trim()} must use the scale`);

// Theme tokens only, so the card follows the dark theme; the one literal colour is mixed into the surface.
const colours = css.match(/#[0-9a-f]{3,8}\b/gi) ?? [];
assert.deepEqual([...new Set(colours)], ['#2e9e57']);
assert.match(rule(css, '.exercise-set-row.done'), /color-mix\(in srgb, #2e9e57 13%, var\(--surface\)\)/);

// Warm-up sets still come before working sets.
assert.match(setRow, /\$\{set\.warmup\?' warmup':''\}/);
assert.match(rule(css, '.exercise-set-row.warmup'), /order: -1;/);

// The old card markup and its styles are gone from every stylesheet.
for (const file of ['src/workout-session.css', 'src/workout-session-active-v2.css', 'src/workout-session-active-v3.css', 'src/workout-session-figma.css', 'src/ui-layout-audit.css']) {
  assert.doesNotMatch(read(file), /\.(previous-result-button|previous-result-icon|performed-set-row|performed-set-head|add-set-button|exercise-note-field|workout-exercise-name-link)\b/, `${file} still styles the old card`);
}

console.log('workout exercise card ok');
