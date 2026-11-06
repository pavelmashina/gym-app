import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const ALICE = 'alice';
const BOB = 'bob';

// In-memory stand-in for Supabase: applies the owner RLS rules and the restricting foreign keys.
function createWorld({ exercises = [], references = {}, invisibleReferences = [], restrictCode = '23001', failing = {} } = {}) {
  const world = { exercises, references, removed: {}, uploaded: {}, writes: [], recentCleared: [] };
  const visible = row => row.owner_id === ALICE || row.owner_id == null;
  const owned = row => row.owner_id === ALICE;
  const matches = (row, op) => Object.entries(op.filters).every(([column, value]) => row[column] === value)
    && Object.entries(op.excluded).every(([column, value]) => row[column] !== value);

  function respond(op) {
    if (failing[op.table]?.includes(op.action)) return { data: null, count: null, error: { code: 'XX000', message: 'failure' } };
    if (op.table === 'user_recent_exercises') {
      if (op.action === 'delete') { world.recentCleared.push(op.filters.exercise_id); return { data: null, error: null }; }
      return { data: (world.recent || []).map(exercise_id => ({ exercise_id })), error: null };
    }
    if (op.table in REFERENCE_TABLES) {
      const count = world.references[op.table]?.[op.filters.exercise_id] || 0;
      return { data: null, count, error: null };
    }
    const rows = world.exercises.filter(visible).filter(row => matches(row, op));
    if (op.action === 'select') {
      const data = (op.ids ? rows.filter(row => op.ids.includes(row.id)) : rows).map(row => ({ ...row }));
      return op.single ? { data: data[0] ?? null, error: data[0] ? null : { code: 'PGRST116' } } : { data, error: null };
    }
    world.writes.push({ action: op.action, id: op.filters.id, payload: op.payload });
    const targets = rows.filter(owned);
    if (op.action === 'delete') {
      if (targets.some(row => invisibleReferences.includes(row.id) || referenceCount(world, row.id))) {
        return { data: null, error: { code: restrictCode, message: 'still referenced' } };
      }
      world.exercises = world.exercises.filter(row => !targets.includes(row));
      return { data: targets.map(row => ({ id: row.id })), error: null };
    }
    targets.forEach(row => Object.assign(row, op.payload));
    const updated = targets.map(row => ({ ...row }));
    return op.single ? { data: updated[0] ?? null, error: updated[0] ? null : { code: 'PGRST116' } } : { data: updated, error: null };
  }

  world.client = {
    auth: { getUser: async () => ({ data: { user: { id: ALICE } }, error: null }) },
    from(table) {
      const op = { table, action: 'select', filters: {}, excluded: {}, payload: null, single: false, ids: null };
      const query = {
        select() { return query; },
        update(payload) { op.action = 'update'; op.payload = payload; return query; },
        delete() { op.action = 'delete'; return query; },
        eq(column, value) { op.filters[column] = value; return query; },
        neq(column, value) { op.excluded[column] = value; return query; },
        order() { return query; },
        limit() { return query; },
        range() { return query; },
        in(_column, ids) { op.ids = ids; return query; },
        single() { op.single = true; return query; },
        then(resolve, reject) { return Promise.resolve(respond(op)).then(resolve, reject); },
      };
      return query;
    },
    storage: {
      from(bucket) {
        return {
          async createSignedUrl(path) { return { data: { signedUrl: `signed:${path}` }, error: null }; },
          async upload(path) {
            if (failing.upload) return { error: { message: 'upload failed' } };
            (world.uploaded[bucket] ??= []).push(path);
            return { error: null };
          },
          async remove(paths) { (world.removed[bucket] ??= []).push(...paths); return { error: null }; },
        };
      },
    },
  };
  return world;
}

const REFERENCE_TABLES = { program_workout_exercises: 1, scheduled_workout_exercises: 1, workout_session_exercises: 1 };
const referenceCount = (world, id) => Object.values(world.references).reduce((sum, counts) => sum + (counts[id] || 0), 0);

