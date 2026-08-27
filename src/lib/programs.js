import { supabase } from './supabase.js';

const PROGRAM_COVERS_BUCKET = 'program-covers';
const MAX_COVER_SIZE = 5 * 1024 * 1024;
const COVER_EXTENSIONS = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

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

function normalizeRepeatCount(value) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed)) return 1;
  return Math.max(1, Math.min(52, parsed));
}

function buildProgramPayload({
  name,
  description,
  weekCount = 1,
  cycleRepeatCount = 1,
  structureMode = 'cycle',
  categories,
  trainingPlace,
  equipment,
  level,
  scheduleMode = 'custom',
  programWeeks,
}) {
  return {
    name: name.trim(),
    description: nullableText(description),
    week_count: structureMode === 'cycle' ? 1 : weekCount,
    structure_mode: structureMode,
    cycle_repeat_count: normalizeRepeatCount(cycleRepeatCount),
    categories,
    training_place: nullableText(trainingPlace),
    equipment: nullableText(equipment),
    level: nullableText(level),
    schedule_mode: scheduleMode,
    weeks: programWeeks.map((week) => ({
      workouts: week.workouts.map((workout) => ({
        name: workout.name.trim(),
        rest_days_after: normalizeRestDays(workout.restDaysAfter),
        exercises: workout.exercises.map((exercise) => {
          const exerciseId = exercise.linkedExerciseId
            ?? (exercise.sourceWorkoutExerciseId ? null : exercise.id)
            ?? null;
          return {
            exercise_id: exerciseId,
            exercise_name_snapshot: nullableText(exercise.name),
            prescription_snapshot: nullableText(exercise.prescription),
            sets: (exercise.sets ?? []).map((set) => ({ reps: normalizeReps(set.reps) })),
          };
        }),
      })),
    })),
  };
}

function validateCover(coverFile) {
  if (!coverFile) return;
  if (!COVER_EXTENSIONS[coverFile.type]) throw new Error('Обложка должна быть в формате JPG, PNG или WEBP.');
  if (coverFile.size > MAX_COVER_SIZE) throw new Error('Размер обложки не должен превышать 5 МБ.');
}

function validateStartDate(startDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate ?? '')) throw new Error('Выберите дату начала программы.');
}

async function requireCurrentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Сессия истекла. Войдите в аккаунт ещё раз.');
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
  const { data, error } = await supabase.storage.from(PROGRAM_COVERS_BUCKET).createSignedUrl(coverPath, 60 * 60);
  if (error) return null;
  return data?.signedUrl ?? null;
}

