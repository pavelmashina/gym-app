import { supabase } from './supabase.js';
import { validateResultV2 } from './exerciseResultsV2.js';
import { describeRequestError, withDeadline } from './requestResilience.js';

const LOAD_DEADLINE_MS = 30_000;
const WRITE_DEADLINE_MS = 20_000;

// Resolves to { data, error } even if the request never finishes or rejects.
function settled(request, milliseconds = WRITE_DEADLINE_MS) {
  return withDeadline(Promise.resolve(request), milliseconds).catch((error) => ({ data: null, error }));
}

async function markRecentExerciseForSet(setId) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { data, error } = await supabase
      .from('performed_sets')
      .select('workout_session_exercises(exercise_id)')
      .eq('id', setId)
      .maybeSingle();
    if (error) throw error;
    const exerciseId = data?.workout_session_exercises?.exercise_id;
    if (!exerciseId) return;
    const { error: recentError } = await supabase.from('user_recent_exercises').upsert({
      user_id: user.id,
      exercise_id: exerciseId,
      last_used_at: new Date().toISOString(),
    }, { onConflict: 'user_id,exercise_id' });
    if (recentError) throw recentError;
  } catch (error) {
    console.error('Unable to update recent exercise from performed set:', error);
  }
}

function mapSet(row) {
  return {
    id: row.id,
    sourceScheduledSetId: row.source_scheduled_set_id ?? null,
    setNumber: row.set_number,
    setType: row.set_type,
    plannedReps: row.planned_reps,
    weight: row.weight === null ? '' : String(row.weight),
    reps: row.reps === null ? '' : String(row.reps),
    completed: row.completed,
    completedAt: row.completed_at ?? null,
    resultV2: row.result_v2 ?? null,
  };
}