globalThis.__myExercisesTest = { client: null };
const source = read('../src/lib/exerciseLibrary.js')
  .replace("import { supabase } from './supabase.js';", 'const supabase = new Proxy({}, { get: (_target, key) => globalThis.__myExercisesTest.client[key] });')
  .replace("import { normalizeCatalogSearch } from './exerciseCatalogV2.js';", 'const normalizeCatalogSearch = value => value;')
  .replace("import { programDraftKey } from './programDraft.js';", 'const programDraftKey = userId => `draft:${userId}`;')
  .replace("import.meta.env.VITE_EXERCISE_CATALOG_V2 === 'true'", 'true');
const library = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);

function useWorld(options) {
  const world = createWorld(options);
  globalThis.__myExercisesTest.client = world.client;
  globalThis.localStorage = { getItem: () => null };
  return world;
}
const mine = (id, extra = {}) => ({ id, name: `Упражнение ${id}`, muscle_group: 'Грудь', equipment: 'Гантели', owner_id: ALICE, status: 'legacy', created_at: '2026-11-01', ...extra });

// The list shows only live exercises of the current user.
{
  useWorld({ exercises: [mine('live'), mine('gone', { status: 'retired' }), mine('foreign', { owner_id: BOB }), { ...mine('shared'), owner_id: null }] });
  assert.deepEqual((await library.listMyExercises()).map(item => item.id), ['live']);
  const items = await library.listMyExercises();
  assert.equal(items[0].isMine, true);
}
{
  useWorld({ exercises: [mine('live')], failing: { exercises: ['select'] } });
  await assert.rejects(library.listMyExercises(), /Не удалось загрузить ваши упражнения/);
}

// A deleted private exercise leaves every picker; a retired shared one is not affected by this feature.
{
  const world = useWorld({ exercises: [mine('live'), mine('gone', { status: 'retired' }), { ...mine('old-shared', { status: 'retired' }), owner_id: null }] });
  world.recent = ['gone', 'live'];
  const result = await library.listExerciseLibrary();
  assert.deepEqual(result.all.map(item => item.id).sort(), ['live', 'old-shared']);
  assert.deepEqual(result.mine.map(item => item.id), ['live']);
  assert.deepEqual(result.recent.map(item => item.id), ['live']);
}

// Usage counts come from all three layers.
{
  useWorld({ references: {
    program_workout_exercises: { used: 2 },
    scheduled_workout_exercises: { used: 12 },
    workout_session_exercises: { used: 5 },
  } });
  assert.deepEqual(await library.getCustomExerciseUsage('used'), { programs: 2, scheduled: 12, history: 5, total: 19 });
  assert.deepEqual(await library.getCustomExerciseUsage('free'), { programs: 0, scheduled: 0, history: 0, total: 0 });
}
{
  useWorld({ failing: { workout_session_exercises: ['select'] } });
  await assert.rejects(library.getCustomExerciseUsage('used'), /Не удалось проверить/);
}

// An unused exercise is really deleted, together with its media.
{
  const world = useWorld({ exercises: [mine('free', { photo_paths: ['a/1.jpg', 'a/2.jpg'], video_path: 'a/v.mp4' })] });
  const result = await library.deleteCustomExercise('free');
  assert.equal(result.outcome, 'deleted');
  assert.equal(world.exercises.length, 0);
  assert.deepEqual(world.removed['exercise-photos'], ['a/1.jpg', 'a/2.jpg']);
  assert.deepEqual(world.removed['exercise-videos'], ['a/v.mp4']);
}

// A used exercise keeps its row and media, because programs and history resolve them by ID.
for (const table of Object.keys(REFERENCE_TABLES)) {
  const world = useWorld({
    exercises: [mine('used', { photo_paths: ['a/1.jpg'], video_path: 'a/v.mp4' })],
    references: { [table]: { used: 1 } },
  });
  const result = await library.deleteCustomExercise('used');
  assert.equal(result.outcome, 'retired', table);
  assert.equal(world.exercises[0].status, 'retired');
  assert.equal(world.writes.some(write => write.action === 'delete'), false, 'never attempts a delete for a counted reference');
  assert.deepEqual(world.removed, {});
  assert.deepEqual(world.recentCleared, ['used']);
  assert.deepEqual(await library.listMyExercises(), []);
}

