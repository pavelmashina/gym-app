import { supabase } from './supabase.js';

export async function getExerciseDetails(exerciseId) {
  if (!exerciseId) return null;
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, muscle_group, target_muscle, synergists, exercise_type, difficulty, movement_type, technique, notes')
    .eq('id', exerciseId)
    .maybeSingle();
  if (error) throw new Error('Не удалось загрузить информацию об упражнении.');
  return data ?? null;
}

export async function reorderSessionExercises(sessionId, orderedExerciseIds, scope = 'session') {
  const { data, error } = await supabase.rpc('reorder_workout_session_exercises', {
    p_workout_session_id: sessionId,
    p_ordered_exercise_ids: orderedExerciseIds,
    p_scope: scope,
  });
  if (error || !data) {
    if (error?.message?.includes('not linked to a reusable program workout')) {
      throw new Error('Для этой тренировки нельзя применить порядок ко всем повторам программы.');
    }
    throw new Error('Не удалось сохранить новый порядок упражнений.');
  }
  return data;
}
