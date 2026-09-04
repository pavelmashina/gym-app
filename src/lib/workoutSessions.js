import { supabase } from './supabase.js';

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
  };
}

async function loadExerciseNames(exerciseIds) {
  const ids = [...new Set((exerciseIds ?? []).filter(Boolean))];
  if (ids.length === 0) return new Map();
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, muscle_group')
    .in('id', ids);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row]));
}

function snapshotExerciseKey(exerciseId, snapshotName) {
  return exerciseId ?? `snapshot:${snapshotName || 'Упражнение'}`;
}

export async function getWorkoutEntry(scheduledWorkoutId) {
  const { data: workout, error: workoutError } = await supabase
    .from('scheduled_workouts')
    .select('id, workout_name, scheduled_date, status, sequence_number, week_number')
    .eq('id', scheduledWorkoutId)
    .single();
  if (workoutError || !workout) throw new Error('Не удалось открыть тренировку.');

  const { data: sessionRows, error: sessionError } = await supabase
    .from('workout_sessions')
    .select('id, status, started_at, ended_at, active_duration_seconds')
    .eq('scheduled_workout_id', scheduledWorkoutId)
    .order('started_at', { ascending: false })
    .limit(1);
  if (sessionError) throw new Error('Не удалось проверить состояние тренировки.');

  const latestSession = sessionRows?.[0] ?? null;
  if (['active', 'completed', 'abandoned'].includes(latestSession?.status)) return loadWorkoutSession(latestSession.id);

  const { data: exerciseRows, error: exercisesError } = await supabase
    .from('scheduled_workout_exercises')
    .select('id, exercise_id, exercise_name_snapshot, prescription_snapshot, position')
    .eq('scheduled_workout_id', scheduledWorkoutId)
    .order('position', { ascending: true });
  if (exercisesError) throw new Error('Не удалось загрузить упражнения тренировки.');

  const ids = (exerciseRows ?? []).map((row) => row.id);
  const exerciseNames = await loadExerciseNames((exerciseRows ?? []).map((row) => row.exercise_id));
  let setRows = [];
  if (ids.length > 0) {
    const response = await supabase
      .from('scheduled_sets')
      .select('id, scheduled_workout_exercise_id, set_number, planned_reps')
      .in('scheduled_workout_exercise_id', ids)
      .order('set_number', { ascending: true });
    if (response.error) throw new Error('Не удалось загрузить план подходов.');
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
          name,
          muscleGroup: exercise?.muscle_group ?? '',
          prescription: row.prescription_snapshot ?? '',
          sets: setRows
            .filter((set) => set.scheduled_workout_exercise_id === row.id)
            .map((set) => ({ id: set.id, setNumber: set.set_number, plannedReps: set.planned_reps })),
        };
      }),
    },
  };
}

export async function loadWorkoutSession(sessionId) {
  const { data: session, error: sessionError } = await supabase
    .from('workout_sessions')
    .select('id, scheduled_workout_id, status, started_at, ended_at, active_duration_seconds')
    .eq('id', sessionId)
    .single();
  if (sessionError || !session) throw new Error('Не удалось загрузить тренировку.');

  const { data: workout, error: workoutError } = await supabase
    .from('scheduled_workouts')
    .select('id, workout_name, scheduled_date, status')
    .eq('id', session.scheduled_workout_id)
    .single();
  if (workoutError || !workout) throw new Error('Не удалось загрузить тренировку.');

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from('workout_session_exercises')
    .select('id, exercise_id, exercise_name_snapshot, prescription_snapshot, position, note')
    .eq('workout_session_id', sessionId)
    .order('position', { ascending: true });
  if (exerciseError) throw new Error('Не удалось загрузить упражнения тренировки.');

  const exerciseNames = await loadExerciseNames((exerciseRows ?? []).map((row) => row.exercise_id));
  const exerciseIds = (exerciseRows ?? []).map((row) => row.id);
  let setRows = [];
  if (exerciseIds.length > 0) {
    const response = await supabase
      .from('performed_sets')
      .select('id, workout_session_exercise_id, source_scheduled_set_id, set_number, set_type, planned_reps, weight, reps, completed, completed_at')
      .in('workout_session_exercise_id', exerciseIds)
      .order('set_number', { ascending: true });
    if (response.error) throw new Error('Не удалось загрузить подходы тренировки.');
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
    },
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
          name,
          muscleGroup: exercise?.muscle_group ?? '',
          prescription: row.prescription_snapshot ?? '',
          note: row.note ?? '',
          sets: setRows.filter((set) => set.workout_session_exercise_id === row.id).map(mapSet),
        };
      }),
    },
  };
}

export async function startWorkout(scheduledWorkoutId) {
  const { data, error } = await supabase.rpc('start_workout', { p_scheduled_workout_id: scheduledWorkoutId });
  if (error || !data) {
    if (error?.message?.includes('Another workout is already active')) throw new Error('У вас уже есть другая активная тренировка. Сначала завершите её.');
    if (error?.message?.includes('already completed')) throw new Error('Эта тренировка уже завершена.');
    if (error?.message?.includes('Skipped or cancelled')) throw new Error('Эта тренировка уже пропущена или отменена.');
    throw new Error('Не удалось начать тренировку.');
  }
  return loadWorkoutSession(data);
}

export async function updatePerformedSet(setId, values) {
  const payload = {
    set_type: values.setType,
    weight: values.weight === '' ? null : Number(values.weight),
    reps: values.reps === '' ? null : Number(values.reps),
    completed: Boolean(values.completed),
    completed_at: values.completed ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from('performed_sets').update(payload).eq('id', setId);
  if (error) throw new Error('Не удалось сохранить подход.');
}

export async function addPerformedSet(sessionExerciseId, setNumber, setType = 'working') {
  const { data, error } = await supabase
    .from('performed_sets')
    .insert({ workout_session_exercise_id: sessionExerciseId, set_number: setNumber, set_type: setType })
    .select('id, workout_session_exercise_id, source_scheduled_set_id, set_number, set_type, planned_reps, weight, reps, completed, completed_at')
    .single();
  if (error || !data) throw new Error('Не удалось добавить подход.');
  return mapSet(data);
}

export async function deletePerformedSet(setId) {
  const { error } = await supabase.from('performed_sets').delete().eq('id', setId);
  if (error) throw new Error('Не удалось удалить подход.');
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
    .select('id, workout_session_exercise_id, source_scheduled_set_id, set_number, set_type, planned_reps, weight, reps, completed, completed_at')
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
    if (row.set_type !== 'working') continue;
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
  const { error } = await supabase
    .from('workout_session_exercises')
    .update({ exercise_id: exerciseId, exercise_name_snapshot: null, prescription_snapshot: null, note: null })
    .eq('id', sessionExerciseId);
  if (error) throw new Error('Не удалось заменить упражнение.');
}

export async function completeWorkout(sessionId) {
  const { data, error } = await supabase.rpc('complete_workout', { p_workout_session_id: sessionId });
  if (error || !data) throw new Error('Не удалось завершить тренировку.');
  return loadWorkoutSession(data);
}

export async function abandonWorkout(sessionId) {
  const { data, error } = await supabase.rpc('abandon_workout', { p_workout_session_id: sessionId });
  if (error || !data) throw new Error('Не удалось прервать тренировку.');
  return loadWorkoutSession(data);
}