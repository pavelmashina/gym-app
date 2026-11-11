import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { formatResultV2 } from '../src/lib/exerciseResultsV2.js';
import { KG_PER_LB, fromDisplayWeight, poundsInputToKg, toDisplayWeight, weightUnitLabel } from '../src/lib/weightUnits.js';

// Issue #101: the caption of a weight field follows the unit chosen for the exercise,
// and pounds are written «lbs» everywhere in the app.
const read = (path) => readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
const screen = read('src/components/WorkoutSessionScreenV3.jsx');
const resultSet = read('src/components/ResultSetV2.jsx');
const settings = read('src/components/SettingsScreen.jsx');

assert.equal(weightUnitLabel('lb'), 'lbs');
assert.equal(weightUnitLabel('kg'), 'кг');
assert.equal(weightUnitLabel(undefined), 'кг', 'an exercise without a chosen unit is in kilograms');

// --- «lb» is never shown: every label comes from weightUnitLabel, and no source spells the old one.
// 'lb' stays the stored value of the unit (localStorage, user_app_settings.weight_unit), so it may
// appear only as a value that is compared, passed or stored, never as text between tags or in a label.
const sources = (dir) => readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
  const path = join(dir, entry.name);
  if (entry.isDirectory()) return entry.name === 'data' ? [] : sources(path);
  return /\.(jsx?|css)$/.test(entry.name) ? [path] : [];
});
for (const path of sources('src')) {
  const text = read(path);
  assert.ok(!/>\s*lb\s*</.test(text), `${path}: «lb» as element text`);
  assert.ok(!/\(lb\)|[\d}] lb\b|, lb\b/.test(text), `${path}: «lb» inside a label`);
  assert.ok(!/\? *'lb' *: *'кг'/.test(text), `${path}: a label picked by hand instead of weightUnitLabel`);
}
assert.match(screen, /import \{ fromDisplayWeight, toDisplayWeight, weightUnitLabel \} from '\.\.\/lib\/weightUnits\.js';/);
// The switch «Единица измерения веса» of the exercise menu: «кг» and «lbs».
assert.match(screen, /<span>Единица измерения веса<\/span><div className="exercise-unit-toggle"><button className=\{unit === 'kg' \? 'active' : ''\} type="button" onClick=\{\(\) => onUnitChange\('kg'\)\}>\{weightUnitLabel\('kg'\)\}<\/button><button className=\{unit === 'lb' \? 'active' : ''\} type="button" onClick=\{\(\) => onUnitChange\('lb'\)\}>\{weightUnitLabel\('lb'\)\}<\/button>/);
// The column head and the field of a weight × reps row, and the weights of «История».
assert.match(screen, /<span>\{weightUnitLabel\(unit\)\}<\/span><span>Повт\.<\/span>/);
assert.match(screen, /aria-label=\{`Вес, \$\{weightUnitLabel\(unit\)\}`\}/);
assert.match(screen, /return display === '' \? '—' : `\$\{display\} \$\{weightUnitLabel\(unit\)\}`;/);
assert.match(settings, /<option value="lb">Фунты \(lbs\)<\/option>/);

// --- Results v2 rows: the caption names the unit, in the shared head and in every field.
assert.match(screen, /<ResultSetV2Head contract=\{headerContract\} unit=\{unit\} \/>/);
assert.match(screen, /<ResultSetV2 key=\{set\.id\} set=\{set\} previous=\{previousBySet\.get\(set\.id\)\} unit=\{unit\} /);
assert.match(resultSet, /export function ResultSetV2Head\(\{ contract, unit = 'kg' \}\)/);
assert.match(resultSet, /<span key=\{field\}>\{fieldLabel\(field, contract\?\.load_mode, unit\)\}<\/span>/);
assert.match(resultSet, /aria-label=\{fieldLabel\(field,draft\.load_mode,unit\)\}/);
assert.match(resultSet, /\? `\$\{weightCaption\(field, loadMode\)\}, \$\{weightUnitLabel\(unit\)\}` : labels\[field\];/);
assert.doesNotMatch(resultSet, /, кг'/, 'no caption of a weight field has «кг» written into it');
for (const caption of ['Вес одного снаряда', 'Штанга с грифом', 'Дополнительный вес', 'Указанный вес', 'Помощь']) {
  assert.ok(resultSet.includes(`'${caption}'`), `the caption «${caption}» is kept`);
}

// --- The caption cannot lie: with «lbs» the row shows and accepts pounds, and still stores kilograms.
assert.match(resultSet, /const inPounds = field => unit==='lb'&&WEIGHT_FIELDS\.includes\(field\);/);
assert.match(resultSet, /const shownValue = field => !inPounds\(field\) \? draft\[field\]\?\?'' : typedPounds\[field\]\?\?toDisplayWeight\(draft\[field\],unit\);/);
assert.match(resultSet, /setTypedPounds\(current=>\(\{\.\.\.current,\[field\]:value\}\)\);\n\s*patch\(field,poundsInputToKg\(value\)\);/);
assert.match(resultSet, /useEffect\(\(\)=>\{setTypedPounds\(\{\}\);\},\[unit\]\);/, 'switching the unit shows the stored value again, converted');
assert.match(resultSet, /weight_unit:'kg'/, 'a result is stored in kilograms whatever the shown unit');
assert.match(resultSet, /return inPounds\(field\)\?toDisplayWeight\(hint,unit\):hint;/, 'last time\'s value is shown in the same unit');

assert.equal(poundsInputToKg('100'), 45.359);
assert.equal(poundsInputToKg('22,5'), 10.206, 'a decimal comma is a decimal point');
assert.equal(poundsInputToKg(''), '', 'an empty field stays empty');
assert.equal(poundsInputToKg('abc'), 'abc', 'text that is not a number is left for the row to reject');
// Every pound value with up to two decimals comes back as typed.
for (let hundredths = 0; hundredths <= 60000; hundredths += 25) {
  const pounds = hundredths / 100;
  assert.equal(toDisplayWeight(poundsInputToKg(String(pounds)), 'lb'), String(pounds), `${pounds} lbs`);
}
// Kilograms are untouched by the pound path.
assert.equal(toDisplayWeight(20, 'kg'), '20');
assert.equal(toDisplayWeight(20, 'lb'), '44.09');
assert.equal(toDisplayWeight('', 'lb'), '');
assert.equal(fromDisplayWeight('44,09', 'lb'), '20');
assert.equal(fromDisplayWeight('20', 'kg'), '20');
assert.ok(Math.abs(KG_PER_LB - 0.45359237) < 1e-12);

// --- «История» of the exercise shows a results v2 set in the chosen unit; other screens keep kilograms.
const dumbbells = { weight: 10.206, reps: 12, load_mode: 'dumbbell_each' };
assert.equal(formatResultV2(dumbbells), '10.206 кг / снаряд · 12 повт.');
assert.equal(formatResultV2(dumbbells, 'lb'), '22.5 lbs / снаряд · 12 повт.');
assert.equal(formatResultV2({ assistance_weight: 20, reps: 8 }, 'lb'), 'помощь 44.09 lbs · 8 повт.');
assert.equal(formatResultV2({ assistance_weight: 20, reps: 8 }, 'kg'), 'помощь 20 кг · 8 повт.');
assert.match(screen, /formatResultV2\(set\.resultV2, unit\)/);

console.log('weight unit labels: ok');
