// Test-only services: no production requests or account writes.
const exercise = { id: 'fixture-exercise', name: 'Тестовый жим', muscle_group: 'Грудь', equipment: 'Гантели' };
export const EXERCISE_MUSCLE_GROUPS = ['Все', 'Грудь'];
export const EXERCISE_EQUIPMENT = ['Все', 'Гантели'];
export async function listExerciseLibrary() { return { all: [exercise], recent: [], mine: [] }; }
export const filterExerciseList = (items) => items;
export async function markExerciseRecent() {}
export async function createCustomExercise() { throw new Error('Не используется в этом тесте'); }
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
export async function listCatalogPrograms() { return []; }
export async function getCatalogProgram() { throw new Error('Не используется в этом тесте'); }
export async function adoptCatalogProgram() { throw new Error('Не используется в этом тесте'); }
