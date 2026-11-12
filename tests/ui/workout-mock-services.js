// Test-only services for the active workout stand: no production requests or account writes.
export * from './mock-services.js';

const params = new URLSearchParams(location.search);
// `exercises=0` opens a workout without exercises.
const exerciseCount = params.has('exercises') ? Math.max(0, Number(params.get('exercises')) || 0) : 8;
const setCount = Math.max(1, Number(params.get('sets')) || 6);
// `v2=1`: the second exercise has a measurement contract, so (with VITE_EXERCISE_RESULTS_V2=true)
// its empty sets are results v2 rows. `order=fail`: saving a new set order fails.
// `standalone=1`: a workout without a program. `add=fail`: adding an exercise fails.
// `save=fail`: saving a set fails as on a dead connection (#64).
// `v2=bodyweight`: the same, but pull-ups with «Повторения» and «Дополнительный вес, кг».
// `previous=1`: the last workout had these exercises, so empty cells show its values in grey (#100).
const resultsV2 = ['1', 'bodyweight'].includes(params.get('v2'));
const bodyweightV2 = params.get('v2') === 'bodyweight';
const withPrevious = params.get('previous') === '1';
const orderFails = params.get('order') === 'fail';
const standalone = params.get('standalone') === '1';
const addFails = params.get('add') === 'fail';
const saveFails = params.get('save') === 'fail';
// `planned=1`: the workout has not started, so «К тренировке» offers «Начать» and
// «Отметить выполненной» (#66). `mark=fail`: marking it done fails as on a dead connection.
const markFails = params.get('mark') === 'fail';
// `info=fail`: the first load of exercise information fails, the next ones succeed (#104).
let infoFailsLeft = params.get('info') === 'fail' ? 1 : 0;
let stage = params.get('planned') === '1' ? 'planned' : 'active';
let markedEntry = null;
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
    name: v2 ? (bodyweightV2 ? 'Подтягивания прямым хватом' : 'Жим гантелей сидя') : `Тестовое упражнение с длинным названием ${index + 1}`,
    muscleGroup: v2 ? (bodyweightV2 ? 'Спина' : 'Плечи') : index % 2 ? 'Спина' : 'Грудь',
    prescription: '',
    note: '',
    metricContract: v2 ? (bodyweightV2
      ? { exercise_id: `catalog-${index}`, measurement_type: 'bodyweight_reps', load_mode: 'bodyweight', laterality: 'bilateral', measurement_note: null }
      : { exercise_id: `catalog-${index}`, measurement_type: 'weight_reps', load_mode: 'dumbbell_each', laterality: 'bilateral', measurement_note: null }) : null,
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

const workout = { id: 'fixture-workout', name: 'Проверка прокрутки', standalone, programWorkoutId: standalone ? null : 'fixture-template', scheduledDate: new Date().toLocaleDateString('sv'), exercises: Array.from({ length: exerciseCount }, buildExercise) };
function buildEntry() {
  const { startedAt, activeDurationSeconds } = readClock();
  return { mode: 'active', session: { id: 'fixture-session', status: 'active', activeDurationSeconds, startedAt }, workout: structuredClone(workout) };
}

function buildPlannedEntry() {
  const plan = structuredClone(workout);
  plan.status = 'scheduled';
  plan.exercises = plan.exercises.map((exercise) => ({
    ...exercise,
    sets: exercise.sets.filter((set) => set.setType === 'working').map((set, index) => ({ id: set.id, setNumber: index + 1, plannedReps: set.plannedReps })),
  }));
  return { mode: 'planned', workout: plan };
}
// Like mark_scheduled_workout_completed: a completed session without time, every set done.
function buildMarkedEntry(date) {
  const now = new Date().toISOString();
  const done = structuredClone(workout);
  done.completedDate = date;
  done.exercises.forEach((exercise) => exercise.sets.forEach((set) => Object.assign(set, { reps: String(set.plannedReps), completed: true, completedAt: now })));
  return { mode: 'completed', session: { id: 'fixture-session', status: 'completed', startedAt: now, endedAt: now, activeDurationSeconds: 0, autoCompleted: false }, workout: done };
}
function currentEntry() {
  if (stage === 'planned') return buildPlannedEntry();
  return stage === 'marked' ? structuredClone(markedEntry) : buildEntry();
}

