// Test-only services for the active workout stand: no production requests or account writes.
export * from './mock-services.js';

const params = new URLSearchParams(location.search);
const exerciseCount = Math.max(1, Number(params.get('exercises')) || 8);
const setCount = Math.max(1, Number(params.get('sets')) || 6);
const pause = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

function buildSet(exerciseIndex, setIndex) {
  const warmup = setIndex === 0;
  return {
    id: `set-${exerciseIndex}-${setIndex}`,
    setNumber: setIndex + 1,
    setType: warmup ? 'warmup' : 'working',
    plannedReps: warmup ? 15 : 10,
    weight: setIndex < 2 ? String(20 + setIndex * 10) : '',
    reps: setIndex < 2 ? '10' : '',
    completed: setIndex === 0,
    completedAt: null,
    resultV2: null,
  };
}

function buildExercise(_, index) {
  return {
    id: `exercise-${index}`,
    exerciseId: `catalog-${index}`,
    linkedExerciseId: `catalog-${index}`,
    name: `Тестовое упражнение с длинным названием ${index + 1}`,
    muscleGroup: index % 2 ? 'Спина' : 'Грудь',
    prescription: '',
    note: '',
    metricContract: null,
    sets: Array.from({ length: setCount }, (__, setIndex) => buildSet(index, setIndex)),
  };
}

const entry = {
  mode: 'active',
  session: { id: 'fixture-session', status: 'active', activeDurationSeconds: 0, startedAt: new Date().toISOString() },
  workout: { id: 'fixture-workout', name: 'Проверка прокрутки', standalone: false, scheduledDate: new Date().toLocaleDateString('sv'), exercises: Array.from({ length: exerciseCount }, buildExercise) },
};

export async function getWorkoutEntry() { await pause(); return structuredClone(entry); }
export async function loadWorkoutSession() { await pause(); return structuredClone(entry); }
export async function getWorkoutSessionStatus() { return 'active'; }
export async function findActiveWorkoutId() { return null; }
export async function startWorkout() { return structuredClone(entry); }
export async function addStandaloneExercise() { return structuredClone(entry); }
export async function updatePerformedSet(_, values) { await pause(); return values; }
export async function addPerformedSet(_, setNumber, setType = 'working') {
  await pause();
  return { id: `set-new-${crypto.randomUUID()}`, setNumber, setType, plannedReps: null, weight: '', reps: '', completed: false, completedAt: null, resultV2: null };
}
export async function deletePerformedSet() { await pause(); }
export async function deleteSessionExercise() { await pause(); }
export async function updateExerciseNote() { await pause(); }
export async function getExerciseHistorySummary() { await pause(); return { best: null, previous: null }; }
export async function replaceSessionExercise() { await pause(); }
export async function completeWorkout() { throw new Error('Не используется на этом стенде'); }
export async function finishActiveWorkout() { throw new Error('Не используется на этом стенде'); }
export async function changeCompletedWorkoutDate() { throw new Error('Не используется на этом стенде'); }

export async function getExerciseDetails(id) {
  await pause();
  return {
    id,
    name: 'Тестовое упражнение',
    muscle_group: 'Грудь',
    target_muscle: 'Большая грудная',
    synergists: 'Трицепс, передняя дельта',
    exercise_type: 'Базовое',
    difficulty: 2,
    technique: 'Длинное описание техники. '.repeat(40),
    description: 'Длинные подсказки к выполнению. '.repeat(40),
    resolvedVideoUrl: '',
  };
}
export async function reorderSessionExercises() { await pause(); }

export async function listExerciseConfigurations() { return []; }
export async function saveExerciseConfiguration() { throw new Error('Не используется на этом стенде'); }
export async function listEquipmentForExercise() { return []; }
export async function createEquipmentInstance() { throw new Error('Не используется на этом стенде'); }
export async function updateCustomExercise() { throw new Error('Не используется на этом стенде'); }

const tableResults = {
  scheduled_workouts: { id: 'fixture-workout', scheduled_date: entry.workout.scheduledDate, status: 'in_progress', sequence_number: 1, user_program_id: 'fixture-program' },
  workout_sessions: [{ id: 'fixture-session', status: 'active', paused_at: null }],
};

function queryBuilder(table) {
  const result = { data: tableResults[table] ?? [], error: null };
  const builder = {
    select: () => builder,
    eq: () => builder,
    gt: () => builder,
    limit: () => builder,
    single: () => builder,
    then: (resolve, reject) => pause().then(() => result).then(resolve, reject),
  };
  return builder;
}

export const isSupabaseConfigured = true;
export const supabase = {
  from: queryBuilder,
  rpc: async () => ({ data: null, error: null }),
  auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } }, error: null }) },
};
