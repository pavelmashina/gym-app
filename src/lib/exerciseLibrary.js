import { supabase } from './supabase.js';
import { normalizeCatalogSearch } from './exerciseCatalogV2.js';

const CATALOG_V2_ENABLED = import.meta.env.VITE_EXERCISE_CATALOG_V2 === 'true';

const EXERCISE_VIDEOS_BUCKET = 'exercise-videos';
const EXERCISE_PHOTOS_BUCKET = 'exercise-photos';
const MAX_PHOTO_SIZE = 8 * 1024 * 1024;
export const MAX_EXERCISE_PHOTOS = 10;
const PHOTO_EXTENSIONS = { 'image/jpeg':'jpg', 'image/png':'png', 'image/webp':'webp' };
const MAX_VIDEO_SIZE = 100 * 1024 * 1024;
const VIDEO_EXTENSIONS = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
};
// ON DELETE RESTRICT reports 23503 before PostgreSQL 18 and 23001 since.
const REFERENCED_ROW_ERRORS = ['23503', '23001'];

// A retired private row stays readable for programs and history, but is no longer offered.
const isRemovedCustomExercise = row => Boolean(row?.owner_id) && row.status === 'retired';

export const EXERCISE_MUSCLE_GROUPS = ['Все', 'Грудь', 'Плечи', 'Спина', 'Пресс', 'Ноги', 'Бицепс', 'Икры', 'Трицепс', 'Ягодицы', 'Всё тело'];
export const EXERCISE_EQUIPMENT = ['Все', 'Гакк', 'Гантели', 'Штанга', 'Смит', 'Турник', 'Свой вес', 'Гравитрон', 'Гири', 'Тренажёр'];

// Groups offered for a user's own exercise. The finer ones are filtered under a main
// group by normalizeExerciseMuscleGroup (Квадрицепсы → Ноги); Предплечья and Шея get
// their own filter option once an exercise uses them.
export const CUSTOM_EXERCISE_MUSCLE_GROUPS = [
  'Грудь', 'Спина', 'Трапеции', 'Поясница', 'Плечи', 'Бицепс', 'Трицепс', 'Предплечья', 'Пресс',
  'Ягодицы', 'Ноги', 'Квадрицепсы', 'Бицепс бедра', 'Приводящие', 'Отводящие', 'Икры', 'Шея', 'Всё тело', 'Кардио',
];
export const EXERCISE_MUSCLE_GROUP_OTHER = 'Другое';
export const MAX_MUSCLE_GROUP_LENGTH = 40;

const collapseSpaces = value => String(value ?? '').replace(/\s+/g, ' ').trim();
const muscleGroupKey = value => collapseSpaces(value).toLocaleLowerCase('ru').replace(/ё/g, 'е');
const RESERVED_MUSCLE_GROUP_KEYS = new Set(['все', 'другое']);

function typedMuscleGroupError(value) {
  if (!value) return 'Введите название группы мышц.';
  if (value.length > MAX_MUSCLE_GROUP_LENGTH) return `Название группы мышц — не длиннее ${MAX_MUSCLE_GROUP_LENGTH} символов.`;
  if (!/\p{L}/u.test(value)) return 'Название группы мышц должно содержать буквы.';
  if (RESERVED_MUSCLE_GROUP_KEYS.has(muscleGroupKey(value))) return 'Введите конкретную группу мышц.';
  return '';
}

// The draft keeps the select value and the text typed after «Другое» separately, so
// typing a name that matches a list item does not flip the form back to the select.
export function muscleGroupChoiceError({ muscleGroup, customMuscleGroup = '' } = {}) {
  if (muscleGroup === EXERCISE_MUSCLE_GROUP_OTHER) return typedMuscleGroupError(collapseSpaces(customMuscleGroup));
  return CUSTOM_EXERCISE_MUSCLE_GROUPS.includes(muscleGroup) ? '' : 'Выберите группу мышц.';
}

