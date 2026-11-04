import { formatRussianCount } from './formatRussianCount.js';

/** Display only sets, reps and rest; ignore free-form technique notes. */
export function formatProgramExerciseSummary(exercise) {
  const raw = String(exercise?.prescription || '').trim();
  const sets = Array.isArray(exercise?.sets) ? exercise.sets : [];
  let main = '';
  const patterns = [...raw.matchAll(/(\d{1,2})\s*(?:[×xх*]\s*|подход(?:а|ов)?\s*(?:по|на)?\s*)(\d{1,3})(?:\s*[-–]\s*(\d{1,3}))?/gi)];
  if (patterns.length) {
    main = patterns.slice(0,3).map(match => {
      const count = Number(match[1]);
      const range = match[3] ? `${match[2]}–${match[3]}` : match[2];
      return `${formatRussianCount(count,['подход','подхода','подходов'])} по ${range} раз`;
    }).join(' + ');
  } else if (sets.length) {
    const reps = sets.map(set => Number(set?.reps)).filter(n => Number.isInteger(n) && n > 0);
    if (reps.length) {
      const unique = [...new Set(reps)];
      const range = unique.length === 1 ? String(unique[0]) : `${Math.min(...reps)}–${Math.max(...reps)}`;
      main = `${formatRussianCount(sets.length,['подход','подхода','подходов'])} по ${range} раз`;
    } else main = formatRussianCount(sets.length,['подход','подхода','подходов']);
  } else {
    const onlySets = raw.match(/(\d{1,2})\s*(?:подход(?:а|ов)?|круг(?:а|ов)?)/i);
    if (onlySets) main = formatRussianCount(Number(onlySets[1]),['подход','подхода','подходов']);
  }
  if (!main) main = 'Подходы и повторения не указаны';
  const sides = /на каждую (?:ногу|руку|сторону)|на кажд[оые] (?:ноги|руки|стороны)/i.test(raw);
  if (sides && !main.includes('на каждую')) main += ' на каждую сторону';
  const rest = raw.match(/отдых\s*[:—-]?\s*(\d+)(?:\s*[-–]\s*(\d+))?\s*(секунд\w*|сек\.?|минут\w*|мин\.?)/i);
  if (rest) {
    const convert = v => {
      const num = Number(v);
      if (/мин/.test(rest[3])) return `${num} мин`;
      if (num >= 60) return `${Math.floor(num / 60)} мин${num % 60 ? ` ${num % 60} сек` : ''}`;
      return `${num} сек`;
    };
    const readable = rest[2]
      ? (/мин/.test(rest[3]) ? `${rest[1]}–${rest[2]} мин` : `${rest[1]}–${rest[2]} сек`)
      : convert(rest[1]);
    main += ` · отдых ${readable}`;
  }
  return main;
}
