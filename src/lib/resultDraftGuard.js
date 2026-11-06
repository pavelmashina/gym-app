// Only mounted editors participate; no account data is retained after unmount.
const dirtyEditors = new Set();
const setFlushers = new Map();
export function markResultDraft(id,dirty) { if(dirty)dirtyEditors.add(id);else dirtyEditors.delete(id); }
export function assertResultsSaved() {
  if(dirtyEditors.size)throw new Error('Есть несохранённые подходы. Подтвердите их галочкой или нажмите «Отменить», а затем повторите.');
}
// Autosaving rows register here so that finishing or pausing waits for what was just typed.
export function registerSetFlusher(id,flush) {
  setFlushers.set(id,flush);
  return () => { if(setFlushers.get(id)===flush)setFlushers.delete(id); };
}
export async function flushPendingSetEdits() {
  const results = await Promise.allSettled([...setFlushers.values()].map((flush) => flush()));
  const failed = results.find((result) => result.status === 'rejected');
  if(failed)throw failed.reason;
}
