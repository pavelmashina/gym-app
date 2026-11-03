import { supabase } from './supabase.js';
import { normalizeCatalogSearch } from './exerciseCatalogV2.js';

const CATALOG_V2_ENABLED = import.meta.env.VITE_EXERCISE_CATALOG_V2 === 'true';

const EXERCISE_VIDEOS_BUCKET = 'exercise-videos';
const EXERCISE_PHOTOS_BUCKET = 'exercise-photos';
const MAX_PHOTO_SIZE = 8 * 1024 * 1024;
const PHOTO_EXTENSIONS = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' };
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
  const explicit = String(exercise?.equipment_filter || exercise?.equipment || '').trim();
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

async function signedPhotoUrl(photoPath) {
  if (!photoPath) return null;
  const { data, error } = await supabase.storage.from(EXERCISE_PHOTOS_BUCKET).createSignedUrl(photoPath, 60 * 60);
  return error ? null : (data?.signedUrl ?? null);
}

function mapExercise(row, userId, resolvedVideoUrl = null, resolvedPhotoUrl = null) {
  return {
    ...row,
    display_muscle_group: normalizeExerciseMuscleGroup(row.primary_group_name_ru || row.muscle_group),
    equipment: normalizeExerciseEquipment(row),
    isMine: Boolean(row.owner_id && row.owner_id === userId),
    resolvedVideoUrl: resolvedVideoUrl || row.video_url || null,
    resolvedPhotoUrl: resolvedPhotoUrl || null,
  };
}

async function currentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Сессия истекла. Войдите в аккаунт ещё раз.');
  return user;
}

async function mapExercises(rows, userId) {
  return Promise.all((rows || []).map(async row => {
    const [video, photo] = await Promise.all([signedVideoUrl(row.video_path), signedPhotoUrl(row.photo_path)]);
    return mapExercise(row, userId, video, photo);
  }));
}

async function loadCatalogRows() {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from(CATALOG_V2_ENABLED ? 'exercise_catalog_v2' : 'exercises')
      .select('*').order('name', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499);
    if (result.error) return result;
    rows.push(...(result.data || []));
    if ((result.data || []).length < 500) return { data: rows, error: null };
  }
}

export async function listExerciseLibrary() {
  const user = await currentUser();
  const [exerciseResult, recentResult, photoResult] = await Promise.all([
    loadCatalogRows(),
    supabase
      .from('user_recent_exercises')
      .select('exercise_id, last_used_at')
      .eq('user_id', user.id)
      .order('last_used_at', { ascending: false })
      .limit(5),
    // Catalog v2 is an existing view without photo_path; get owned paths separately.
    supabase.from('exercises').select('id,photo_path').eq('owner_id', user.id),
  ]);
  if (photoResult.error) throw new Error('Не удалось загрузить фотографии ваших упражнений.');
  if (exerciseResult.error) throw new Error('Не удалось загрузить базу упражнений.');
  if (recentResult.error) throw new Error('Не удалось загрузить недавние упражнения.');

  const photoPaths = new Map((photoResult.data || []).map(item => [item.id, item.photo_path]));
  const all = await mapExercises((exerciseResult.data || []).map(row =>
    row.owner_id === user.id ? { ...row, photo_path: photoPaths.get(row.id) ?? null } : row
  ), user.id);
  const byId = new Map(all.map((exercise) => [exercise.id, exercise]));
  // Old history references keep their original IDs; they are not silently remapped.
  const missingRecent = (recentResult.data || []).map(row => row.exercise_id).filter(id => !byId.has(id));
  if (!CATALOG_V2_ENABLED && missingRecent.length) {
    const result = await supabase.from('exercises').select('*').in('id', missingRecent);
    if (result.error) throw new Error('Не удалось загрузить недавние упражнения.');
    for (const exercise of await mapExercises(result.data, user.id)) {
      byId.set(exercise.id, exercise);
      // Historical IDs belong in Recent, not in the canonical All catalogue.
      // pick() includes a selected historical row in its callback explicitly.
    }
  }
  const recent = (recentResult.data || []).map((row) => byId.get(row.exercise_id)).filter(Boolean);
  const mine = all.filter((exercise) => exercise.isMine).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return { all, mine, recent };
}

