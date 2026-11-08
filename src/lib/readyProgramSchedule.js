/** Selected training days use ISO weekdays: 1=Mon, 7=Sun. */
export const TRAINING_WEEKDAYS = [
  { id: 1, short: 'Пн', full: 'понедельник', pattern: /понед|пн\b/u },
  { id: 2, short: 'Вт', full: 'вторник', pattern: /втор|вт\b/u },
  { id: 3, short: 'Ср', full: 'среда', pattern: /сред|ср\b/u },
  { id: 4, short: 'Чт', full: 'четверг', pattern: /четв|чт\b/u },
  { id: 5, short: 'Пт', full: 'пятница', pattern: /пятн|пт\b/u },
  { id: 6, short: 'Сб', full: 'суббота', pattern: /субб|сб\b/u },
  { id: 7, short: 'Вс', full: 'воскресенье', pattern: /воскр|вс\b/u },
];
const PREFERRED_DAYS = [1, 3, 5, 2, 4, 6, 7];

export function normalizeTrainingWeekdays(days) {
  return [...new Set(Array.isArray(days) ? days.map(Number).filter(day => Number.isInteger(day) && day >= 1 && day <= 7) : [])].sort((a, b) => a - b);
}

export function resizeTrainingWeekdays(days, target) {
  const limit = Math.max(1, Math.min(7, Number(target) || 1));
  const current = normalizeTrainingWeekdays(days);
  if (current.length >= limit) return current.slice(0, limit);
  const added = PREFERRED_DAYS.filter(day => !current.includes(day)).slice(0, limit - current.length);
  return normalizeTrainingWeekdays([...current, ...added]);
}

export function defaultTrainingWeekdays({ details = {}, scheduleMode = 'custom', workoutCount = 3 } = {}) {
  const schedule = String(details?.schedule ?? '').toLocaleLowerCase('ru');
  const selected = TRAINING_WEEKDAYS.filter(({ pattern }) => pattern.test(schedule)).map(({ id }) => id);
  const weekly = scheduleMode === 'weekly_tts' ? [2, 4, 6] : scheduleMode === 'weekly_mwf' ? [1, 3, 5] : [];
  const frequency = Number.parseInt(String(details?.frequency ?? '').match(/\d+/)?.[0] ?? '', 10);
  const recommended = Math.max(1, Math.min(7, Number.isInteger(frequency) ? frequency : Math.min(3, workoutCount || 3)));
  const initial = selected.length ? selected : weekly.length ? weekly : [1, 3, 5].slice(0, recommended);
  return resizeTrainingWeekdays(initial, recommended);
}

export function trainingScheduleLabel(days) {
  const selected = normalizeTrainingWeekdays(days);
  return selected.map(day => TRAINING_WEEKDAYS[day - 1].full).join(', ').replace(/^./u, char => char.toLocaleUpperCase('ru'));
}

export function trainingFrequencyLabel(days) {
  const count = normalizeTrainingWeekdays(days).length;
  const noun = count === 1 ? 'тренировка' : count <= 4 ? 'тренировки' : 'тренировок';
  return `${count} ${noun} в неделю`;
}

export function nextTrainingDate(date, days) {
  const selected = normalizeTrainingWeekdays(days);
  const chosen = String(date || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(chosen) || !selected.length) return '';
  const day = new Date(`${chosen}T12:00:00`);
  for (let offset = 0; offset < 7; offset += 1) {
    const weekday = day.getDay() || 7;
    if (selected.includes(weekday)) {
      const y = day.getFullYear(), m = String(day.getMonth() + 1).padStart(2, '0'), d = String(day.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    day.setDate(day.getDate() + 1);
  }
  return '';
}
