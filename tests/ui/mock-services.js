// Test-only services: no production requests or account writes.
const exercise = { id: 'fixture-exercise', name: 'Тестовый жим', muscle_group: 'Грудь', equipment: 'Гантели' };
export const EXERCISE_MUSCLE_GROUPS = ['Все', 'Грудь', 'Спина', 'Ноги'];
export const EXERCISE_EQUIPMENT = ['Все', 'Гантели', 'Штанга', 'Свой вес'];
export async function listExerciseLibrary() { return { all: [exercise], recent: [], mine: [] }; }
export const filterExerciseList = (items) => items;
export async function markExerciseRecent() {}

// "Мои упражнения": sessionStorage plays the database, so a reload shows what was saved.
// ?state=empty|error|slow selects the list state; ?usage=fail breaks the usage check.
const MY_EXERCISES_KEY = 'my-exercises-fixture';
const fixtureParams = () => new URLSearchParams(location.search);
const myExerciseCard = (row) => ({
  ...row, isMine: true, display_muscle_group: row.muscle_group, resolvedPhotos: [], resolvedPhotoUrls: [], resolvedPhotoUrl: null,
  resolvedVideoUrl: row.video_path ? 'https://example.com/fixture.mp4' : (row.video_url || null),
});
function readMyExercises() {
  const saved = sessionStorage.getItem(MY_EXERCISES_KEY);
  if (saved) return JSON.parse(saved);
  if (fixtureParams().get('state') === 'empty') return [];
  return [
    { id: 'fixture-used', name: 'Жим из моей программы', muscle_group: 'Грудь', equipment: 'Гантели', description: 'Лопатки сведены, локти под 45°.', video_url: 'https://example.com/fixture', video_path: null },
    { id: 'fixture-file', name: 'Тяга с загруженным видео', muscle_group: 'Спина', equipment: 'Штанга', description: '', video_url: null, video_path: 'fixture/video.mp4' },
    { id: 'fixture-free', name: 'Ещё нигде не использовано', muscle_group: 'Ноги', equipment: 'Свой вес', description: '', video_url: null, video_path: null },
  ];
}
const writeMyExercises = (rows) => sessionStorage.setItem(MY_EXERCISES_KEY, JSON.stringify(rows));

export async function listMyExercises() {
  const state = fixtureParams().get('state');
  if (state === 'slow') await new Promise((resolve) => setTimeout(resolve, 15000));
  if (state === 'error') throw new Error('Не удалось загрузить ваши упражнения.');
  return readMyExercises().map(myExerciseCard);
}
export async function getCustomExerciseUsage(exerciseId) {
  if (fixtureParams().get('usage') === 'fail') throw new Error('Не удалось проверить, где используется упражнение.');
  return exerciseId === 'fixture-used'
    ? { programs: 2, scheduled: 12, history: 5, total: 19 }
    : { programs: 0, scheduled: 0, history: 0, total: 0 };
}
export async function deleteCustomExercise(exerciseId) {
  writeMyExercises(readMyExercises().filter((row) => row.id !== exerciseId));
  return { outcome: exerciseId === 'fixture-used' ? 'retired' : 'deleted' };
}
export async function createCustomExercise({ name, muscleGroup, equipment, description = '', videoUrl = '' }) {
  const row = { id: crypto.randomUUID(), name: name.trim(), muscle_group: muscleGroup, equipment, description, video_url: videoUrl || null, video_path: null };
  writeMyExercises([row, ...readMyExercises()]);
  return myExerciseCard(row);
}
export async function updateCustomExercise(exerciseId, { name, muscleGroup, equipment, description = '', videoUrl, videoFile, removeVideoFile }) {
  if (name.startsWith('Ошибка')) throw new Error('Не удалось обновить своё упражнение.');
  const rows = readMyExercises();
  const row = rows.find((item) => item.id === exerciseId);
  Object.assign(row, {
    name: name.trim(), muscle_group: muscleGroup, equipment, description,
    video_url: videoFile ? null : (videoUrl || null),
    video_path: videoFile ? 'fixture/new.mp4' : ((removeVideoFile || videoUrl) ? null : row.video_path),
  });
  writeMyExercises(rows);
  return myExerciseCard(row);
}

export async function createProgram(program) {
  if (program.name.startsWith('Ошибка')) throw new Error('Тестовая ошибка сохранения');
  return { id: 'fixture-saved', ...program };
}
export async function updateProgram() { throw new Error('Не используется в этом тесте'); }
export async function startProgram() { throw new Error('Не используется в этом тесте'); }
export async function getProgram() { throw new Error('Не используется в этом тесте'); }
export async function listPrograms() {
  return [
    { id: 'a', name: 'Дом: сила', description: '', trainingPlace: 'Дом', categories: ['Сила'], level: 'Начальный' },
    { id: 'b', name: 'Зал: кардио', description: '', trainingPlace: 'Зал', categories: ['Кардио'], level: 'Средний' },
    { id: 'c', name: 'Дом: кардио', description: '', trainingPlace: 'Дом', categories: ['Кардио'], level: 'Начальный' },
  ].map((p) => ({ ...p, structureMode: 'cycle', templateWorkoutCount: 1, cycleRepeatCount: 1, totalPlannedWorkoutCount: 1,
    participation: { status: 'completed', completedAt: '2026-10-01' } }));
}
export const listRecentCompletedPrograms = listPrograms;
export async function archiveUserProgram() { throw new Error('Не используется в этом тесте'); }
export async function listCatalogPrograms() { return []; }
export async function getCatalogProgram() { throw new Error('Не используется в этом тесте'); }
export async function adoptCatalogProgram() { throw new Error('Не используется в этом тесте'); }