function validatePhotoFile(photoFile) {
  if (!photoFile) return;
  if (!PHOTO_EXTENSIONS[photoFile.type]) throw new Error('Фото должно быть в формате JPEG, PNG или WebP.');
  if (photoFile.size > MAX_PHOTO_SIZE) throw new Error('Размер фото не должен превышать 8 МБ.');
}
async function uploadExercisePhoto(userId, exerciseId, photoFile) {
  const path = `${userId}/${exerciseId}/${crypto.randomUUID()}.${PHOTO_EXTENSIONS[photoFile.type]}`;
  const { error } = await supabase.storage.from(EXERCISE_PHOTOS_BUCKET).upload(path, photoFile, {
    cacheControl: '3600', contentType: photoFile.type, upsert: false,
  });
  if (error) throw new Error('Не удалось загрузить фото упражнения.');
  return path;
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

export async function createCustomExercise({ name, muscleGroup, equipment, description = '', videoUrl = '', videoFile = null, photoFile = null }) {
  const user = await currentUser();
  const cleanName = String(name || '').trim();
  const cleanDescription = String(description || '').trim();
  if (!cleanName) throw new Error('Введите название упражнения.');
  if (!EXERCISE_MUSCLE_GROUPS.includes(muscleGroup) || muscleGroup === 'Все') throw new Error('Выберите группу мышц.');
  if (!EXERCISE_EQUIPMENT.includes(equipment) || equipment === 'Все') throw new Error('Выберите оборудование.');
  validateVideoFile(videoFile);
  validatePhotoFile(photoFile);
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
      movement_type: 'Пользовательское',
      difficulty: 1,
      description: cleanDescription || null,
      video_url: cleanVideoUrl,
    })
    .select('id, name, muscle_group, target_muscle, synergists, exercise_type, difficulty, movement_type, technique, notes, description, video_url, video_path, photo_path, equipment, owner_id, created_at')
    .single();
  if (error || !data) {
    console.error('Unable to save custom exercise:', error);
    throw new Error('Не удалось сохранить упражнение.');
  }

  let videoPath = null;
  let photoPath = null;
  try {
    if (videoFile) {
      const ext = VIDEO_EXTENSIONS[videoFile.type];
      videoPath = `${user.id}/${data.id}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadError } = await supabase.storage.from(EXERCISE_VIDEOS_BUCKET).upload(videoPath, videoFile, {
        cacheControl:'3600',contentType:videoFile.type,upsert:false,
      });
      if (uploadError) throw new Error('Не удалось загрузить видео упражнения.');
    }
    if (photoFile) photoPath = await uploadExercisePhoto(user.id, data.id, photoFile);
    if (videoPath || photoPath) {
      const { error: attachError } = await supabase.from('exercises').update({
        ...(videoPath ? { video_path:videoPath } : {}),
        ...(photoPath ? { photo_path:photoPath } : {}),
      }).eq('id',data.id).eq('owner_id',user.id);
      if (attachError) throw new Error('Не удалось привязать медиафайлы к упражнению.');
    }
  } catch (error) {
    await Promise.all([
      videoPath ? supabase.storage.from(EXERCISE_VIDEOS_BUCKET).remove([videoPath]) : Promise.resolve(),
      photoPath ? supabase.storage.from(EXERCISE_PHOTOS_BUCKET).remove([photoPath]) : Promise.resolve(),
    ]);
    await supabase.from('exercises').delete().eq('id',data.id).eq('owner_id',user.id);
    throw error;
  }
  const [signedVideo,signedPhoto] = await Promise.all([signedVideoUrl(videoPath),signedPhotoUrl(photoPath)]);
  return mapExercise({ ...data, video_path:videoPath, photo_path:photoPath },user.id,signedVideo,signedPhoto);
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

export async function updateCustomExercise(exerciseId, {
  name, muscleGroup, equipment, description = '', photoFile = null, removePhoto = false,
}) {
  const user = await currentUser();
  const cleanName = String(name || '').trim();
  if (!cleanName || cleanName.length > 100) throw new Error('Введите название длиной до 100 символов.');
  if (!EXERCISE_MUSCLE_GROUPS.includes(muscleGroup) || muscleGroup === 'Все') throw new Error('Выберите группу мышц.');
  if (!EXERCISE_EQUIPMENT.includes(equipment) || equipment === 'Все') throw new Error('Выберите оборудование.');
  validatePhotoFile(photoFile);
  const { data: previous, error: lookupError } = await supabase.from('exercises')
    .select('id,photo_path').eq('id',exerciseId).eq('owner_id',user.id).single();
  if (lookupError || !previous) throw new Error('Своё упражнение не найдено.');
  let uploadedPath = null;
  try {
    if (photoFile) uploadedPath = await uploadExercisePhoto(user.id,exerciseId,photoFile);
    const photoPath = uploadedPath || (removePhoto ? null : previous.photo_path);
    const { data, error } = await supabase.from('exercises').update({
      name:cleanName,muscle_group:muscleGroup,equipment,
      description:String(description).trim() || null,photo_path:photoPath,
    }).eq('id',exerciseId).eq('owner_id',user.id).select('*').single();
    if (error || !data) throw new Error('Не удалось обновить своё упражнение.');
    if (previous.photo_path && previous.photo_path !== photoPath) {
      const {error: cleanupError} = await supabase.storage.from(EXERCISE_PHOTOS_BUCKET).remove([previous.photo_path]);
      if (cleanupError) console.warn('Unable to remove previous exercise photo:',cleanupError);
    }
    const [video,photo] = await Promise.all([signedVideoUrl(data.video_path),signedPhotoUrl(photoPath)]);
    return mapExercise(data,user.id,video,photo);
  } catch(error) {
    if (uploadedPath) await supabase.storage.from(EXERCISE_PHOTOS_BUCKET).remove([uploadedPath]);
    throw error;
  }
}

export function filterExerciseList(exercises, { query = '', muscleGroup = 'Все', equipment = 'Все' } = {}) {
  const tokens = normalizeCatalogSearch(query).split(' ').filter(Boolean);
  return (exercises || []).filter((exercise) => {
    if (muscleGroup !== 'Все' && normalizeExerciseMuscleGroup(exercise.muscle_group) !== muscleGroup) return false;
    if (equipment !== 'Все' && normalizeExerciseEquipment(exercise) !== equipment) return false;
    const text = normalizeCatalogSearch([exercise.name, exercise.muscle_group, exercise.target_muscle, exercise.synergists, exercise.movement_type, exercise.equipment, exercise.description,
      exercise.family_name_ru, exercise.equipment_name_ru, ...(exercise.aliases || []).map(alias => alias.alias)].filter(Boolean).join(' '));
    return tokens.every(token => text.includes(token));
  });
}
