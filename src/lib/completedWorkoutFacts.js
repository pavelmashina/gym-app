import { workingTonnage } from './completedWorkoutTonnage.js';

// #107: the rows of the home «Тренировка» card once the workout is done.
// Pure helpers: no Supabase here, so tests can run them.

// Whole minutes, as a person would say it: «52 мин», «1 ч 5 мин», «2 ч».
// Anything started counts as at least a minute; no time at all gives no row.
export function formatWorkoutDuration(seconds) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return '';
  const minutes = Math.max(1, Math.round(total / 60));
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${rest} мин` : `${hours} ч`;
}

// «4 850 кг», the same number as on the result screen. From 100 tonnes the value
// switches to tonnes: six digits and «кг» do not fit the row on a 375px phone.
export function formatWorkoutTonnage(kilograms) {
  const total = Math.round(Number(kilograms));
  if (!Number.isFinite(total) || total <= 0) return '';
  if (total >= 100000) return `${(total / 1000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} т`;
  return `${total.toLocaleString('ru-RU')} кг`;
}

// A row with nothing to say is left out: a workout marked done by hand has no time,
// and one made of bodyweight or cardio exercises has no tonnage.
export function completedWorkoutFacts(summary) {
  if (!summary) return [];
  return [
    { key: 'duration', label: 'Время', value: formatWorkoutDuration(summary.durationSeconds) },
    { key: 'tonnage', label: 'Тоннаж', value: formatWorkoutTonnage(summary.tonnage) },
  ].filter((fact) => fact.value);
}

// Tonnage of `performed_sets` rows as they are stored, by the rules of the result screen.
export function tonnageFromSetRows(rows) {
  return workingTonnage((rows ?? []).map((row) => ({
    completed: row.completed,
    setType: row.set_type,
    weight: row.weight ?? '',
    reps: row.reps ?? '',
    resultV2: row.result_v2 ?? null,
  })));
}
