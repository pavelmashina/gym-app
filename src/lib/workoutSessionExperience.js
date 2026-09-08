import { supabase } from './supabase.js';

const EXERCISE_VIDEOS_BUCKET = 'exercise-videos';

export async function getExerciseDetails(exerciseId) {
  if (!exerciseId) return null;
  const { data, error } = await supabase
    .from('exercises')
    .select('id, name, muscle_group, target_muscle, synergists, exercise_type, difficulty, movement_type, technique, notes, description, video_url, video_path, equipment, owner_id')
    .eq('id', exerciseId)
    .maybeSingle();
  if (error) throw new Error('Не удалось загрузить информацию об упражнении.');
  if (!data) return null;

  let signedVideoUrl = null;
  if (data.video_path) {
    const { data: signed } = await supabase.storage.from(EXERCISE_VIDEOS_BUCKET).createSignedUrl(data.video_path, 60 * 60);
    signedVideoUrl = signed?.signedUrl ?? null;
  }
  return { ...data, resolvedVideoUrl: signedVideoUrl || data.video_url || null };
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