export function resolveExerciseMuscleGroup(choice = {}) {
  const error = muscleGroupChoiceError(choice);
  if (error) throw new Error(error);
  if (choice.muscleGroup !== EXERCISE_MUSCLE_GROUP_OTHER) return choice.muscleGroup;
  const typed = collapseSpaces(choice.customMuscleGroup);
  const known = CUSTOM_EXERCISE_MUSCLE_GROUPS.find(group => muscleGroupKey(group) === muscleGroupKey(typed));
  return known || typed.charAt(0).toLocaleUpperCase('ru') + typed.slice(1);
}

// Opens a saved exercise in the form: list values go to the select, anything else to «Другое».
export function muscleGroupDraft(value) {
  const clean = collapseSpaces(value);
  return CUSTOM_EXERCISE_MUSCLE_GROUPS.includes(clean)
    ? { muscleGroup: clean, customMuscleGroup: '' }
    : { muscleGroup: EXERCISE_MUSCLE_GROUP_OTHER, customMuscleGroup: clean };
}

// The shared catalog keeps the main groups. Own exercises add the groups that do not fold
// into one of them, so an exercise saved with «Шея» can still be found by its group.
export function exerciseMuscleGroupFilterOptions(ownExercises = []) {
  const extra = new Set();
  for (const exercise of ownExercises) {
    const group = normalizeExerciseMuscleGroup(exercise?.muscle_group);
    if (!EXERCISE_MUSCLE_GROUPS.includes(group)) extra.add(group);
  }
  return [...EXERCISE_MUSCLE_GROUPS, ...[...extra].sort((a, b) => a.localeCompare(b, 'ru'))];
}

export function normalizeExerciseMuscleGroup(value) {
  const source = String(value || '').trim();
  const lower = source.toLocaleLowerCase('ru');
  if (!source) return 'Всё тело';
  if (lower.startsWith('трапец') || lower.startsWith('поясниц')) return 'Спина';
  if (lower.startsWith('квадрицеп') || lower.startsWith('бицепс бедр')) return 'Ноги';
  if (lower.startsWith('отвод')) return 'Ягодицы';
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

export function exercisePhotoPaths(row) {
  const ordered = Array.isArray(row?.photo_paths) ? row.photo_paths.filter(Boolean) : [];
  return ordered.length ? ordered : (row?.photo_path ? [row.photo_path] : []);
}

async function signedPhotoUrl(photoPath) {
  if (!photoPath) return null;
  const { data, error } = await supabase.storage.from(EXERCISE_PHOTOS_BUCKET).createSignedUrl(photoPath, 60 * 60);
  return error ? null : (data?.signedUrl ?? null);
}

async function signedPhotoUrls(paths) {
  return Promise.all(paths.map(signedPhotoUrl));
}

function mapExercise(row, userId, resolvedVideoUrl = null, photoUrls = []) {
  const photoPaths = exercisePhotoPaths(row);
  const resolvedPhotos = photoPaths.map((path, index) => ({ path, url: photoUrls[index] || null }));
  const accessibleUrls = resolvedPhotos.map(photo => photo.url).filter(Boolean);
  return {
    ...row,
    photo_path: photoPaths[0] || null,
    photo_paths: photoPaths,
    // Own exercises show the group exactly as chosen or typed; shared rows use the main groups.
    display_muscle_group: (row.owner_id && collapseSpaces(row.muscle_group))
      || normalizeExerciseMuscleGroup(row.primary_group_name_ru || row.muscle_group),
    equipment: normalizeExerciseEquipment(row),
    isMine: Boolean(row.owner_id && row.owner_id === userId),
    resolvedVideoUrl: resolvedVideoUrl || row.video_url || null,
    resolvedPhotos,
    resolvedPhotoUrls: accessibleUrls,
    resolvedPhotoUrl: accessibleUrls[0] || null,
  };
}

async function currentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Сессия истекла. Войдите в аккаунт ещё раз.');
  return user;
}