// A reference invisible to the count is caught by the foreign key: retire instead of failing.
// RESTRICT reports 23503 before PostgreSQL 18 and 23001 since.
for (const restrictCode of ['23503', '23001']) {
  const world = useWorld({ exercises: [mine('hidden-link', { video_path: 'a/v.mp4' })], invisibleReferences: ['hidden-link'], restrictCode });
  assert.equal((await library.deleteCustomExercise('hidden-link')).outcome, 'retired');
  assert.equal(world.exercises[0].status, 'retired');
  assert.deepEqual(world.removed, {});
}

// A program draft on this device still needs the row to save.
{
  const world = useWorld({ exercises: [mine('in-draft')] });
  globalThis.localStorage = { getItem: key => key === `draft:${ALICE}` ? JSON.stringify({ programWeeks: [{ workouts: [{ exercises: [{ id: 'in-draft' }] }] }] }) : null };
  assert.equal((await library.deleteCustomExercise('in-draft')).outcome, 'retired');
  assert.equal(world.exercises.length, 1);
}
{
  const world = useWorld({ exercises: [mine('unreadable-draft')] });
  globalThis.localStorage = { getItem() { throw new Error('blocked'); } };
  assert.equal((await library.deleteCustomExercise('unreadable-draft')).outcome, 'retired', 'unreadable storage keeps the row');
  assert.equal(world.exercises.length, 1);
}

// Someone else's exercise is untouchable even when its ID is known.
{
  const world = useWorld({ exercises: [mine('foreign', { owner_id: BOB, photo_paths: ['b/1.jpg'] }), { ...mine('shared'), owner_id: null }] });
  for (const id of ['foreign', 'shared']) {
    await assert.rejects(library.deleteCustomExercise(id), /Своё упражнение не найдено/);
    await assert.rejects(library.updateCustomExercise(id, { name: 'Захват', muscleGroup: 'Грудь', equipment: 'Гантели' }), /Своё упражнение не найдено/);
  }
  assert.deepEqual(world.writes, []);
  assert.deepEqual(world.removed, {});
  assert.equal(world.exercises[0].name, 'Упражнение foreign');
}

// Failures are reported and write nothing, or nothing further.
{
  const world = useWorld({ exercises: [mine('free')], failing: { program_workout_exercises: ['select'] } });
  await assert.rejects(library.deleteCustomExercise('free'), /Не удалось проверить/);
  assert.deepEqual(world.writes, []);
}
{
  const world = useWorld({ exercises: [mine('free', { photo_paths: ['a/1.jpg'] })], failing: { exercises: ['delete'] } });
  await assert.rejects(library.deleteCustomExercise('free'), /Не удалось удалить упражнение/);
  assert.deepEqual(world.removed, {}, 'media survives a failed delete');
}
{
  const world = useWorld({ exercises: [mine('used')], references: { workout_session_exercises: { used: 1 } }, failing: { exercises: ['update'] } });
  await assert.rejects(library.deleteCustomExercise('used'), /Не удалось удалить упражнение/);
  assert.equal(world.exercises[0].status, 'legacy');
}