export async function getWorkoutEntry() { await pause(); return currentEntry(); }
export async function loadWorkoutSession() { await pause(); return currentEntry(); }
export async function markScheduledWorkoutCompleted(scheduledWorkoutId, date) {
  await pause(400);
  if (markFails) throw new Error('Не удалось отметить тренировку выполненной. Нет связи с сервером. Проверьте интернет и повторите.');
  (window.__markedCompleted ??= []).push({ scheduledWorkoutId, date });
  markedEntry = buildMarkedEntry(date);
  stage = 'marked';
  return structuredClone(markedEntry);
}
export async function getWorkoutSessionState() {
  const clock = readClock();
  return { status: 'active', paused: Boolean(clock.pausedAt), startedAt: clock.startedAt, activeDurationSeconds: clock.activeDurationSeconds };
}
export async function findActiveWorkoutId() { return null; }
export async function startWorkout() {
  if (stage === 'planned') { await pause(400); sessionStorage.removeItem(CLOCK_KEY); stage = 'active'; }
  return buildEntry();
}
// Like add_session_exercise: the picked exercise goes to the end of this workout with one empty set;
// scope 'program' links it to the program.
export async function addSessionExercise(_, exerciseId, scope = 'session') {
  await pause(300);
  (window.__exerciseAdds ??= []).push({ exerciseId, scope });
  if (addFails) throw new Error('Не удалось добавить упражнение.');
  const id = `exercise-added-${workout.exercises.length}`;
  workout.exercises.push({ id, exerciseId, linkedExerciseId: exerciseId, name: 'Тестовый жим', muscleGroup: 'Грудь', prescription: '', note: '', metricContract: null, addedInWorkout: scope !== 'program', sets: [{ id: `${id}-set-1`, setNumber: 1, setType: 'working', plannedReps: null, weight: '', reps: '', completed: false, completedAt: null, resultV2: null }] });
  return id;
}
export async function updatePerformedSet(_, values) {
  await pause();
  if (saveFails) throw new Error('Не удалось сохранить подход. Проверьте интернет и повторите.');
  return values;
}
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
// Last time: a warm-up and three working sets of every exercise, so the 4th working set and later get no hint.
function previousSetsOf(index) {
  const v2 = resultsV2 && index === 1;
  const legacy = [[20, 15], [40, 10], [45, 8], [45, 6]];
  const results = bodyweightV2 ? [[0, 12], [0, 8], [0, 5], [5, 4]] : [[8, 15], [22.5, 10], [22.5, 9], [20, 8]];
  return (v2 ? results : legacy).map(([weight, reps], setIndex) => ({
    id: `previous-${index}-${setIndex}`, setNumber: setIndex + 1, setType: setIndex === 0 ? 'warmup' : 'working', plannedReps: null,
    weight: v2 ? '' : String(weight), reps: v2 ? '' : String(reps), completed: true, completedAt: null,
    resultV2: v2 ? { metric_version: 'v2', measurement_type: bodyweightV2 ? 'bodyweight_reps' : 'weight_reps', load_mode: bodyweightV2 ? 'bodyweight' : 'dumbbell_each', weight_unit: 'kg', weight, reps, completed: true } : null,
  }));
}
export async function getPreviousWorkoutSets(exerciseKeys) {
  await pause(400);
  if (!withPrevious) return new Map();
  return new Map(exerciseKeys.map((key) => [key, previousSetsOf(Number(String(key).replace('catalog-', '')))]));
}
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
  if (infoFailsLeft > 0) { infoFailsLeft -= 1; throw new Error('Не удалось загрузить информацию об упражнении.'); }
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
  scheduled_workouts: () => ({ id: 'fixture-workout', scheduled_date: workout.scheduledDate, status: 'in_progress', sequence_number: 1, user_program_id: standalone ? null : 'fixture-program' }),
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
