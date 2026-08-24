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

function normalizeRestDays(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 1;
  return Math.max(0, Math.min(30, parsed));
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
        rest_days_after: normalizeRestDays(workout.restDaysAfter),
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

async function requireCurrentUser() {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    console.error('Unable to verify current user:', error);
    throw new Error('Сессия истекла. Войдите в аккаунт ещё раз.');
  }

  return user;
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

async function getSignedCoverUrl(coverPath) {
  if (!coverPath) return null;

  const { data, error } = await supabase.storage
    .from(PROGRAM_COVERS_BUCKET)
    .createSignedUrl(coverPath, 60 * 60);

  if (error) {
    console.error('Unable to create program cover URL:', error);
    return null;
  }

  return data?.signedUrl ?? null;
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
    .update({ cover_path: coverPath, updated_at: new Date().toISOString() })
    .eq('id', programId);

  if (updateError) {
    console.error('Unable to attach program cover:', updateError);
    await removeCoverQuietly(coverPath);
    throw new Error('Не удалось сохранить обложку программы.');
  }

  return coverPath;
}

function mapProgramRow(row) {
  return {
    id: row.id,
    name: row.name,
    description: row.description ?? '',
    weekCount: row.week_count,
    categories: row.categories ?? [],
    trainingPlace: row.training_place ?? '',
    equipment: row.equipment ?? '',
    level: row.level ?? '',
    coverPath: row.cover_path ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function createProgram({ coverFile = null, ...program }) {
  validateCover(coverFile);
  const user = await requireCurrentUser();

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

export async function updateProgram({
  programId,
  coverFile = null,
  existingCoverPath = null,
  ...program
}) {
  validateCover(coverFile);
  const user = await requireCurrentUser();
  const payload = buildProgramPayload(program);

  const { data: updatedProgramId, error: updateError } = await supabase.rpc(
    'update_program_with_structure',
    { p_program_id: programId, p_program: payload },
  );

  if (updateError || !updatedProgramId) {
    console.error('Unable to update program:', updateError);
    throw new Error('Не удалось сохранить изменения программы. Попробуйте ещё раз.');
  }

  let coverPath = existingCoverPath;
  if (coverFile) {
    const previousCoverPath = existingCoverPath;
    coverPath = await saveCover({ coverFile, programId, userId: user.id });
    if (previousCoverPath && previousCoverPath !== coverPath) {
      await removeCoverQuietly(previousCoverPath);
    }
  }

  return { id: updatedProgramId, coverPath };
}

export async function listPrograms() {
  const { data, error } = await supabase
    .from('programs')
    .select('id, name, description, week_count, categories, training_place, equipment, level, cover_path, status, created_at, updated_at')
    .neq('status', 'archived')
    .order('updated_at', { ascending: false });

  if (error) {
    console.error('Unable to load programs:', error);
    throw new Error('Не удалось загрузить ваши программы.');
  }

  return Promise.all((data ?? []).map(async (row) => ({
    ...mapProgramRow(row),
    coverUrl: await getSignedCoverUrl(row.cover_path),
  })));
}

export async function getProgram(programId) {
  const { data: programRow, error: programError } = await supabase
    .from('programs')
    .select('id, name, description, week_count, categories, training_place, equipment, level, cover_path, status, created_at, updated_at')
    .eq('id', programId)
    .single();

  if (programError || !programRow) {
    console.error('Unable to load program:', programError);
    throw new Error('Не удалось открыть программу.');
  }

  const { data: weeks, error: weeksError } = await supabase
    .from('program_weeks')
    .select('id, week_number, position')
    .eq('program_id', programId)
    .order('position', { ascending: true });

  if (weeksError) {
    console.error('Unable to load program weeks:', weeksError);
    throw new Error('Не удалось загрузить структуру программы.');
  }

  const weekIds = (weeks ?? []).map((week) => week.id);
  let workouts = [];
  if (weekIds.length > 0) {
    const response = await supabase
      .from('program_workouts')
      .select('id, week_id, name, position, rest_days_after')
      .in('week_id', weekIds)
      .order('position', { ascending: true });
    if (response.error) {
      console.error('Unable to load program workouts:', response.error);
      throw new Error('Не удалось загрузить тренировки программы.');
    }
    workouts = response.data ?? [];
  }

  const workoutIds = workouts.map((workout) => workout.id);
  let workoutExercises = [];
  if (workoutIds.length > 0) {
    const response = await supabase
      .from('program_workout_exercises')
      .select('id, workout_id, exercise_id, position')
      .in('workout_id', workoutIds)
      .order('position', { ascending: true });
    if (response.error) {
      console.error('Unable to load workout exercises:', response.error);
      throw new Error('Не удалось загрузить упражнения программы.');
    }
    workoutExercises = response.data ?? [];
  }

  const workoutExerciseIds = workoutExercises.map((item) => item.id);
  let sets = [];
  if (workoutExerciseIds.length > 0) {
    const response = await supabase
      .from('program_exercise_sets')
      .select('id, workout_exercise_id, set_number, reps')
      .in('workout_exercise_id', workoutExerciseIds)
      .order('set_number', { ascending: true });
    if (response.error) {
      console.error('Unable to load exercise sets:', response.error);
      throw new Error('Не удалось загрузить подходы программы.');
    }
    sets = response.data ?? [];
  }

  const exerciseIds = [...new Set(workoutExercises.map((item) => item.exercise_id))];
  let exercises = [];
  if (exerciseIds.length > 0) {
    const response = await supabase
      .from('exercises')
      .select('id, name, muscle_group, movement_type, difficulty')
      .in('id', exerciseIds);
    if (response.error) {
      console.error('Unable to load exercise catalog data:', response.error);
      throw new Error('Не удалось загрузить данные упражнений.');
    }
    exercises = response.data ?? [];
  }

  const workoutsByWeek = new Map();
  workouts.forEach((workout) => {
    const list = workoutsByWeek.get(workout.week_id) ?? [];
    list.push(workout);
    workoutsByWeek.set(workout.week_id, list);
  });

  const workoutExercisesByWorkout = new Map();
  workoutExercises.forEach((item) => {
    const list = workoutExercisesByWorkout.get(item.workout_id) ?? [];
    list.push(item);
    workoutExercisesByWorkout.set(item.workout_id, list);
  });

  const setsByWorkoutExercise = new Map();
  sets.forEach((set) => {
    const list = setsByWorkoutExercise.get(set.workout_exercise_id) ?? [];
    list.push(set);
    setsByWorkoutExercise.set(set.workout_exercise_id, list);
  });

  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));

  const programWeeks = (weeks ?? []).map((week) => ({
    id: week.id,
    number: week.week_number,
    workouts: (workoutsByWeek.get(week.id) ?? []).map((workout) => ({
      id: workout.id,
      name: workout.name,
      restDaysAfter: workout.rest_days_after ?? 1,
      exercises: (workoutExercisesByWorkout.get(workout.id) ?? []).map((item) => {
        const exercise = exerciseById.get(item.exercise_id) ?? {};
        return {
          id: item.exercise_id,
          name: exercise.name ?? 'Упражнение',
          muscle_group: exercise.muscle_group ?? '',
          movement_type: exercise.movement_type ?? '',
          difficulty: exercise.difficulty ?? null,
          sets: (setsByWorkoutExercise.get(item.id) ?? []).map((set) => ({
            id: set.id,
            reps: set.reps ?? '',
          })),
        };
      }),
    })),
  }));

  return {
    ...mapProgramRow(programRow),
    coverUrl: await getSignedCoverUrl(programRow.cover_path),
    programWeeks,
  };
}