async function mapExercises(rows, userId) {
  return Promise.all((rows || []).map(async row => {
    const [video, photos] = await Promise.all([
      signedVideoUrl(row.video_path),
      signedPhotoUrls(exercisePhotoPaths(row)),
    ]);
    return mapExercise(row, userId, video, photos);
  }));
}

async function loadCatalogRows({ canonical = CATALOG_V2_ENABLED } = {}) {
  const rows = [];
  for (let offset = 0; ; offset += 500) {
    const result = await supabase.from(canonical ? 'exercise_catalog_v2' : 'exercises')
      .select('*').order('name', { ascending: true }).order('id', { ascending: true }).range(offset, offset + 499);
    if (result.error) return result;
    rows.push(...(result.data || []));
    if ((result.data || []).length < 500) return { data: rows, error: null };
  }
}

export async function listExerciseLibrary({ includeLegacy = false } = {}) {
  const user = await currentUser();
  const [exerciseResult, recentResult, photoResult, legacyResult] = await Promise.all([
    loadCatalogRows(),
    supabase
      .from('user_recent_exercises')
      .select('exercise_id, last_used_at')
      .eq('user_id', user.id)
      .order('last_used_at', { ascending: false })
      .limit(5),
    // Catalog v2 is an existing view without photo_path; get owned paths separately.
    supabase.from('exercises').select('id,photo_path,photo_paths').eq('owner_id', user.id),
    includeLegacy && CATALOG_V2_ENABLED ? loadCatalogRows({ canonical: false }) : Promise.resolve({ data: [], error: null }),
  ]);
  if (legacyResult.error) throw new Error('Не удалось загрузить полную базу упражнений.');
  if (photoResult.error) throw new Error('Не удалось загрузить фотографии ваших упражнений.');
  if (exerciseResult.error) throw new Error('Не удалось загрузить базу упражнений.');
  if (recentResult.error) throw new Error('Не удалось загрузить недавние упражнения.');

  const photoFields = new Map((photoResult.data || []).map(item => [item.id, item]));
  // In browse-only mode merge the complete legacy table with the richer V2 cards.
  // Preserve the V2 record on matching IDs; do not duplicate exercises.
  const canonicalRows = exerciseResult.data || [];
  const knownIds = new Set(canonicalRows.map(row => row.id));
  const fullRows = (includeLegacy ? [...canonicalRows, ...(legacyResult.data || []).filter(row => !knownIds.has(row.id))] : canonicalRows)
    .filter(row => !isRemovedCustomExercise(row));
  fullRows.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  const all = await mapExercises(fullRows.map(row =>
    row.owner_id === user.id ? { ...row, ...photoFields.get(row.id) } : row
  ), user.id);
  const byId = new Map(all.map((exercise) => [exercise.id, exercise]));
  // Old history references keep their original IDs; they are not silently remapped.
  const missingRecent = (recentResult.data || []).map(row => row.exercise_id).filter(id => !byId.has(id));
  if (!CATALOG_V2_ENABLED && missingRecent.length) {
    const result = await supabase.from('exercises').select('*').in('id', missingRecent);
    if (result.error) throw new Error('Не удалось загрузить недавние упражнения.');
    for (const exercise of await mapExercises((result.data || []).filter(row => !isRemovedCustomExercise(row)), user.id)) {
      byId.set(exercise.id, exercise);
      // Historical IDs belong in Recent, not in the canonical All catalogue.
      // pick() includes a selected historical row in its callback explicitly.
    }
  }
  const recent = (recentResult.data || []).map((row) => byId.get(row.exercise_id)).filter(Boolean);
  const mine = all.filter((exercise) => exercise.isMine).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return { all, mine, recent };
}

export async function listMyExercises() {
  const user = await currentUser();
  const { data, error } = await supabase.from('exercises').select('*')
    .eq('owner_id', user.id).neq('status', 'retired')
    .order('created_at', { ascending: false }).order('id', { ascending: true });
  if (error) throw new Error('Не удалось загрузить ваши упражнения.');
  return mapExercises(data, user.id);
}

