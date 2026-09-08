import { supabase } from './supabase.js';

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

function mapExercise(row, userId) {
  return {
    ...row,
    display_muscle_group: normalizeExerciseMuscleGroup(row.muscle_group),
    equipment: normalizeExerciseEquipment(row),
    isMine: Boolean(row.owner_id && row.owner_id === userId),
  };
}

async function currentUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Сессия истекла. Войдите в аккаунт ещё раз.');
  return user;
}

export async function listExerciseLibrary() {
  const user = await currentUser();
  const [exerciseResult, recentResult] = await Promise.all([
    supabase
      .from('exercises')
      .select('id, name, muscle_group, target_muscle, synergists, exercise_type, difficulty, movement_type, technique, notes, equipment, owner_id, created_at')
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

  const all = (exerciseResult.data || []).map((row) => mapExercise(row, user.id));
  const byId = new Map(all.map((exercise) => [exercise.id, exercise]));
  const recent = (recentResult.data || []).map((row) => byId.get(row.exercise_id)).filter(Boolean);
  const mine = all.filter((exercise) => exercise.isMine).sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));
  return { all, mine, recent };
}

export async function createCustomExercise({ name, muscleGroup, equipment }) {
  const user = await currentUser();
  const cleanName = String(name || '').trim();
  if (!cleanName) throw new Error('Введите название упражнения.');
  if (!EXERCISE_MUSCLE_GROUPS.includes(muscleGroup) || muscleGroup === 'Все') throw new Error('Выберите группу мышц.');
  if (!EXERCISE_EQUIPMENT.includes(equipment) || equipment === 'Все') throw new Error('Выберите оборудование.');

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
    })
    .select('id, name, muscle_group, target_muscle, synergists, exercise_type, difficulty, movement_type, technique, notes, equipment, owner_id, created_at')
    .single();
  if (error || !data) throw new Error('Не удалось сохранить упражнение.');
  return mapExercise(data, user.id);
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
    return [exercise.name, exercise.muscle_group, exercise.target_muscle, exercise.synergists, exercise.movement_type, exercise.equipment]
      .filter(Boolean)
      .some((value) => String(value).toLocaleLowerCase('ru').includes(q));
  });
}
