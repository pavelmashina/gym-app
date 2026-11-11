import { resultFieldsV2, validateResultV2 } from './exerciseResultsV2.js';

const editableMetrics = ['weight', 'reps', 'assistance_weight'];

export function editableCompletedSetFields(set) {
  return set.resultV2
    ? resultFieldsV2(set.resultV2.measurement_type).filter(field => editableMetrics.includes(field))
    : ['weight', 'reps'];
}

export function initialCompletedSetDraft(set) {
  return {
    weight: set.resultV2?.weight ?? set.weight ?? '',
    reps: set.resultV2?.reps ?? set.reps ?? '',
    assistance_weight: set.resultV2?.assistance_weight ?? '',
    completed: Boolean(set.completed),
  };
}

function numericValue(raw, field) {
  const input = String(raw ?? '').trim();
  if (!input) return null;
  const n = Number(input);
  if (!Number.isFinite(n) || n < 0 || n > (field === 'reps' ? 999 : 10000))
    throw new Error(field === 'reps' ? 'Проверьте число повторений.' : 'Вес должен быть от 0 до 10 000 кг.');
  if (field === 'reps' && (n < 1 || !/^\d+$/.test(input)))
    throw new Error('Повторения должны быть от 1 до 999.');
  return n;
}

// Checking "Выполнен" is explicit: typed values alone never change status.
// This prepares an updatePerformedSet payload and validates it before any write.
export function prepareCompletedSetUpdate(set, draft) {
  if (!draft) return null;
  const completed = Boolean(draft.completed);
  let modified = completed !== Boolean(set.completed);
  if (set.resultV2) {
    const next = { ...set.resultV2 };
    for (const field of editableCompletedSetFields(set)) {
      const value = numericValue(draft[field], field);
      if ((next[field] ?? null) !== value) {
        next[field] = value;
        modified = true;
      }
    }
    if (!modified) return null;
    const resultV2 = { ...next, completed, set_type: set.setType };
    if (validateResultV2(resultV2).length)
      throw new Error('Нельзя сохранить подход: проверьте обязательные показатели результата и сторону выполнения.');
    return { ...set, resultV2, completed };
  }
  const rawWeight = numericValue(draft.weight, 'weight');
  const rawReps = numericValue(draft.reps, 'reps');
  const weight = rawWeight === null ? '' : String(rawWeight);
  const reps = rawReps === null ? '' : String(rawReps);
  if (completed && rawReps === null)
    throw new Error('Чтобы отметить подход выполненным, укажите количество повторений.');
  modified ||= weight !== String(set.weight ?? '') || reps !== String(set.reps ?? '');
  return modified ? { ...set, weight, reps, completed, resultV2: null } : null;
}
