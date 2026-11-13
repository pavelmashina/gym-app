import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCatalogSearch } from '../src/lib/exerciseCatalogV2.js';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');

// Fake Supabase client: records inserts and updates, serves the rows in `state`.
const state = { rows: [], inserts: [], updates: [] };
function query(table) {
  let pending = null;
  const builder = {
    select() { return builder; },
    order() { return builder; },
    eq() { return builder; },
    is() { return builder; },
    neq() { return builder; },
    in() { return builder; },
    insert(payload) { state.inserts.push(payload); pending = { id: `new-${state.inserts.length}`, created_at: '2026-11-09', ...payload }; return builder; },
    update(payload) { state.updates.push(payload); pending = { id: 'own-1', owner_id: 'alice', video_path: null, ...payload }; return builder; },
    async single() {
      if (pending) return { data: pending, error: null };
      return { data: { id: 'own-1', photo_path: null, photo_paths: [] }, error: null };
    },
    async range(start, end) { return { data: table === 'exercise_catalog_v2' ? state.rows.slice(start, end + 1) : [], error: null }; },
    async limit() { return { data: [], error: null }; },
    then(resolve) { resolve({ data: [], error: null }); },
  };
  return builder;
}
globalThis.__muscleGroupTest = {
  normalizeCatalogSearch,
  client: {
    auth: { getUser: async () => ({ data: { user: { id: 'alice' } }, error: null }) },
    from: query,
    storage: { from: () => ({ createSignedUrl: async () => ({ data: null, error: null }), remove: async () => ({}) }) },
  },
};
const source = read('../src/lib/exerciseLibrary.js')
  .replace("import { supabase } from './supabase.js';", 'const supabase = globalThis.__muscleGroupTest.client;')
  .replace("import { normalizeCatalogSearch } from './exerciseCatalogV2.js';", 'const normalizeCatalogSearch = globalThis.__muscleGroupTest.normalizeCatalogSearch;')
  .replace("import.meta.env.VITE_EXERCISE_CATALOG_V2 === 'true'", 'true');
const library = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const {
  CUSTOM_EXERCISE_MUSCLE_GROUPS: choices, EXERCISE_MUSCLE_GROUPS: mainGroups, EXERCISE_MUSCLE_GROUP_OTHER: OTHER,
  normalizeExerciseMuscleGroup: normalize, resolveExerciseMuscleGroup: resolve, muscleGroupChoiceError: choiceError,
  muscleGroupDraft, exerciseMuscleGroupFilterOptions: filterOptions, filterExerciseList,
} = library;
const typed = customMuscleGroup => ({ muscleGroup: OTHER, customMuscleGroup });

// 1. The form keeps every group that older exercises could have been saved with.
assert.equal(OTHER, 'Другое');
for (const group of mainGroups.filter(group => group !== 'Все')) assert.ok(choices.includes(group), `${group} stays selectable`);
assert.ok(!choices.includes('Все') && !choices.includes(OTHER), 'Neither the filter reset nor «Другое» is a stored group');
assert.equal(new Set(choices).size, choices.length, 'No duplicate groups');
for (const group of ['Трапеции', 'Поясница', 'Предплечья', 'Квадрицепсы', 'Бицепс бедра', 'Приводящие', 'Отводящие', 'Шея', 'Кардио']) {
  assert.ok(choices.includes(group), `${group} is offered`);
}

// 2. Finer groups are filtered under a main group; groups with no parent keep their own name.
const parents = {
  Трапеции: 'Спина', Поясница: 'Спина', Квадрицепсы: 'Ноги', 'Бицепс бедра': 'Ноги', Приводящие: 'Ноги',
  Отводящие: 'Ягодицы', Кардио: 'Всё тело', Предплечья: 'Предплечья', Шея: 'Шея',
};
for (const group of choices) assert.equal(normalize(group), parents[group] ?? group, group);

// 3. The shared catalog keeps its classification: every legacy and v2 value lands in a main group.
const legacy = JSON.parse(read('../docs/exercise-catalog-v2/legacy-shared-catalog.json'));
const legacyRows = Array.isArray(legacy) ? legacy : Object.values(legacy).find(Array.isArray);
const legacyGroups = [...new Set(legacyRows.map(row => row.muscle_group))];
assert.ok(legacyGroups.length >= 15, 'Legacy catalog fixture was read');
for (const group of legacyGroups) assert.ok(mainGroups.includes(normalize(group)), `${group} → ${normalize(group)}`);
assert.equal(normalize('Ноги ЗПБ'), 'Ноги');
assert.equal(normalize('Кор'), 'Пресс');
assert.equal(normalize('Голень'), 'Икры');
assert.equal(normalize('Бицепс (эспандеры)'), 'Бицепс');
assert.equal(normalize('Функционал'), 'Всё тело');
const v2Groups = read('../data/exercise-catalog/dictionaries.mjs').match(/export const muscleGroups = \{([^}]*)\}/)[1].match(/'[^']+'/g).map(value => value.slice(1, -1));
assert.equal(v2Groups.length, 10);
for (const group of v2Groups) assert.equal(normalize(group), group, `v2 group ${group}`);

