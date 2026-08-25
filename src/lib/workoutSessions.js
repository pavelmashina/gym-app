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
  if (exerciseIds.length === 0) return new Map();
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, muscle_group')
    .in('id', [...new Set(exerciseIds)]);
  if (error) throw error;
  return new Map((data ?? []).map((row) => [row.id, row]));
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
  if (latestSession?.status === 'active' || latestSession?.status === 'completed') {
    return loadWorkoutSession(latestSession.id);
  }

  const { data: exerciseRows, error: exercisesError } = await supabase
    .from('scheduled_workout_exercises')
    .select('id, exercise_id, position')
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
        const exercise = exerciseNames.get(row.exercise_id);
        return {
          id: row.id,
          exerciseId: row.exercise_id,
          name: exercise?.name ?? 'Упражнение',
          muscleGroup: exercise?.muscle_group ?? '',
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
  if (sessionError || !session) throw new Error('Не удалось загрузить активную тренировку.');

  const { data: workout, error: workoutError } = await supabase
    .from('scheduled_workouts')
    .select('id, workout_name, scheduled_date, status')
    .eq('id', session.scheduled_workout_id)
    .single();
  if (workoutError || !workout) throw new Error('Не удалось загрузить тренировку.');

  const { data: exerciseRows, error: exerciseError } = await supabase
    .from('workout_session_exercises')
    .select('id, exercise_id, position, note')
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

  return {
    mode: session.status === 'completed' ? 'completed' : 'active',
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
        const exercise = exerciseNames.get(row.exercise_id);
        return {
          id: row.id,
          exerciseId: row.exercise_id,
          name: exercise?.name ?? 'Упражнение',
          muscleGroup: exercise?.muscle_group ?? '',
          note: row.note ?? '',
          sets: setRows
            .filter((set) => set.workout_session_exercise_id === row.id)
            .map(mapSet),
        };
      }),
    },
  };
}

export async function startWorkout(scheduledWorkoutId) {
  const { data, error } = await supabase.rpc('start_workout', {
    p_scheduled_workout_id: scheduledWorkoutId,
  });
  if (error || !data) {
    if (error?.message?.includes('Another workout is already active')) {
      throw new Error('У вас уже есть другая активная тренировка. Сначала завершите её.');
    }
    if (error?.message?.includes('already completed')) throw new Error('Эта тренировка уже завершена.');
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

export async function addPerformedSet(sessionExerciseId, setNumber) {
  const { data, error } = await supabase
    .from('performed_sets')
    .insert({ workout_session_exercise_id: sessionExerciseId, set_number: setNumber, set_type: 'working' })
    .select('id, workout_session_exercise_id, source_scheduled_set_id, set_number, set_type, planned_reps, weight, reps, completed, completed_at')
    .single();
  if (error || !data) throw new Error('Не удалось добавить подход.');
  return mapSet(data);
}

export async function updateExerciseNote(sessionExerciseId, note) {
  const { error } = await supabase
    .from('workout_session_exercises')
    .update({ note })
    .eq('id', sessionExerciseId);
  if (error) throw new Error('Не удалось сохранить заметку.');
}

export async function completeWorkout(sessionId) {
  const { data, error } = await supabase.rpc('complete_workout', {
    p_workout_session_id: sessionId,
  });
  if (error || !data) throw new Error('Не удалось завершить тренировку.');
  return loadWorkoutSession(data);
}
