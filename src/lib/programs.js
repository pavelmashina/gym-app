import { supabase } from './supabase.js';

const PROGRAM_COVERS_BUCKET = 'program-covers';
const MAX_COVER_SIZE = 5 * 1024 * 1024;
const COVER_EXTENSIONS = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

function nullableText(value) {
  const normalized = value?.trim?.() ?? '';
  return normalized || null;
}

function normalizeReps(value) {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isInteger(parsed) ? parsed : null;
}

function buildProgramPayload({
  name,
  description,
  weekCount,
  categories,
  trainingPlace,
  equipment,
  level,
  programWeeks,
}) {
  return {
    name: name.trim(),
    description: nullableText(description),
    week_count: weekCount,
    categories,
    training_place: nullableText(trainingPlace),
    equipment: nullableText(equipment),
    level: nullableText(level),
    weeks: programWeeks.map((week) => ({
      workouts: week.workouts.map((workout) => ({
        name: workout.name.trim(),
        exercises: workout.exercises.map((exercise) => ({
          exercise_id: exercise.id,
          sets: (exercise.sets ?? []).map((set) => ({
            reps: normalizeReps(set.reps),
          })),
        })),
      })),
    })),
  };
}

function validateCover(coverFile) {
  if (!coverFile) return;

  if (!COVER_EXTENSIONS[coverFile.type]) {
    throw new Error('Обложка должна быть в формате JPG, PNG или WEBP.');
  }

  if (coverFile.size > MAX_COVER_SIZE) {
    throw new Error('Размер обложки не должен превышать 5 МБ.');
  }
}

async function removeProgramQuietly(programId) {
  const { error } = await supabase.from('programs').delete().eq('id', programId);
  if (error) console.error('Unable to clean up program after failed creation:', error);
}

async function removeCoverQuietly(coverPath) {
  if (!coverPath) return;
  const { error } = await supabase.storage.from(PROGRAM_COVERS_BUCKET).remove([coverPath]);
  if (error) console.error('Unable to clean up program cover:', error);
}

async function saveCover({ coverFile, programId, userId }) {
  if (!coverFile) return null;

  const extension = COVER_EXTENSIONS[coverFile.type];
  const coverPath = `${userId}/${programId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage
    .from(PROGRAM_COVERS_BUCKET)
    .upload(coverPath, coverFile, {
      cacheControl: '3600',
      contentType: coverFile.type,
      upsert: false,
    });

  if (uploadError) {
    console.error('Unable to upload program cover:', uploadError);
    throw new Error('Не удалось загрузить обложку программы.');
  }

  const { error: updateError } = await supabase
    .from('programs')
    .update({ cover_path: coverPath })
    .eq('id', programId);

  if (updateError) {
    console.error('Unable to attach program cover:', updateError);
    await removeCoverQuietly(coverPath);
    throw new Error('Не удалось сохранить обложку программы.');
  }

  return coverPath;
}

export async function createProgram({ coverFile = null, ...program }) {
  validateCover(coverFile);

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    console.error('Unable to verify user before program creation:', userError);
    throw new Error('Сессия истекла. Войдите в аккаунт ещё раз.');
  }

  const payload = buildProgramPayload(program);
  const { data: programId, error: createError } = await supabase.rpc(
    'create_program_with_structure',
    { p_program: payload },
  );

  if (createError || !programId) {
    console.error('Unable to create program:', createError);
    throw new Error('Не удалось сохранить программу. Попробуйте ещё раз.');
  }

  try {
    const coverPath = await saveCover({ coverFile, programId, userId: user.id });
    return { id: programId, coverPath };
  } catch (error) {
    await removeProgramQuietly(programId);
    throw error;
  }
}
