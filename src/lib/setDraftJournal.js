// A weight or rep count typed while offline must survive the app being closed.
// An entry exists only until the server acknowledges that set.
const PREFIX = 'gym-set-draft-v1:';

export function readSetDraft(setId) {
  try {
    const stored = JSON.parse(localStorage.getItem(`${PREFIX}${setId}`) ?? 'null');
    return stored && typeof stored === 'object' ? stored : null;
  } catch {
    return null;
  }
}

export function writeSetDraft(setId, draft) {
  try { localStorage.setItem(`${PREFIX}${setId}`, JSON.stringify(draft)); } catch {}
}

export function clearSetDraft(setId) {
  try { localStorage.removeItem(`${PREFIX}${setId}`); } catch {}
}