async function loadExerciseNames(exerciseIds) {
  const ids = [...new Set((exerciseIds ?? []).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .in('id', ids);
  if (error) {
    // Catalog details are optional here: a session must still open from its own snapshots.
    console.error('Unable to load exercise details for a workout:', error);
    return new Map();
  }
  return new Map((data ?? []).map((row) => [row.id, row]));
}

function snapshotExerciseKey(exerciseId, snapshotName) {
  return exerciseId ?? `snapshot:${snapshotName || 'Упражнение'}`;
}

function inferMuscleGroupFromName(value) {
  const name = String(value || '').toLocaleLowerCase('ru').replace(/ё/g, 'е');
  if (!name) return '';
  if (/скручив|планк|скалолаз|скололаз/.test(name)) return 'Кор';
  if (/подтягив.*гравитрон/.test(name)) return 'Спина';
  if (/разгибан.*рук.*блок/.test(name)) return 'Трицепс';
  if (/ягодич.*мост/.test(name)) return 'Ягодицы';
  if (/жим ног|сгибан.*ног|присед|отведен.*бедр/.test(name)) return 'Ноги';
  if (/тяга.*верхн.*блок|тяга.*гантел.*пояс/.test(name)) return 'Спина';
  if (/махи.*сторон.*гантел|махи.*гантел.*сторон/.test(name)) return 'Плечи';
  if (/жим.*наклонн.*скам/.test(name)) return 'Грудь';
  if (/гиперэкстенз.*скручив/.test(name)) return 'Кор';
  return '';
}

function localDateKeyFromTimestamp(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value).slice(0, 10);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getWorkoutEntry(scheduledWorkoutId) {
  return withDeadline(readWorkoutEntry(scheduledWorkoutId), LOAD_DEADLINE_MS, 'Тренировка загружается слишком долго. Проверьте интернет и повторите.');
}

async function readWorkoutEntry(scheduledWorkoutId) {
  const { data: workout, error: workoutError } = await supabase
    .from('scheduled_workouts')
    .select('id, workout_name, scheduled_date, status, sequence_number, week_number')
    .eq('id', scheduledWorkoutId)
    .single();
  if (workoutError || !workout) throw new Error(describeRequestError(workoutError, 'Не удалось открыть тренировку.'));

  const { data: sessionRows, error: sessionError } = await supabase
    .from('workout_sessions')
    .select('id, status, started_at, ended_at, active_duration_seconds')
    .eq('scheduled_workout_id', scheduledWorkoutId)
    .order('started_at', { ascending: false })
    .limit(1);
  if (sessionError) throw new Error(describeRequestError(sessionError, 'Не удалось проверить состояние тренировки.'));

  const latestSession = sessionRows?.[0] ?? null;
  if (['active', 'completed', 'abandoned'].includes(latestSession?.status)) return loadWorkoutSession(latestSession.id);

  const { data: exerciseRows, error: exercisesError } = await supabase
    .from('scheduled_workout_exercises')
    .select('id, exercise_id, exercise_name_snapshot, prescription_snapshot, position')
    .eq('scheduled_workout_id', scheduledWorkoutId)
    .order('position', { ascending: true });
  if (exercisesError) throw new Error(describeRequestError(exercisesError, 'Не удалось загрузить упражнения тренировки.'));

  const ids = (exerciseRows ?? []).map((row) => row.id);
  const exerciseNames = await loadExerciseNames((exerciseRows ?? []).map((row) => row.exercise_id));
  let setRows = [];
  if (ids.length > 0) {
    const response = await supabase
      .from('scheduled_sets')
      .select('id, scheduled_workout_exercise_id, set_number, planned_reps')
      .in('scheduled_workout_exercise_id', ids)
      .order('set_number', { ascending: true });
    if (response.error) throw new Error(describeRequestError(response.error, 'Не удалось загрузить план подходов.'));
    setRows = response.data ?? [];
  }

  return {
    mode: 'planned',
    workout: {
      id: workout.id,
      name: workout.workout_name,
      scheduledDate: workout.scheduled_date,
      status: workout.status,
      exercises: (exerciseRows ?? []).map((row) => {
        const exercise = row.exercise_id ? exerciseNames.get(row.exercise_id) : null;
        const name = exercise?.name ?? row.exercise_name_snapshot ?? 'Упражнение';
        return {
          id: row.id,
          exerciseId: snapshotExerciseKey(row.exercise_id, row.exercise_name_snapshot),
          linkedExerciseId: row.exercise_id ?? null,
          metricContract: exercise?.measurement_type ? {exercise_id:row.exercise_id,measurement_type:exercise.measurement_type,load_mode:exercise.load_mode,laterality:exercise.laterality,measurement_note:exercise.measurement_note} : null,
          name,
          muscleGroup: exercise?.muscle_group ?? inferMuscleGroupFromName(name),
          prescription: row.prescription_snapshot ?? '',
          sets: setRows
            .filter((set) => set.scheduled_workout_exercise_id === row.id)
            .map((set) => ({ id: set.id, setNumber: set.set_number, plannedReps: set.planned_reps })),
        };
      }),
    },
  };
}

export function loadWorkoutSession(sessionId) {
  return withDeadline(readWorkoutSession(sessionId), LOAD_DEADLINE_MS, 'Тренировка загружается слишком долго. Проверьте интернет и повторите.');
}

export async function getWorkoutSessionState(sessionId) {
  const { data, error } = await settled(supabase.from('workout_sessions').select('status, paused_at, started_at, active_duration_seconds').eq('id', sessionId).maybeSingle());
  if (error) throw new Error(describeRequestError(error, 'Не удалось проверить состояние тренировки.'));
  if (!data) return null;
  return { status: data.status, paused: Boolean(data.paused_at), startedAt: data.started_at, activeDurationSeconds: data.active_duration_seconds ?? 0 };
}

export async function findActiveWorkoutId() {
  const { data, error } = await settled(supabase.from('workout_sessions').select('scheduled_workout_id').eq('status', 'active').limit(1));
  if (error) throw new Error(describeRequestError(error, 'Не удалось найти текущую тренировку.'));
  return data?.[0]?.scheduled_workout_id ?? null;
}

async function readWorkoutSession(sessionId) {
  const { data: session, error: sessionError } = await supabase
    .from('workout_sessions')
    .select('id, scheduled_workout_id, status, started_at, ended_at, completed_on, auto_completed, active_duration_seconds')
    .eq('id', sessionId)
    .single();
  if (sessionError || !session) throw new Error(describeRequestError(sessionError, 'Не удалось загрузить тренировку.'));

  const { data: workout, error: workoutError } = await supabase
    .from('scheduled_workouts')
    .select('id, workout_name, scheduled_date, status, standalone_owner_id')
    .eq('id', session.scheduled_workout_id)
    .single();
  if (workoutError || !workout) throw new Error(describeRequestError(workoutError, 'Не удалось загрузить тренировку.'));

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from('workout_session_exercises')
    .select('id, exercise_id, exercise_name_snapshot, prescription_snapshot, position, note')
    .eq('workout_session_id', sessionId)
    .order('position', { ascending: true });
  if (exerciseError) throw new Error(describeRequestError(exerciseError, 'Не удалось загрузить упражнения тренировки.'));

  const exerciseNames = await loadExerciseNames((exerciseRows ?? []).map((row) => row.exercise_id));
  const exerciseIds = (exerciseRows ?? []).map((row) => row.id);
  let setRows = [];
  if (exerciseIds.length > 0) {
    const response = await supabase
      .from('performed_sets')
      .select('*')
      .in('workout_session_exercise_id', exerciseIds)
      .order('set_number', { ascending: true });
    if (response.error) throw new Error(describeRequestError(response.error, 'Не удалось загрузить подходы тренировки.'));
    setRows = response.data ?? [];
  }

  const mode = session.status === 'completed'
    ? 'completed'
    : (session.status === 'abandoned' ? 'abandoned' : 'active');

  return {
    mode,
    session: {
      id: session.id,
      scheduledWorkoutId: session.scheduled_workout_id,
      status: session.status,
      startedAt: session.started_at,
      endedAt: session.ended_at,
      activeDurationSeconds: session.active_duration_seconds ?? 0,
      autoCompleted: Boolean(session.auto_completed),
    },
    workout: {
      id: workout.id,
      name: workout.workout_name,
      scheduledDate: workout.scheduled_date,
      completedDate: mode === 'completed' ? (session.completed_on || localDateKeyFromTimestamp(session.ended_at) || workout.scheduled_date) : null,
      standalone: Boolean(workout.standalone_owner_id),
      originalScheduledDate: workout.scheduled_date,
      status: workout.status,
      exercises: (exerciseRows ?? []).map((row) => {
        const exercise = row.exercise_id ? exerciseNames.get(row.exercise_id) : null;
        const name = exercise?.name ?? row.exercise_name_snapshot ?? 'Упражнение';
        return {
          id: row.id,
          exerciseId: snapshotExerciseKey(row.exercise_id, row.exercise_name_snapshot),
          linkedExerciseId: row.exercise_id ?? null,
          name,
          muscleGroup: exercise?.muscle_group ?? inferMuscleGroupFromName(name),
          prescription: row.prescription_snapshot ?? '',
          metricContract: exercise?.measurement_type ? {exercise_id:row.exercise_id,measurement_type:exercise.measurement_type,load_mode:exercise.load_mode,laterality:exercise.laterality,measurement_note:exercise.measurement_note} : null,
          note: row.note ?? '',
          sets: setRows.filter((set) => set.workout_session_exercise_id === row.id).map(mapSet),
        };
      }),
    },
  };
}

export async function startWorkout(scheduledWorkoutId) {
  const { data, error } = await settled(supabase.rpc('start_workout', { p_scheduled_workout_id: scheduledWorkoutId }));
  if (error || !data) {
    if (error?.message?.includes('Another workout is already active')) throw Object.assign(new Error('У вас уже есть другая активная тренировка. Сначала завершите её.'), { code: 'another-active' });
    if (error?.message?.includes('already completed')) throw new Error('Эта тренировка уже завершена.');
    if (error?.message?.includes('Skipped or cancelled')) throw new Error('Эта тренировка уже пропущена или отменена.');
    throw new Error(describeRequestError(error, 'Не удалось начать тренировку.'));
  }
  return loadWorkoutSession(data);
}

export async function startStandaloneWorkout() {
  const { data, error } = await supabase.rpc('start_standalone_workout', {
    p_local_date: localDateKeyFromTimestamp(new Date().toISOString()),
  });
  if (error || !data) {
    if (error?.code === '23505') throw new Error('У вас уже есть активная тренировка. Сначала завершите её или вернитесь к ней на главном экране.');
    throw new Error('Не удалось начать разовую тренировку. Попробуйте ещё раз.');
  }
  return data;
}

export async function addStandaloneExercise(sessionId, exerciseId) {
  const { data, error } = await settled(supabase.rpc('add_standalone_exercise', {
    p_session_id: sessionId, p_exercise_id: exerciseId,
  }));
  if (error || !data) throw new Error('Не удалось добавить упражнение. Проверьте соединение и повторите.');
  return data;
}

const performedSetWriteQueues = new Map();

async function updatePerformedSetNow(setId, values) {
  if (values.resultV2) {
    const result = {...values.resultV2, set_type:values.setType, completed:Boolean(values.completed)};
    if (validateResultV2(result).length) throw new Error('Проверьте поля результата и сторону выполнения.');
    const {data,error} = await supabase.from('performed_sets').update({result_v2:result,weight:null,reps:null,
      set_type:values.setType,completed:result.completed,completed_at:result.completed?(values.completedAt||new Date().toISOString()):null,
      updated_at:new Date().toISOString()}).eq('id',setId).select('*').single();
    if(error||!data) throw new Error('Не удалось сохранить результат. Настройки уже записанного подхода менять нельзя.');
    if (result.completed) void markRecentExerciseForSet(setId);
    return mapSet(data);
  }
  const payload = {
    set_type: values.setType,
    weight: values.weight === '' ? null : Number(values.weight),
    reps: values.reps === '' ? null : Number(values.reps),
    completed: Boolean(values.completed),
    completed_at: values.completed ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('performed_sets').update(payload).eq('id', setId);
  if (error?.code === '23514') throw new Error('Проверьте вес и повторы: значение вне допустимого диапазона.');
  if (error) throw new Error(describeRequestError(error, 'Не удалось сохранить подход.'));
  if (payload.completed) void markRecentExerciseForSet(setId);
}

export function updatePerformedSet(setId, values) {
  const previous = performedSetWriteQueues.get(setId) || Promise.resolve();
  const task = previous.catch(() => {}).then(() => withDeadline(updatePerformedSetNow(setId, values), WRITE_DEADLINE_MS, 'Не удалось сохранить подход. Проверьте интернет и повторите.'));
  performedSetWriteQueues.set(setId, task);
  void task.then(
    () => { if (performedSetWriteQueues.get(setId) === task) performedSetWriteQueues.delete(setId); },
    () => { if (performedSetWriteQueues.get(setId) === task) performedSetWriteQueues.delete(setId); },
  );
  return task;
}

export async function addPerformedSet(sessionExerciseId, setNumber, setType = 'working') {
  const { data, error } = await settled(supabase
    .from('performed_sets')
    .insert({ workout_session_exercise_id: sessionExerciseId, set_number: setNumber, set_type: setType })
    .select('*')
    .single());
  if (error?.code === '23505') {
    // An earlier attempt reached the server but its response was lost: reuse that row.
    const existing = await settled(supabase.from('performed_sets').select('*')
      .eq('workout_session_exercise_id', sessionExerciseId).eq('set_number', setNumber).maybeSingle());
    if (existing.data) return mapSet(existing.data);
  }
  if (error || !data) throw new Error(describeRequestError(error, 'Не удалось добавить подход.'));
  return mapSet(data);
}

export async function deletePerformedSet(setId) {
  const { error } = await supabase.from('performed_sets').delete().eq('id', setId);
  if (error) throw new Error('Не удалось удалить подход.');
}

export async function deleteSessionExercise(sessionExerciseId) {
  const { data, error } = await supabase
    .from('workout_session_exercises')
    .delete()
    .eq('id', sessionExerciseId)
    .select('id')
    .single();
  if (error || !data) throw new Error('Не удалось удалить упражнение.');
}

export async function updateExerciseNote(sessionExerciseId, note) {
  const { error } = await supabase.from('workout_session_exercises').update({ note }).eq('id', sessionExerciseId);
  if (error) throw new Error('Не удалось сохранить заметку.');
}

export async function getExerciseHistorySummary(exerciseKey, currentSessionId = null) {
  if (!exerciseKey) return { previous: null, best: null };

  let exerciseQuery = supabase
    .from('workout_session_exercises')
    .select('id, workout_session_id');

  if (String(exerciseKey).startsWith('snapshot:')) {
    const snapshotName = String(exerciseKey).slice('snapshot:'.length);
    exerciseQuery = exerciseQuery.is('exercise_id', null).eq('exercise_name_snapshot', snapshotName);
  } else {
    exerciseQuery = exerciseQuery.eq('exercise_id', exerciseKey);
  }

  const { data: exerciseRows, error: exerciseError } = await exerciseQuery;
  if (exerciseError) throw new Error('Не удалось загрузить историю упражнения.');

  const rows = exerciseRows ?? [];
  if (rows.length === 0) return { previous: null, best: null };

  const sessionIds = [...new Set(rows.map((row) => row.workout_session_id))];
  let sessionQuery = supabase
    .from('workout_sessions')
    .select('id, started_at, ended_at, status')
    .in('id', sessionIds)
    .eq('status', 'completed')
    .order('ended_at', { ascending: false });
  if (currentSessionId) sessionQuery = sessionQuery.neq('id', currentSessionId);

  const { data: sessions, error: sessionsError } = await sessionQuery;
  if (sessionsError) throw new Error('Не удалось загрузить историю упражнения.');
  const completedSessions = sessions ?? [];
  if (completedSessions.length === 0) return { previous: null, best: null };

  const completedSessionIds = new Set(completedSessions.map((session) => session.id));
  const completedExerciseRows = rows.filter((row) => completedSessionIds.has(row.workout_session_id));
  const completedExerciseIds = completedExerciseRows.map((row) => row.id);
  if (completedExerciseIds.length === 0) return { previous: null, best: null };

  const { data: setRows, error: setsError } = await supabase
    .from('performed_sets')
    .select('*')
    .in('workout_session_exercise_id', completedExerciseIds)
    .eq('completed', true)
    .order('set_number', { ascending: true });
  if (setsError) throw new Error('Не удалось загрузить подходы из истории.');

  const sets = setRows ?? [];
  const exerciseBySession = new Map(completedExerciseRows.map((row) => [row.workout_session_id, row.id]));
  const previousSession = completedSessions[0];
  const previousExerciseId = exerciseBySession.get(previousSession.id);
  const previousSets = sets.filter((set) => set.workout_session_exercise_id === previousExerciseId).map(mapSet);

  let best = null;
  for (const row of sets) {
    if (row.result_v2 || row.set_type !== 'working') continue;
    const weight = Number(row.weight || 0);
    const reps = Number(row.reps || 0);
    if (weight <= 0 || reps <= 0) continue;
    const estimatedOneRepMax = weight * (1 + reps / 30);
    if (!best || estimatedOneRepMax > best.estimatedOneRepMax) {
      const ownerExercise = completedExerciseRows.find((item) => item.id === row.workout_session_exercise_id);
      const ownerSession = completedSessions.find((item) => item.id === ownerExercise?.workout_session_id);
      best = {
        set: mapSet(row),
        date: ownerSession?.ended_at ?? ownerSession?.started_at ?? null,
        estimatedOneRepMax,
      };
    }
  }

  return {
    previous: { date: previousSession.ended_at ?? previousSession.started_at, sets: previousSets },
    best,
  };
}

export async function listWorkoutExerciseCatalog() {
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, muscle_group')
    .order('name', { ascending: true });
  if (error) throw new Error('Не удалось загрузить каталог упражнений.');
  return data ?? [];
}

export async function replaceSessionExercise(sessionExerciseId, exerciseId) {
  const { error } = await settled(supabase
    .from('workout_session_exercises')
    .update({ exercise_id: exerciseId, exercise_name_snapshot: null, prescription_snapshot: null, note: null })
    .eq('id', sessionExerciseId));
  if (error) throw new Error(describeRequestError(error, 'Не удалось заменить упражнение.'));
}

export async function completeWorkout(sessionId) {
  // A set saved after completion would be missing from the result the user is about to see.
  await Promise.allSettled([...performedSetWriteQueues.values()]);
  const { data, error } = await settled(supabase.rpc('complete_workout', { p_workout_session_id: sessionId }));
  if (data) return loadWorkoutSession(data);
  // The response may be lost after the server finished the session, or it may have been
  // auto-completed meanwhile. Retrying could never succeed, so trust the stored state.
  const current = await loadWorkoutSession(sessionId).catch(() => null);
  if (current && current.mode !== 'active') return current;
  throw new Error(describeRequestError(error, 'Не удалось завершить тренировку. Записанные подходы сохранены.'));
}

// Recovery path for when the regular active screen is unavailable: a paused or unreadable session.
export async function finishActiveWorkout(scheduledWorkoutId) {
  const { data, error } = await settled(supabase.from('workout_sessions').select('id, paused_at')
    .eq('scheduled_workout_id', scheduledWorkoutId).eq('status', 'active').limit(1));
  if (error) throw new Error(describeRequestError(error, 'Не удалось завершить тренировку.'));
  const session = data?.[0];
  if (!session) return getWorkoutEntry(scheduledWorkoutId);
  if (session.paused_at) {
    // Resuming first keeps pause time out of the workout duration.
    const resumed = await settled(supabase.rpc('resume_workout', { p_scheduled_workout_id: scheduledWorkoutId }));
    if (resumed.error) throw new Error(describeRequestError(resumed.error, 'Не удалось завершить тренировку.'));
  }
  return completeWorkout(session.id);
}

export async function abandonWorkout(sessionId) {
  const { data, error } = await supabase.rpc('abandon_workout', { p_workout_session_id: sessionId });
  if (error || !data) throw new Error('Не удалось прервать тренировку.');
  return loadWorkoutSession(data);
}

export async function markScheduledWorkoutCompleted(scheduledWorkoutId,date) {
  const {data,error}=await supabase.rpc('mark_scheduled_workout_completed',{
    p_scheduled_workout_id:scheduledWorkoutId,p_completed_on:date
  });
  if(error||!data) throw new Error(error?.message||'Не удалось отметить тренировку выполненной.');
  return loadWorkoutSession(data);
}
export async function changeCompletedWorkoutDate(sessionId,date) {
  const {data,error}=await supabase.rpc('change_completed_workout_date',{
    p_session_id:sessionId,p_new_date:date
  });
  if(error||!data)throw new Error(error?.message||'Не удалось изменить дату выполнения.');
  return loadWorkoutSession(data);
}
