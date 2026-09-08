import { supabase } from './supabase.js';

const EXERCISE_VIDEOS_BUCKET = 'exercise-videos';
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const VIDEO_EXTENSIONS = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};

export const EXERCISE_MUSCLE_GROUPS = ['Все', 'Грудь', 'Плечи', 'Спина', 'Пресс', 'Ноги', 'Бицепс', 'Икры', 'Трицепс', 'Ягодицы', 'Всё тело'];
export const EXERCISE_EQUIPMENT = ['Все', 'Гакк', 'Гантели', 'Штанга', 'Смит', 'Турник', 'Свой вес', 'Гравитрон', 'Гири', 'Тренажёр'];

export function normalizeExerciseMuscleGroup(value) {
  const source = String(value || '').trim();
  const lower = source.toLocaleLowerCase('ru');
  if (!source) return 'Всё тело';
  if (lower.startsWith('груд')) return 'Грудь';
  if (lower.startsWith('плеч')) return 'Плечи';
  if (lower.startsWith('спин')) return 'Спина';
  if (lower === 'кор' || lower.includes('пресс')) return 'Пресс';
  if (lower.startsWith('ног') || lower.includes('привод')) return 'Ноги';
  if (lower.startsWith('бицеп')) return 'Бицепс';
  if (lower === 'голень' || lower.includes('икр')) return 'Икры';
  if (lower.startsWith('трицеп')) return 'Трицепс';
  if (lower.startsWith('ягод')) return 'Ягодицы';
  if (lower === 'функционал' || lower === 'кардио' || lower.includes('всё тело') || lower.includes('все тело')) return 'Всё тело';
  return source;
}

export function normalizeExerciseEquipment(exercise) {
  const explicit = String(exercise?.equipment || '').trim();
  if (explicit) return explicit;
  const source = `${exercise?.name || ''} ${exercise?.movement_type || ''}`.toLocaleLowerCase('ru');
  if (source.includes('гакк')) return 'Гакк';
  if (source.includes('гантел')) return 'Гантели';
  if (source.includes('штанг')) return 'Штанга';
  if (source.includes('смит')) return 'Смит';
  if (source.includes('гравитрон')) return 'Гравитрон';
  if (source.includes('гир')) return 'Гири';
  if (source.includes('турник') || source.includes('подтяг')) return 'Турник';
  if (source.includes('отжим') || source.includes('планк') || source.includes('скручив') || source.includes('выпрыг')) return 'Свой вес';
  return 'Тренажёр';
}

async function signedVideoUrl(videoPath) {
  if (!videoPath) return null;
  const { data, error } = await supabase.storage.from(EXERCISE_VIDEOS_BUCKET).createSignedUrl(videoPath, 60 * 60);
  return error ? null : (data?.signedUrl ?? null);
}

function mapExercise(row, userId, resolvedVideoUrl = null) {
  return {
    ...row,
    display_muscle_group: normalizeExerciseMuscleGroup(row.muscle_group),
    equipment: normalizeExerciseEquipment(row),
    isMine: Boolean(row.owner_id && row.owner_id === userId),
    resolvedVideoUrl: resolvedVideoUrl || row.video_url || null,
  };
}

async function currentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Сессия истекла. Войдите в аккаунт ещё раз.');
  return user;
}

async function mapExercises(rows, userId) {
  return Promise.all((rows || []).map(async (row) => mapExercise(row, userId, await signedVideoUrl(row.video_path))));
}

export async function listExerciseLibrary() {
  const user = await currentUser();
  const [exerciseResult, recentResult] = await Promise.all([
    supabase
      .from('exercises')
      .select('id, name, muscle_group, target_muscle, synergists, exercise_type, difficulty, movement_type, technique, notes, description, video_url, video_path, equipment, owner_id, created_at')
      .order('name', { ascending: true }),
    supabase
      .from('user_recent_exercises')
      .select('exercise_id, last_used_at')
      .eq('user_id', user.id)
      .order('last_used_at', { ascending: false })
      .limit(10),
  ]);
  if (exerciseResult.error) throw new Error('Не удалось загрузить базу упражнений.');
  if (recentResult.error) throw new Error('Не удалось загрузить недавние упражнения.');

  const all = await mapExercises(exerciseResult.data || [], user.id);
  const byId = new Map(all.map((exercise) => [exercise.id, exercise]));
  const recent = (recentResult.data || []).map((row) => byId.get(row.exercise_id)).filter(Boolean);
  const mine = all.filter((exercise) => exercise.isMine).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return { all, mine, recent };
}

