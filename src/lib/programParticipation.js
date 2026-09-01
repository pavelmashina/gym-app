import { supabase } from './supabase.js';

function assertDate(value, message) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value ?? '')) throw new Error(message);
}

async function requireUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) throw new Error('Сессия истекла. Войдите в аккаунт ещё раз.');
}

function mapParticipationError(error, fallback) {
  const message = error?.message ?? '';
  if (message.includes('active workout')) return new Error('Сначала завершите или отмените текущую тренировку.');
  if (message.includes('Monday, Wednesday or Friday')) return new Error('Выберите понедельник, среду или пятницу.');
  if (message.includes('Tuesday, Thursday or Saturday')) return new Error('Выберите вторник, четверг или субботу.');
  if (message.includes('no remaining scheduled workouts')) return new Error('В программе не осталось запланированных тренировок.');
  if (message.includes('not found')) return new Error('Статус программы уже изменился. Обновите экран.');
  return new Error(fallback);
}

export async function pauseProgram(userProgramId) {
  await requireUser();
  const { data, error } = await supabase.rpc('pause_program', { p_user_program_id: userProgramId });
  if (error || !data) throw mapParticipationError(error, 'Не удалось поставить программу на паузу.');
  return data;
}

export async function resumeProgram(userProgramId, resumeDate) {
  assertDate(resumeDate, 'Выберите дату следующей тренировки.');
  await requireUser();
  const { data, error } = await supabase.rpc('resume_program', {
    p_user_program_id: userProgramId,
    p_resume_date: resumeDate,
  });
  if (error || !data) throw mapParticipationError(error, 'Не удалось возобновить программу.');
  return data;
}

export async function completeProgram(userProgramId) {
  await requireUser();
  const { data, error } = await supabase.rpc('complete_program', { p_user_program_id: userProgramId });
  if (error || !data) throw mapParticipationError(error, 'Не удалось завершить программу.');
  return data;
}
