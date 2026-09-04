import { supabase } from './supabase.js';

function e1rm(weight, reps) {
  const w = Number(weight || 0);
  const r = Number(reps || 0);
  if (w <= 0 || r <= 0) return 0;
  return w * (1 + r / 30);
}

function dateKey(value) {
  return value ? String(value).slice(0, 10) : '';
}

export async function loadStatistics() {
  const { data: sessions, error: sessionError } = await supabase
    .from('workout_sessions')
    .select('id, scheduled_workout_id, started_at, ended_at, active_duration_seconds')
    .eq('status', 'completed')
    .order('ended_at', { ascending: true });
  if (sessionError) throw new Error('Не удалось загрузить историю тренировок.');

  const sessionRows = sessions ?? [];
  if (sessionRows.length === 0) return { sessions: [], exercises: [], sets: [] };

  const sessionIds = sessionRows.map((row) => row.id);
  const scheduledIds = [...new Set(sessionRows.map((row) => row.scheduled_workout_id).filter(Boolean))];

  const [{ data: exerciseRows, error: exerciseError }, { data: scheduledRows, error: scheduledError }] = await Promise.all([
    supabase
      .from('workout_session_exercises')
      .select('id, workout_session_id, exercise_id, exercise_name_snapshot, position')
      .in('workout_session_id', sessionIds),
    scheduledIds.length
      ? supabase.from('scheduled_workouts').select('id, workout_name, scheduled_date').in('id', scheduledIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (exerciseError) throw new Error('Не удалось загрузить упражнения из истории.');
  if (scheduledError) throw new Error('Не удалось загрузить названия тренировок.');

  const exercises = exerciseRows ?? [];
  const exerciseIds = exercises.map((row) => row.id);
  const linkedExerciseIds = [...new Set(exercises.map((row) => row.exercise_id).filter(Boolean))];

  const [{ data: sets, error: setsError }, { data: catalogRows, error: catalogError }] = await Promise.all([
    exerciseIds.length
      ? supabase
          .from('performed_sets')
          .select('id, workout_session_exercise_id, set_number, set_type, weight, reps, completed, completed_at')
          .in('workout_session_exercise_id', exerciseIds)
          .eq('completed', true)
          .order('set_number', { ascending: true })
      : Promise.resolve({ data: [], error: null }),
    linkedExerciseIds.length
      ? supabase.from('exercises').select('id, name, muscle_group').in('id', linkedExerciseIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (setsError) throw new Error('Не удалось загрузить подходы из истории.');
  if (catalogError) throw new Error('Не удалось загрузить названия упражнений.');

  const workoutById = new Map((scheduledRows ?? []).map((row) => [row.id, row]));
  const catalogById = new Map((catalogRows ?? []).map((row) => [row.id, row]));
  const sessionById = new Map(sessionRows.map((row) => [row.id, row]));
  const exerciseById = new Map(exercises.map((row) => [row.id, row]));

  const normalizedSessions = sessionRows.map((row) => {
    const workout = workoutById.get(row.scheduled_workout_id);
    return {
      id: row.id,
      workoutName: workout?.workout_name || 'Тренировка',
      date: dateKey(row.ended_at || workout?.scheduled_date || row.started_at),
      endedAt: row.ended_at,
      durationSeconds: Number(row.active_duration_seconds || 0),
    };
  });

  const normalizedExercises = exercises.map((row) => {
    const catalog = row.exercise_id ? catalogById.get(row.exercise_id) : null;
    const session = sessionById.get(row.workout_session_id);
    return {
      id: row.id,
      sessionId: row.workout_session_id,
      exerciseKey: row.exercise_id || `snapshot:${row.exercise_name_snapshot || 'Упражнение'}`,
      name: catalog?.name || row.exercise_name_snapshot || 'Упражнение',
      muscleGroup: catalog?.muscle_group || '',
      position: Number(row.position || 0),
      date: dateKey(session?.ended_at || session?.started_at),
    };
  });

  const normalizedSets = (sets ?? []).map((row) => {
    const exercise = exerciseById.get(row.workout_session_exercise_id);
    const session = exercise ? sessionById.get(exercise.workout_session_id) : null;
    const catalog = exercise?.exercise_id ? catalogById.get(exercise.exercise_id) : null;
    const name = catalog?.name || exercise?.exercise_name_snapshot || 'Упражнение';
    const weight = Number(row.weight || 0);
    const reps = Number(row.reps || 0);
    return {
      id: row.id,
      sessionId: exercise?.workout_session_id,
      sessionExerciseId: row.workout_session_exercise_id,
      exerciseKey: exercise?.exercise_id || `snapshot:${exercise?.exercise_name_snapshot || 'Упражнение'}`,
      exerciseName: name,
      setNumber: Number(row.set_number || 0),
      setType: row.set_type,
      weight,
      reps,
      volume: row.set_type === 'working' ? weight * reps : 0,
      estimatedOneRepMax: row.set_type === 'working' ? e1rm(weight, reps) : 0,
      date: dateKey(session?.ended_at || session?.started_at),
    };
  });

  return { sessions: normalizedSessions, exercises: normalizedExercises, sets: normalizedSets };
}