function validateVideoFile(videoFile) {
  if (!videoFile) return;
  if (!VIDEO_EXTENSIONS[videoFile.type]) throw new Error('Видео должно быть в формате MP4, WEBM или MOV.');
  if (videoFile.size > MAX_VIDEO_SIZE) throw new Error('Размер видео не должен превышать 100 МБ.');
}

function normalizeOptionalUrl(value) {
  const clean = String(value || '').trim();
  if (!clean) return null;
  try {
    const url = new URL(clean);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url.toString();
  } catch {
    throw new Error('Введите корректную ссылку на видео.');
  }
}

export async function createCustomExercise({ name, muscleGroup, equipment, description = '', videoUrl = '', videoFile = null }) {
  const user = await currentUser();
  const cleanName = String(name || '').trim();
  const cleanDescription = String(description || '').trim();
  if (!cleanName) throw new Error('Введите название упражнения.');
  if (!EXERCISE_MUSCLE_GROUPS.includes(muscleGroup) || muscleGroup === 'Все') throw new Error('Выберите группу мышц.');
  if (!EXERCISE_EQUIPMENT.includes(equipment) || equipment === 'Все') throw new Error('Выберите оборудование.');
  validateVideoFile(videoFile);
  if (videoFile && String(videoUrl || '').trim()) throw new Error('Добавьте либо видеофайл, либо ссылку на видео.');
  const cleanVideoUrl = normalizeOptionalUrl(videoUrl);

  const { data, error } = await supabase
    .from('exercises')
    .insert({
      owner_id: user.id,
      name: cleanName,
      muscle_group: muscleGroup,
      equipment,
      exercise_type: 'Пользовательское',
      movement_type: null,
      difficulty: 1,
      description: cleanDescription || null,
      video_url: cleanVideoUrl,
    })
    .select('id, name, muscle_group, target_muscle, synergists, exercise_type, difficulty, movement_type, technique, notes, description, video_url, video_path, equipment, owner_id, created_at')
    .single();
  if (error || !data) throw new Error('Не удалось сохранить упражнение.');

  let videoPath = null;
  if (videoFile) {
    const extension = VIDEO_EXTENSIONS[videoFile.type];
    videoPath = `${user.id}/${data.id}/${crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage.from(EXERCISE_VIDEOS_BUCKET).upload(videoPath, videoFile, {
      cacheControl: '3600',
      contentType: videoFile.type,
      upsert: false,
    });
    if (uploadError) {
      await supabase.from('exercises').delete().eq('id', data.id);
      throw new Error('Не удалось загрузить видео упражнения.');
    }
    const { error: updateError } = await supabase.from('exercises').update({ video_path: videoPath }).eq('id', data.id);
    if (updateError) {
      await supabase.storage.from(EXERCISE_VIDEOS_BUCKET).remove([videoPath]);
      await supabase.from('exercises').delete().eq('id', data.id);
      throw new Error('Не удалось привязать видео к упражнению.');
    }
  }

  return mapExercise({ ...data, video_path: videoPath }, user.id, await signedVideoUrl(videoPath));
}

export async function markExerciseRecent(exerciseId) {
  if (!exerciseId) return;
  const user = await currentUser();
  const { error } = await supabase.from('user_recent_exercises').upsert({
    user_id: user.id,
    exercise_id: exerciseId,
    last_used_at: new Date().toISOString(),
  }, { onConflict: 'user_id,exercise_id' });
  if (error) console.error('Unable to update recent exercises:', error);
}

export function filterExerciseList(exercises, { query = '', muscleGroup = 'Все', equipment = 'Все' } = {}) {
  const q = String(query || '').trim().toLocaleLowerCase('ru');
  return (exercises || []).filter((exercise) => {
    if (muscleGroup !== 'Все' && normalizeExerciseMuscleGroup(exercise.muscle_group) !== muscleGroup) return false;
    if (equipment !== 'Все' && normalizeExerciseEquipment(exercise) !== equipment) return false;
    if (!q) return true;
    return [exercise.name, exercise.muscle_group, exercise.target_muscle, exercise.synergists, exercise.movement_type, exercise.equipment, exercise.description]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('ru').includes(q));
  });
}
