// Test-only services for the active workout stand: no production requests or account writes.
export * from './mock-services.js';

const params = new URLSearchParams(location.search);
const exerciseCount = Math.max(1, Number(params.get('exercises')) || 8);
const setCount = Math.max(1, Number(params.get('sets')) || 6);
// `v2=1`: the second exercise has a measurement contract, so (with VITE_EXERCISE_RESULTS_V2=true)
// its empty sets are results v2 rows. `order=fail`: saving a new set order fails.
const resultsV2 = params.get('v2') === '1';
const orderFails = params.get('order') === 'fail';
const pause = (ms = 60) => new Promise((resolve) => setTimeout(resolve, ms));

function buildSet(exerciseIndex, setIndex, empty) {
  const warmup = setIndex === 0;
  return {
    id: `set-${exerciseIndex}-${setIndex}`,
    setNumber: setIndex + 1,
    setType: warmup ? 'warmup' : 'working',
    plannedReps: warmup ? 15 : 10,
    weight: !empty && setIndex < 2 ? String(20 + setIndex * 10) : '',
    reps: !empty && setIndex < 2 ? '10' : '',
    completed: !empty && setIndex === 0,
    completedAt: null,
    resultV2: null,
  };
}

function buildExercise(_, index) {
  const v2 = resultsV2 && index === 1;
  return {
    id: `exercise-${index}`,
    exerciseId: `catalog-${index}`,
    linkedExerciseId: `catalog-${index}`,
    name: v2 ? 'Жим гантелей сидя' : `Тестовое упражнение с длинным названием ${index + 1}`,
    muscleGroup: v2 ? 'Плечи' : index % 2 ? 'Спина' : 'Грудь',
    prescription: '',
    note: '',
    metricContract: v2 ? { exercise_id: `catalog-${index}`, measurement_type: 'weight_reps', load_mode: 'dumbbell_each', laterality: 'bilateral', measurement_note: null } : null,
    sets: Array.from({ length: setCount }, (__, setIndex) => buildSet(index, setIndex, v2)),
  };
}

// The session clock outlives a reload, like the server's: edit this record to imitate another device.
const CLOCK_KEY = 'workout-fixture-clock';
function readClock() {
  const stored = JSON.parse(sessionStorage.getItem(CLOCK_KEY) || 'null');
  if (stored) return stored;
  const clock = { startedAt: new Date().toISOString(), activeDurationSeconds: 0, pausedAt: null };
  sessionStorage.setItem(CLOCK_KEY, JSON.stringify(clock));
  return clock;
}
function writeClock(patch) { sessionStorage.setItem(CLOCK_KEY, JSON.stringify({ ...readClock(), ...patch })); }
const segmentSeconds = (clock) => Math.max(0, Math.floor((Date.now() - new Date(clock.startedAt).getTime()) / 1000));

const workout = { id: 'fixture-workout', name: 'Проверка прокрутки', standalone: false, scheduledDate: new Date().toLocaleDateString('sv'), exercises: Array.from({ length: exerciseCount }, buildExercise) };
function buildEntry() {
  const { startedAt, activeDurationSeconds } = readClock();
  return { mode: 'active', session: { id: 'fixture-session', status: 'active', activeDurationSeconds, startedAt }, workout: structuredClone(workout) };
}

export async function getWorkoutEntry() { await pause(); return buildEntry(); }
export async function loadWorkoutSession() { await pause(); return buildEntry(); }
export async function getWorkoutSessionState() {
  const clock = readClock();
  return { status: 'active', paused: Boolean(clock.pausedAt), startedAt: clock.startedAt, activeDurationSeconds: clock.activeDurationSeconds };
}
export async function findActiveWorkoutId() { return null; }
export async function startWorkout() { return buildEntry(); }
export async function addStandaloneExercise() { return buildEntry(); }
export async function updatePerformedSet(_, values) { await pause(); return values; }
export async function addPerformedSet(_, setNumber, setType = 'working') {
  await pause();
  return { id: `set-new-${crypto.randomUUID()}`, setNumber, setType, plannedReps: null, weight: '', reps: '', completed: false, completedAt: null, resultV2: null };
}
export async function reorderPerformedSets(_, orderedSetIds) {
  await pause(300);
  (window.__setOrderSaves ??= []).push(orderedSetIds);
  if (orderFails) throw new Error('Не удалось сохранить порядок подходов.');
}
export async function deletePerformedSet() { await pause(); }
export async function deleteSessionExercise() { await pause(); }
export async function updateExerciseNote() { await pause(); }
export async function getExerciseHistorySummary() { await pause(); return { best: null, previous: null }; }
export async function replaceSessionExercise() { await pause(); }
function buildCompletedEntry() {
  const clock = readClock();
  const completed = buildEntry();
  sessionStorage.removeItem(CLOCK_KEY);
  return { ...completed, mode: 'completed', session: { ...completed.session, status: 'completed', endedAt: new Date().toISOString(), activeDurationSeconds: clock.activeDurationSeconds + (clock.pausedAt ? 0 : segmentSeconds(clock)), autoCompleted: false }, workout: { ...completed.workout, completedDate: workout.scheduledDate } };
}
export async function completeWorkout() { await pause(); return buildCompletedEntry(); }
export async function finishActiveWorkout() { await pause(); return buildCompletedEntry(); }
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
  scheduled_workouts: () => ({ id: 'fixture-workout', scheduled_date: workout.scheduledDate, status: 'in_progress', sequence_number: 1, user_program_id: 'fixture-program' }),
  workout_sessions: () => [{ id: 'fixture-session', status: 'active', paused_at: readClock().pausedAt }],
};

function queryBuilder(table) {
  const result = { data: tableResults[table]?.() ?? [], error: null };
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
  rpc: async (name) => {
    const clock = readClock();
    if (name === 'pause_workout' && !clock.pausedAt) writeClock({ activeDurationSeconds: clock.activeDurationSeconds + segmentSeconds(clock), pausedAt: new Date().toISOString() });
    if (name === 'resume_workout') writeClock({ startedAt: new Date().toISOString(), pausedAt: null });
    return { data: null, error: null };
  },
  auth: { getUser: async () => ({ data: { user: { id: 'fixture-user' } }, error: null }) },
};