// 4. Validation of the select and of the typed «Другое» value.
assert.equal(resolve({ muscleGroup: 'Квадрицепсы' }), 'Квадрицепсы');
assert.throws(() => resolve({ muscleGroup: 'Все' }), /Выберите группу мышц/);
assert.throws(() => resolve({ muscleGroup: 'Произвольно без «Другое»' }), /Выберите группу мышц/);
assert.throws(() => resolve({}), /Выберите группу мышц/);
assert.throws(() => resolve(typed('')), /Введите название группы мышц/);
assert.throws(() => resolve(typed('   ')), /Введите название группы мышц/);
assert.throws(() => resolve(typed('ж'.repeat(41))), /не длиннее 40 символов/);
assert.equal(resolve(typed('ж'.repeat(40))), 'Ж' + 'ж'.repeat(39));
assert.throws(() => resolve(typed('123 !!')), /должно содержать буквы/);
for (const reserved of ['Другое', 'другое', 'Все', 'всё']) assert.throws(() => resolve(typed(reserved)), /конкретную группу/, reserved);
assert.equal(resolve(typed('  вращатели   плеча ')), 'Вращатели плеча', 'Spaces collapse, first letter is capitalised');
assert.equal(resolve(typed('Mm. serratus')), 'Mm. serratus', 'Latin names are accepted as typed');
assert.equal(resolve(typed('квадрицепсы')), 'Квадрицепсы', 'A typed list group is stored as the list value');
assert.equal(resolve(typed('все тело')), 'Всё тело', 'ё and е are the same letter for list matching');
assert.equal(choiceError(typed('Шея')), '');
assert.equal(choiceError(typed('')), 'Введите название группы мышц.');
assert.equal(choiceError({ muscleGroup: 'Грудь', customMuscleGroup: 'остался от «Другое»' }), '', 'Typed text is ignored once a list group is chosen');
assert.equal(resolve({ muscleGroup: 'Грудь', customMuscleGroup: 'остался от «Другое»' }), 'Грудь');

// 5. Reopening a saved exercise puts its group back where it came from.
assert.deepEqual(muscleGroupDraft('Спина'), { muscleGroup: 'Спина', customMuscleGroup: '' });
assert.deepEqual(muscleGroupDraft('Вращатели плеча'), { muscleGroup: OTHER, customMuscleGroup: 'Вращатели плеча' });
assert.deepEqual(muscleGroupDraft('Кор'), { muscleGroup: OTHER, customMuscleGroup: 'Кор' }, 'Old free values stay editable');
for (const saved of [...choices, 'Вращатели плеча', 'Кор']) assert.equal(resolve(muscleGroupDraft(saved)), saved, `round trip ${saved}`);

// 6. Create and update store the resolved value; invalid input never reaches the database.
const created = await library.createCustomExercise({ name: 'Разгибание кисти', equipment: 'Гантели', ...typed('  мышцы  кисти ') });
assert.equal(state.inserts.at(-1).muscle_group, 'Мышцы кисти');
assert.equal(created.muscle_group, 'Мышцы кисти');
assert.equal(created.display_muscle_group, 'Мышцы кисти', 'The card shows the typed group');
await library.createCustomExercise({ name: 'Шраги', equipment: 'Гантели', muscleGroup: 'Трапеции' });
assert.equal(state.inserts.at(-1).muscle_group, 'Трапеции');
const insertsBefore = state.inserts.length;
await assert.rejects(library.createCustomExercise({ name: 'Пусто', equipment: 'Гантели', ...typed(' ') }), /Введите название группы мышц/);
await assert.rejects(library.createCustomExercise({ name: 'Все', equipment: 'Гантели', muscleGroup: 'Все' }), /Выберите группу мышц/);
assert.equal(state.inserts.length, insertsBefore, 'Rejected input is not inserted');
const updated = await library.updateCustomExercise('own-1', { name: 'Разгибание кисти', equipment: 'Гантели', ...typed('Предплечья') });
assert.equal(state.updates.at(-1).muscle_group, 'Предплечья');
assert.equal(updated.display_muscle_group, 'Предплечья');
await assert.rejects(library.updateCustomExercise('own-1', { name: 'Разгибание кисти', equipment: 'Гантели', ...typed('Другое') }), /конкретную группу/);

