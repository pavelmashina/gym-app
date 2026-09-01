import { supabase } from './supabase.js';

function assertDate(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new Error('Выберите новую дату тренировки.');
}

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Сессия истекла. Войдите в аккаунт ещё раз.');
}

function mapWorkoutControlError(error, fallback) {
  const message = error?.message ?? '';
  if (message.includes('active workout')) return new Error('Сначала завершите или отмените текущую тренировку.');
  if (message.includes('cannot be in the past')) return new Error('Новая дата не может быть в прошлом.');
  if (message.includes('after the previous workout')) return new Error('Выберите дату позже предыдущей тренировки программы.');
  if (message.includes('Monday, Wednesday or Friday')) return new Error('Выберите понедельник, среду или пятницу.');
  if (message.includes('Tuesday, Thursday or Saturday')) return new Error('Выберите вторник, четверг или субботу.');
  if (message.includes('later workout history')) return new Error('Нельзя перенести тренировку перед уже сохранённой историей.');
  if (message.includes('not found')) return new Error('Тренировка уже изменилась. Обновите экран.');
  return new Error(fallback);
}

export async function rescheduleScheduledWorkout(scheduledWorkoutId, newDate) {
  assertDate(newDate);
  await requireUser();
  const { data, error } = await supabase.rpc('reschedule_scheduled_workout', {
    p_scheduled_workout_id: scheduledWorkoutId,
    p_new_date: newDate,
  });
  if (error || !data) throw mapWorkoutControlError(error, 'Не удалось перенести тренировку.');
  return data;
}

export async function skipScheduledWorkout(scheduledWorkoutId) {
  await requireUser();
  const { data, error } = await supabase.rpc('skip_scheduled_workout', {
    p_scheduled_workout_id: scheduledWorkoutId,
  });
  if (error || !data) throw mapWorkoutControlError(error, 'Не удалось пропустить тренировку.');
  return data;
}