function validatePhotoFile(photoFile) {
  if (!photoFile) return;
  if (!PHOTO_EXTENSIONS[photoFile.type]) throw new Error('Фото должно быть в формате JPEG, PNG или WebP.');
  if (photoFile.size > MAX_PHOTO_SIZE) throw new Error('Размер фото не должен превышать 8 МБ.');
}

function requestedPhotoFiles(photoFiles, photoFile = null) {
  return Array.isArray(photoFiles) && photoFiles.length ? photoFiles : (photoFile ? [photoFile] : []);
}

function validatePhotoGallery(files, existingCount = 0) {
  if (files.length + existingCount > MAX_EXERCISE_PHOTOS) {
    throw new Error(`Для одного упражнения можно добавить до ${MAX_EXERCISE_PHOTOS} фото.`);
  }
  files.forEach(validatePhotoFile);
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

async function uploadExerciseVideo(userId, exerciseId, videoFile) {
  const path = `${userId}/${exerciseId}/${crypto.randomUUID()}.${VIDEO_EXTENSIONS[videoFile.type]}`;
  const { error } = await supabase.storage.from(EXERCISE_VIDEOS_BUCKET).upload(path, videoFile, {
    cacheControl: '3600', contentType: videoFile.type, upsert: false,
  });
  if (error) throw new Error('Не удалось загрузить видео упражнения.');
  return path;
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

export async function createCustomExercise({ name, muscleGroup, customMuscleGroup = '', equipment, description = '', videoUrl = '', videoFile = null, photoFile = null, photoFiles = [] }) {
  const user = await currentUser();
  const cleanName = String(name || '').trim();
  const cleanDescription = String(description || '').trim();
  if (!cleanName) throw new Error('Введите название упражнения.');
  const cleanMuscleGroup = resolveExerciseMuscleGroup({ muscleGroup, customMuscleGroup });
  if (!EXERCISE_EQUIPMENT.includes(equipment) || equipment === 'Все') throw new Error('Выберите оборудование.');
  validateVideoFile(videoFile);
  const selectedPhotos = requestedPhotoFiles(photoFiles, photoFile);
  validatePhotoGallery(selectedPhotos);
  if (videoFile && String(videoUrl || '').trim()) throw new Error('Добавьте либо видеофайл, либо ссылку на видео.');
  const cleanVideoUrl = normalizeOptionalUrl(videoUrl);

  const { data, error } = await supabase
    .from('exercises')
    .insert({
      owner_id: user.id,
      name: cleanName,
      muscle_group: cleanMuscleGroup,
      equipment,
      exercise_type: 'Пользовательское',
      movement_type: 'Пользовательское',
      difficulty: 1,
      description: cleanDescription || null,
      video_url: cleanVideoUrl,
    })
    .select('id, name, muscle_group, target_muscle, synergists, exercise_type, difficulty, movement_type, technique, notes, description, video_url, video_path, photo_path, photo_paths, equipment, owner_id, created_at')
    .single();
  if (error || !data) {
    console.error('Unable to save custom exercise:', error);
    throw new Error('Не удалось сохранить упражнение.');
  }

  let videoPath = null;
  const uploadedPhotos = [];
  try {
    if (videoFile) videoPath = await uploadExerciseVideo(user.id, data.id, videoFile);
    for (const file of selectedPhotos) {
      uploadedPhotos.push(await uploadExercisePhoto(user.id, data.id, file));
    }
    if (videoPath || uploadedPhotos.length) {
      const { error: attachError } = await supabase.from('exercises').update({
        ...(videoPath ? { video_path: videoPath } : {}),
        photo_path: uploadedPhotos[0] || null,
        photo_paths: uploadedPhotos,
      }).eq('id', data.id).eq('owner_id', user.id);
      if (attachError) throw new Error('Не удалось привязать медиафайлы к упражнению.');
    }
  } catch (error) {
    await Promise.all([
      videoPath ? supabase.storage.from(EXERCISE_VIDEOS_BUCKET).remove([videoPath]) : Promise.resolve(),
      uploadedPhotos.length ? supabase.storage.from(EXERCISE_PHOTOS_BUCKET).remove(uploadedPhotos) : Promise.resolve(),
    ]);
    await supabase.from('exercises').delete().eq('id', data.id).eq('owner_id', user.id);
    throw error;
  }
  const [signedVideo, signedPhotos] = await Promise.all([
    signedVideoUrl(videoPath),
    signedPhotoUrls(uploadedPhotos),
  ]);
  return mapExercise({
    ...data, video_path: videoPath, photo_path: uploadedPhotos[0] || null, photo_paths: uploadedPhotos,
  }, user.id, signedVideo, signedPhotos);
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
  name, muscleGroup, customMuscleGroup = '', equipment, description = '',
  photoFile = null, photoFiles = [], removePhoto = false, removedPhotoPaths = [],
  videoUrl, videoFile = null, removeVideoFile = false,
}) {
  const user = await currentUser();
  const cleanName = String(name || '').trim();
  if (!cleanName || cleanName.length > 100) throw new Error('Введите название длиной до 100 символов.');
  const cleanMuscleGroup = resolveExerciseMuscleGroup({ muscleGroup, customMuscleGroup });
  if (!EXERCISE_EQUIPMENT.includes(equipment) || equipment === 'Все') throw new Error('Выберите оборудование.');
  validateVideoFile(videoFile);
  if (videoFile && String(videoUrl || '').trim()) throw new Error('Добавьте либо видеофайл, либо ссылку на видео.');
  // An omitted videoUrl keeps the saved link; an empty one clears it.
  const cleanVideoUrl = videoUrl === undefined ? undefined : normalizeOptionalUrl(videoUrl);
  const selectedPhotos = requestedPhotoFiles(photoFiles, photoFile);
  const { data: previous, error: lookupError } = await supabase.from('exercises')
    .select('id,photo_path,photo_paths,video_path,video_url').eq('id', exerciseId).eq('owner_id', user.id).single();
  if (lookupError || !previous) throw new Error('Своё упражнение не найдено.');
  const previousPaths = exercisePhotoPaths(previous);
  const removed = new Set(removePhoto ? previousPaths : removedPhotoPaths);
  const keptPaths = previousPaths.filter(path => !removed.has(path));
  validatePhotoGallery(selectedPhotos, keptPaths.length);
  const uploadedPaths = [];
  let uploadedVideoPath = null;
  try {
    for (const file of selectedPhotos) {
      uploadedPaths.push(await uploadExercisePhoto(user.id, exerciseId, file));
    }
    if (videoFile) uploadedVideoPath = await uploadExerciseVideo(user.id, exerciseId, videoFile);
    const nextPaths = [...keptPaths, ...uploadedPaths];
    const nextVideoPath = uploadedVideoPath || ((removeVideoFile || cleanVideoUrl) ? null : previous.video_path);
    const nextVideoUrl = videoFile ? null : (cleanVideoUrl === undefined ? previous.video_url : cleanVideoUrl);
    const { data, error } = await supabase.from('exercises').update({
      name: cleanName,
      muscle_group: cleanMuscleGroup,
      equipment,
      description: String(description).trim() || null,
      photo_path: nextPaths[0] || null,
      photo_paths: nextPaths,
      video_path: nextVideoPath,
      video_url: nextVideoUrl,
    }).eq('id', exerciseId).eq('owner_id', user.id).select('*').single();
    if (error || !data) throw new Error('Не удалось обновить своё упражнение.');

    const obsoletePaths = previousPaths.filter(path => !nextPaths.includes(path));
    if (obsoletePaths.length) {
      const { error: cleanupError } = await supabase.storage.from(EXERCISE_PHOTOS_BUCKET).remove(obsoletePaths);
      if (cleanupError) console.warn('Unable to remove old exercise photos:', cleanupError);
    }
    if (previous.video_path && previous.video_path !== nextVideoPath) {
      const { error: cleanupError } = await supabase.storage.from(EXERCISE_VIDEOS_BUCKET).remove([previous.video_path]);
      if (cleanupError) console.warn('Unable to remove old exercise video:', cleanupError);
    }
    const [video, photos] = await Promise.all([
      signedVideoUrl(data.video_path),
      signedPhotoUrls(nextPaths),
    ]);
    return mapExercise({
      ...data, photo_path: nextPaths[0] || null, photo_paths: nextPaths,
    }, user.id, video, photos);
  } catch (error) {
    if (uploadedPaths.length) {
      await supabase.storage.from(EXERCISE_PHOTOS_BUCKET).remove(uploadedPaths);
    }
    if (uploadedVideoPath) {
      await supabase.storage.from(EXERCISE_VIDEOS_BUCKET).remove([uploadedVideoPath]);
    }
    throw error;
  }
}

async function countExerciseReferences(table, exerciseId) {
  const { count, error } = await supabase.from(table)
    .select('id', { count: 'exact', head: true }).eq('exercise_id', exerciseId);
  if (error) throw new Error('Не удалось проверить, где используется упражнение.');
  return count || 0;
}

export async function getCustomExerciseUsage(exerciseId) {
  const [programs, scheduled, history] = await Promise.all([
    countExerciseReferences('program_workout_exercises', exerciseId),
    countExerciseReferences('scheduled_workout_exercises', exerciseId),
    countExerciseReferences('workout_session_exercises', exerciseId),
  ]);
  return { programs, scheduled, history, total: programs + scheduled + history };
}

// An unsaved program on this device would otherwise fail to save with a dangling exercise ID.

async function removeExerciseMedia(exercise) {
  const photoPaths = exercisePhotoPaths(exercise);
  const results = await Promise.all([
    photoPaths.length ? supabase.storage.from(EXERCISE_PHOTOS_BUCKET).remove(photoPaths) : null,
    exercise.video_path ? supabase.storage.from(EXERCISE_VIDEOS_BUCKET).remove([exercise.video_path]) : null,
  ]);
  for (const result of results) {
    if (result?.error) console.warn('Unable to remove deleted exercise media:', result.error);
  }
}

/**
 * Removes an owned exercise from the user's lists without touching saved results.
 * Programs and history reference exercises through restricting foreign keys and read
 * the current name by ID, so a used exercise is retired instead of deleted.
 */
// heldLocally(userId, exerciseId) says whether this device still refers to the exercise, as a
// program draft does. The caller passes it because this module takes no imports: tests load
// it from a data: URL. Without it the row is kept, as a draft might still need it.
export async function deleteCustomExercise(exerciseId, { heldLocally = () => true } = {}) {
  const user = await currentUser();
  const { data: exercise, error: lookupError } = await supabase.from('exercises')
    .select('id,photo_path,photo_paths,video_path').eq('id', exerciseId).eq('owner_id', user.id).single();
  if (lookupError || !exercise) throw new Error('Своё упражнение не найдено.');

  const usage = await getCustomExerciseUsage(exerciseId);
  if (usage.total === 0 && !heldLocally(user.id, exerciseId)) {
    const { data, error } = await supabase.from('exercises').delete()
      .eq('id', exerciseId).eq('owner_id', user.id).select('id');
    if (!error && data?.length) {
      await removeExerciseMedia(exercise);
      return { outcome: 'deleted', usage };
    }
    // The foreign key saw a reference the count did not: keep the row and retire it below.
    if (!REFERENCED_ROW_ERRORS.includes(error?.code)) throw new Error('Не удалось удалить упражнение.');
  }

  const { data, error } = await supabase.from('exercises').update({ status: 'retired' })
    .eq('id', exerciseId).eq('owner_id', user.id).select('id').single();
  if (error || !data) throw new Error('Не удалось удалить упражнение.');
  const { error: recentError } = await supabase.from('user_recent_exercises').delete()
    .eq('user_id', user.id).eq('exercise_id', exerciseId);
  if (recentError) console.warn('Unable to clear deleted exercise from recents:', recentError);
  return { outcome: 'retired', usage };
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
