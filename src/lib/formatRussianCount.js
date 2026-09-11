export function formatRussianCount(count, forms) {
  const value = Math.abs(Number(count) || 0);
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} ${forms[2]}`;
  if (mod10 === 1) return `${count} ${forms[0]}`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} ${forms[1]}`;
  return `${count} ${forms[2]}`;
}

export const formatExerciseCount = (count) => formatRussianCount(count, ['упражнение', 'упражнения', 'упражнений']);
export const formatWorkoutCount = (count) => formatRussianCount(count, ['тренировка', 'тренировки', 'тренировок']);