// 7. Library: own exercises show their saved group, shared rows the main group, filters agree.
state.rows = [
  { id: 'shared-hamstrings', name: 'Сгибание ног лёжа', muscle_group: 'Ноги ЗПБ', equipment: 'Тренажёр' },
  { id: 'shared-v2', name: 'Жим лёжа', muscle_group: 'Грудь', primary_group_name_ru: 'Грудь', equipment: 'Штанга' },
  { id: 'own-old', name: 'Моё старое', muscle_group: 'Ноги', owner_id: 'alice', equipment: 'Гантели' },
  { id: 'own-quads', name: 'Мои выпады', muscle_group: 'Квадрицепсы', owner_id: 'alice', equipment: 'Гантели' },
  { id: 'own-neck', name: 'Мой мост', muscle_group: 'Шея', owner_id: 'alice', equipment: 'Свой вес' },
  { id: 'own-rotators', name: 'Мои вращения', muscle_group: 'Вращатели плеча', owner_id: 'alice', equipment: 'Гантели' },
  { id: 'own-cardio', name: 'Моя скакалка', muscle_group: 'Кардио', owner_id: 'alice', equipment: 'Свой вес' },
];
const result = await library.listExerciseLibrary();
const byId = Object.fromEntries(result.all.map(exercise => [exercise.id, exercise]));
assert.equal(byId['shared-hamstrings'].display_muscle_group, 'Ноги', 'Shared rows are unchanged');
assert.equal(byId['own-old'].display_muscle_group, 'Ноги', 'Existing own exercises are unchanged');
assert.equal(byId['own-quads'].display_muscle_group, 'Квадрицепсы');
assert.equal(byId['own-rotators'].display_muscle_group, 'Вращатели плеча');
assert.equal(byId['own-cardio'].display_muscle_group, 'Кардио');
const names = (options) => filterExerciseList(result.all, options).map(exercise => exercise.id).sort();
assert.deepEqual(names({ muscleGroup: 'Ноги' }), ['own-old', 'own-quads', 'shared-hamstrings']);
assert.deepEqual(names({ muscleGroup: 'Шея' }), ['own-neck']);
assert.deepEqual(names({ muscleGroup: 'Вращатели плеча' }), ['own-rotators']);
assert.deepEqual(names({ muscleGroup: 'Всё тело' }), ['own-cardio']);
assert.deepEqual(names({ muscleGroup: 'Грудь' }), ['shared-v2']);
assert.deepEqual(names({ query: 'вращатели' }), ['own-rotators'], 'Search finds the typed group');
assert.deepEqual(filterOptions([]), mainGroups, 'Without own exercises the filter is the old list');
assert.deepEqual(filterOptions(result.mine), [...mainGroups, 'Вращатели плеча', 'Шея'], 'Only groups outside the main ones are added');

// 8. The form wires the field in; the field offers «Другое» with a bounded text input.
// The form is shared by the picker and «Мои упражнения»; the picker keeps the filter.
const picker = read('../src/components/ExerciseLibraryPicker.jsx');
const form = read('../src/components/CustomExerciseForm.jsx');
const field = read('../src/components/MuscleGroupField.jsx');
const styles = read('../src/exercise-library-picker.css');
assert.match(form, /<MuscleGroupField muscleGroup=\{draft\.muscleGroup\} customMuscleGroup=\{draft\.customMuscleGroup\}/);
assert.match(form, /\.\.\.muscleGroupDraft\(exercise\.display_muscle_group\)/);
assert.match(form, /!muscleGroupChoiceError\(draft\)/);
assert.match(picker, /exerciseMuscleGroupFilterOptions\(library\.mine\)/);
assert.match(form, /customMuscleGroup: ''/);
assert.match(picker, /setLastChoice\(\{ \.\.\.muscleGroupDraft\(saved\.muscle_group\)/, 'The next exercise starts from the same group, a typed one included');
assert.match(field, /CUSTOM_EXERCISE_MUSCLE_GROUPS\.map/);
assert.match(field, /<option>\{EXERCISE_MUSCLE_GROUP_OTHER\}<\/option>/);
assert.match(field, /maxLength=\{MAX_MUSCLE_GROUP_LENGTH\}/);
assert.match(field, /aria-invalid=\{Boolean\(typedError\)\}/);
assert.match(styles, /\.exercise-library-muscle-other\{grid-column:1\/-1\}/);
assert.doesNotMatch(read('../src/lib/exerciseLibrary.js'), /import .*from '\.\/(?!supabase\.js'|exerciseCatalogV2\.js')/,'exerciseLibrary.js gains no imports: other tests load it from a data: URL');

console.log('Custom muscle groups: full list, «Другое» validation, storage, reopening, display and filters passed.');