// Editing changes data and video without losing what the user did not touch.
const edit = { name: 'Новое имя', muscleGroup: 'Спина', equipment: 'Штанга', description: ' Заметка ' };
const videoFile = { type: 'video/mp4', size: 1024 };
{
  const world = useWorld({ exercises: [mine('e', { video_path: 'a/old.mp4', video_url: null })] });
  const updated = await library.updateCustomExercise('e', edit);
  assert.equal(updated.name, 'Новое имя');
  assert.equal(updated.description, 'Заметка');
  assert.equal(world.exercises[0].video_path, 'a/old.mp4', 'an omitted video stays');
  assert.deepEqual(world.removed, {});
}
{
  const world = useWorld({ exercises: [mine('e', { video_url: 'https://example.com/old' })] });
  await library.updateCustomExercise('e', edit);
  assert.equal(world.exercises[0].video_url, 'https://example.com/old', 'an omitted link stays');
  await library.updateCustomExercise('e', { ...edit, videoUrl: '' });
  assert.equal(world.exercises[0].video_url, null, 'an emptied link is cleared');
}
{
  const world = useWorld({ exercises: [mine('e', { video_path: 'a/old.mp4' })] });
  const updated = await library.updateCustomExercise('e', { ...edit, videoFile });
  assert.match(world.exercises[0].video_path, /^alice\/e\/.+\.mp4$/);
  assert.deepEqual(world.removed['exercise-videos'], ['a/old.mp4'], 'the replaced file is removed');
  assert.equal(updated.resolvedVideoUrl, `signed:${world.exercises[0].video_path}`);
}
{
  const world = useWorld({ exercises: [mine('e', { video_path: 'a/old.mp4' })] });
  await library.updateCustomExercise('e', { ...edit, videoUrl: 'https://example.com/new' });
  assert.equal(world.exercises[0].video_path, null, 'a link replaces the stored file');
  assert.equal(world.exercises[0].video_url, 'https://example.com/new');
  assert.deepEqual(world.removed['exercise-videos'], ['a/old.mp4']);
}
{
  const world = useWorld({ exercises: [mine('e', { video_path: 'a/old.mp4' })] });
  await library.updateCustomExercise('e', { ...edit, videoUrl: '', removeVideoFile: true });
  assert.equal(world.exercises[0].video_path, null);
  assert.deepEqual(world.removed['exercise-videos'], ['a/old.mp4']);
}
{
  const world = useWorld({ exercises: [mine('e', { video_path: 'a/old.mp4' })], failing: { exercises: ['update'] } });
  await assert.rejects(library.updateCustomExercise('e', { ...edit, videoFile }), /Не удалось обновить/);
  assert.equal(world.removed['exercise-videos'].length, 1, 'the new upload is rolled back');
  assert.deepEqual(world.removed['exercise-videos'], world.uploaded['exercise-videos']);
  assert.equal(world.exercises[0].video_path, 'a/old.mp4');
}
{
  const world = useWorld({ exercises: [mine('e')] });
  await assert.rejects(library.updateCustomExercise('e', { ...edit, videoFile: { type: 'image/gif', size: 1 } }), /MP4, WEBM или MOV/);
  await assert.rejects(library.updateCustomExercise('e', { ...edit, videoFile, videoUrl: 'https://example.com/x' }), /либо видеофайл, либо ссылку/);
  await assert.rejects(library.updateCustomExercise('e', { ...edit, videoUrl: 'javascript:alert(1)' }), /корректную ссылку/);
  assert.deepEqual(world.writes, []);
}

// Screen contracts: navigation, states, confirmation, and one shared form and card.
const training = read('../src/components/ExercisesScreen.jsx');
const panel = read('../src/components/MyExercisesPanel.jsx');
const picker = read('../src/components/ExerciseLibraryPicker.jsx');
const styles = read('../src/my-exercises.css');
const faq = read('../src/components/MenuScreens.jsx');
assert.match(training, /\{ id: 'my-exercises', label: 'Мои упражнения' \}/);
assert.match(training, /activeTab === 'my-exercises' && <MyExercisesPanel refreshKey=\{refreshKey\} \/>/);
assert.match(styles, /data-training-tab="my-exercises"\]::before/);
assert.match(styles, /data-training-tab="my-exercises"\]\.active::before/);
assert.match(panel, /Загружаем ваши упражнения…/);
assert.match(panel, /Пока пусто/);
assert.match(panel, /setReloadKey\(\(value\) => value \+ 1\)\}>Повторить/);
assert.match(panel, /\[refreshKey, reloadKey\]/);
assert.match(panel, /role="dialog" aria-modal="true"/);
assert.match(panel, /disabled=\{pending \|\| !usage\}/, 'deletion waits for the usage check');
assert.match(panel, /onDelete=\{setDeleting\}/);
assert.doesNotMatch(picker, /onDelete=/, 'only the owner screen offers deletion');
for (const component of [panel, picker]) {
  assert.match(component, /<CustomExerciseForm /);
  assert.match(component, /<ExerciseInfoModal /);
}
assert.match(faq, /«Тренировки» → «Мои упражнения»/);
// The picker no longer lists a retired exercise, so the program editor must keep it from the workout itself.
assert.match(read('../src/components/CreateProgramCycleScreen.jsx'), /const existing = existingByCanonical\.get\(id\);\s*if \(existing\) return existing;/);

console.log('My exercises: owner-only list, safe deletion, video editing and screen contracts passed.');
