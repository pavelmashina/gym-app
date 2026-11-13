import { supabase } from './supabase.js';
import { signVariationMedia } from './exerciseVariationSelection.js';

const EXERCISE_VIDEOS_BUCKET = 'exercise-videos';

export async function getExerciseDetails(exerciseId) {
  if (!exerciseId) return null;
  const { data, error } = await supabase
    .from('exercises')
    .select('*')
    .eq('id', exerciseId)
    .maybeSingle();
  if (error) throw new Error('Не удалось загрузить информацию об упражнении.');
  if (!data) return null;

  const variation_axes = await signVariationMedia(data.variation_axes, async path => {
    const { data: signed, error: signError } = await supabase.storage
      .from(EXERCISE_VIDEOS_BUCKET).createSignedUrl(path, 60 * 60);
    return signError ? null : (signed?.signedUrl ?? null);
  });
  let signedVideoUrl = null;
  if (data.video_path) {
    const { data: signed } = await supabase.storage.from(EXERCISE_VIDEOS_BUCKET).createSignedUrl(data.video_path, 60 * 60);
    signedVideoUrl = signed?.signedUrl ?? null;
  }
  // Photo galleries in own exercises use private storage, just like the library.
  const paths = [...new Set([
    ...(Array.isArray(data.photo_paths) ? data.photo_paths : []),
    data.photo_path,
  ].filter(path => typeof path === 'string' && path))];
  const signedPhotos = await Promise.all(paths.map(async path => {
    const { data: signed } = await supabase.storage.from('exercise-photos').createSignedUrl(path, 60 * 60);
    return signed?.signedUrl ?? null;
  }));
  const resolvedPhotoUrls = signedPhotos.filter(Boolean);
  return {
    ...data,
    variation_axes,
    resolvedVideoUrl: signedVideoUrl || data.video_url || null,
    resolvedPhotoUrls,
    resolvedPhotoUrl: resolvedPhotoUrls[0] || null,
  };
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
