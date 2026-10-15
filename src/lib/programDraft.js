const VERSION = 1;
export function programDraftKey(userId) {
  return userId ? `gym:program-draft:v${VERSION}:${userId}` : null;
}

export function readProgramDraft(storage, key) {
  if (!key) return null;
  const raw = storage.getItem(key);
  if (!raw) return null;
  const draft = JSON.parse(raw);
  if (draft.version !== VERSION || typeof draft.name !== 'string'
    || typeof draft.description !== 'string' || !Array.isArray(draft.categories)
    || ![1, 2, 3].includes(draft.step)
    || !Array.isArray(draft.programWeeks) || draft.programWeeks.length !== 1
    || !draft.programWeeks.every((week) => Array.isArray(week.workouts)
      && week.workouts.every((workout) => typeof workout.name === 'string'
        && Array.isArray(workout.exercises) && workout.exercises.every((exercise) =>
          Array.isArray(exercise.sets))))) throw new Error('Invalid program draft');
  return draft;
}

export function writeProgramDraft(storage, key, draft) {
  if (key) storage.setItem(key, JSON.stringify({ ...draft, version: VERSION }));
}

export function clearProgramDraft(storage, key) {
  if (key) storage.removeItem(key);
}