async function saveCover({ coverFile, programId, userId }) {
  if (!coverFile) return null;
  const extension = COVER_EXTENSIONS[coverFile.type];
  const coverPath = `${userId}/${programId}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(PROGRAM_COVERS_BUCKET).upload(coverPath, coverFile, {
    cacheControl: '3600', contentType: coverFile.type, upsert: false,
  });
  if (uploadError) throw new Error('Не удалось загрузить обложку программы.');
  const { error: updateError } = await supabase
    .from('programs')
    .update({ cover_path: coverPath, updated_at: new Date().toISOString() })
    .eq('id', programId);
  if (updateError) {
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
    structureMode: row.structure_mode ?? 'legacy_weeks',
    cycleRepeatCount: row.cycle_repeat_count ?? 1,
    categories: row.categories ?? [],
    trainingPlace: row.training_place ?? '',
    equipment: row.equipment ?? '',
    level: row.level ?? '',
    scheduleMode: row.schedule_mode ?? 'custom',
    coverPath: row.cover_path ?? null,
    sourceCatalogProgramId: row.source_catalog_program_id ?? null,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapParticipationRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    programId: row.program_id,
    status: row.status,
    startDate: row.start_date,
    joinedAt: row.joined_at,
    pausedAt: row.paused_at ?? null,
    completedAt: row.completed_at ?? null,
    updatedAt: row.updated_at,
  };
}

async function loadLatestParticipations(programIds) {
  if (!programIds.length) return new Map();
  const { data, error } = await supabase
    .from('user_programs')
    .select('id, program_id, status, start_date, joined_at, paused_at, completed_at, updated_at')
    .in('program_id', programIds)
    .order('joined_at', { ascending: false });
  if (error) throw new Error('Не удалось загрузить статус программ.');
  const map = new Map();
  (data ?? []).forEach((row) => {
    if (!map.has(row.program_id)) map.set(row.program_id, mapParticipationRow(row));
  });
  return map;
}

async function loadTemplateWorkoutCounts(programIds) {
  const counts = new Map(programIds.map((id) => [id, 0]));
  if (!programIds.length) return counts;
  const { data: weeks, error: weeksError } = await supabase
    .from('program_weeks')
    .select('id, program_id')
    .in('program_id', programIds);
  if (weeksError) return counts;
  const weekIds = (weeks ?? []).map((row) => row.id);
  if (!weekIds.length) return counts;
  const { data: workouts, error: workoutsError } = await supabase
    .from('program_workouts')
    .select('id, week_id')
    .in('week_id', weekIds);
  if (workoutsError) return counts;
  const programByWeek = new Map((weeks ?? []).map((row) => [row.id, row.program_id]));
  (workouts ?? []).forEach((row) => {
    const programId = programByWeek.get(row.week_id);
    if (programId) counts.set(programId, (counts.get(programId) ?? 0) + 1);
  });
  return counts;
}

export async function startProgram(programId, startDate) {
  validateStartDate(startDate);
  await requireCurrentUser();
  const { data: userProgramId, error } = await supabase.rpc('start_program', {
    p_program_id: programId,
    p_start_date: startDate,
  });
  if (error || !userProgramId) {
    if (error?.code === '23505' || error?.message?.includes('already active')) throw new Error('Вы уже присоединились к этой программе.');
    if (error?.message?.includes('Monday, Wednesday or Friday')) throw new Error('Первая тренировка должна быть в понедельник, среду или пятницу.');
    if (error?.message?.includes('Tuesday, Thursday or Saturday')) throw new Error('Первая тренировка должна быть во вторник, четверг или субботу.');
    throw new Error('Не удалось присоединиться к программе. Попробуйте ещё раз.');
  }
  return { id: userProgramId, programId, startDate, status: 'active' };
}

export async function createProgram({ coverFile = null, startDate = null, ...program }) {
  validateCover(coverFile);
  if (startDate) validateStartDate(startDate);
  const user = await requireCurrentUser();
  const payload = buildProgramPayload(program);
  const { data: programId, error: createError } = await supabase.rpc('create_program_with_schedule', { p_program: payload });
  if (createError || !programId) throw new Error('Не удалось сохранить программу. Попробуйте ещё раз.');
  let coverPath = null;
  try {
    coverPath = await saveCover({ coverFile, programId, userId: user.id });
    const participation = startDate ? await startProgram(programId, startDate) : null;
    return { id: programId, coverPath, participation };
  } catch (error) {
    await removeCoverQuietly(coverPath);
    await removeProgramQuietly(programId);
    throw error;
  }
}

export async function updateProgram({ programId, coverFile = null, existingCoverPath = null, ...program }) {
  validateCover(coverFile);
  const user = await requireCurrentUser();
  const payload = buildProgramPayload(program);
  const { data: updatedProgramId, error: updateError } = await supabase.rpc('update_program_with_schedule', {
    p_program_id: programId,
    p_program: payload,
  });
  if (updateError || !updatedProgramId) {
    if (updateError?.message?.includes('Cycle configuration cannot change')) {
      throw new Error('Количество повторений цикла нельзя менять, пока программа активна или находится на паузе.');
    }
    throw new Error('Не удалось сохранить изменения программы. Попробуйте ещё раз.');
  }
  let coverPath = existingCoverPath;
  if (coverFile) {
    const previousCoverPath = existingCoverPath;
    coverPath = await saveCover({ coverFile, programId, userId: user.id });
    if (previousCoverPath && previousCoverPath !== coverPath) await removeCoverQuietly(previousCoverPath);
  }
  return { id: updatedProgramId, coverPath };
}

export async function listPrograms() {
  const { data, error } = await supabase
    .from('programs')
    .select('id, name, description, week_count, structure_mode, cycle_repeat_count, categories, training_place, equipment, level, schedule_mode, cover_path, source_catalog_program_id, status, created_at, updated_at')
    .neq('status', 'archived')
    .order('updated_at', { ascending: false });
  if (error) throw new Error('Не удалось загрузить ваши программы.');
  const rows = data ?? [];
  const programIds = rows.map((row) => row.id);
  const [participationByProgram, workoutCounts] = await Promise.all([
    loadLatestParticipations(programIds),
    loadTemplateWorkoutCounts(programIds),
  ]);
  return Promise.all(rows.map(async (row) => {
    const mapped = mapProgramRow(row);
    const templateWorkoutCount = workoutCounts.get(row.id) ?? 0;
    return {
      ...mapped,
      templateWorkoutCount,
      totalPlannedWorkoutCount: mapped.structureMode === 'cycle'
        ? templateWorkoutCount * mapped.cycleRepeatCount
        : templateWorkoutCount,
      participation: participationByProgram.get(row.id) ?? null,
      coverUrl: await getSignedCoverUrl(row.cover_path),
    };
  }));
}

export async function getProgram(programId) {
  const { data: programRow, error: programError } = await supabase
    .from('programs')
    .select('id, name, description, week_count, structure_mode, cycle_repeat_count, categories, training_place, equipment, level, schedule_mode, cover_path, source_catalog_program_id, status, created_at, updated_at')
    .eq('id', programId)
    .single();
  if (programError || !programRow) throw new Error('Не удалось открыть программу.');

  const { data: weeks, error: weeksError } = await supabase
    .from('program_weeks')
    .select('id, week_number, position')
    .eq('program_id', programId)
    .order('position', { ascending: true });
  if (weeksError) throw new Error('Не удалось загрузить структуру программы.');

  const weekIds = (weeks ?? []).map((week) => week.id);
  let workouts = [];
  if (weekIds.length) {
    const response = await supabase
      .from('program_workouts')
      .select('id, week_id, name, position, rest_days_after')
      .in('week_id', weekIds)
      .order('position', { ascending: true });
    if (response.error) throw new Error('Не удалось загрузить тренировки программы.');
    workouts = response.data ?? [];
  }

  const workoutIds = workouts.map((workout) => workout.id);
  let workoutExercises = [];
  if (workoutIds.length) {
    const response = await supabase
      .from('program_workout_exercises')
      .select('id, workout_id, exercise_id, exercise_name_snapshot, prescription_snapshot, position')
      .in('workout_id', workoutIds)
      .order('position', { ascending: true });
    if (response.error) throw new Error('Не удалось загрузить упражнения программы.');
    workoutExercises = response.data ?? [];
  }

  const workoutExerciseIds = workoutExercises.map((item) => item.id);
  let sets = [];
  if (workoutExerciseIds.length) {
    const response = await supabase
      .from('program_exercise_sets')
      .select('id, workout_exercise_id, set_number, reps')
      .in('workout_exercise_id', workoutExerciseIds)
      .order('set_number', { ascending: true });
    if (response.error) throw new Error('Не удалось загрузить подходы программы.');
    sets = response.data ?? [];
  }

  const exerciseIds = [...new Set(workoutExercises.map((item) => item.exercise_id).filter(Boolean))];
  let exercises = [];
  if (exerciseIds.length) {
    const response = await supabase
      .from('exercises')
      .select('id, name, muscle_group, movement_type, difficulty')
      .in('id', exerciseIds);
    if (response.error) throw new Error('Не удалось загрузить данные упражнений.');
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
        const exercise = item.exercise_id ? (exerciseById.get(item.exercise_id) ?? {}) : {};
        return {
          id: item.exercise_id ?? item.id,
          linkedExerciseId: item.exercise_id ?? null,
          sourceWorkoutExerciseId: item.id,
          name: item.exercise_name_snapshot || exercise.name || 'Упражнение',
          prescription: item.prescription_snapshot ?? '',
          muscle_group: exercise.muscle_group ?? '',
          movement_type: exercise.movement_type ?? '',
          difficulty: exercise.difficulty ?? null,
          sets: (setsByWorkoutExercise.get(item.id) ?? []).map((set) => ({ id: set.id, reps: set.reps ?? '' })),
        };
      }),
    })),
  }));

  const { data: participationRow, error: participationError } = await supabase
    .from('user_programs')
    .select('id, program_id, status, start_date, joined_at, paused_at, completed_at, updated_at')
    .eq('program_id', programId)
    .order('joined_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (participationError) throw new Error('Не удалось загрузить статус программы.');

  const participation = mapParticipationRow(participationRow);
  let scheduledWorkouts = [];
  if (participation) {
    const response = await supabase
      .from('scheduled_workouts')
      .select('id, sequence_number, week_number, cycle_number, workout_name, scheduled_date, status')
      .eq('user_program_id', participation.id)
      .order('sequence_number', { ascending: true });
    if (response.error) throw new Error('Не удалось загрузить календарь программы.');
    scheduledWorkouts = (response.data ?? []).map((row) => ({
      id: row.id,
      sequenceNumber: row.sequence_number,
      weekNumber: row.week_number,
      cycleNumber: row.cycle_number ?? null,
      workoutName: row.workout_name,
      scheduledDate: row.scheduled_date,
      status: row.status,
    }));
  }

  return {
    ...mapProgramRow(programRow),
    coverUrl: await getSignedCoverUrl(programRow.cover_path),
    programWeeks,
    participation,
    scheduledWorkouts,
  };
}
