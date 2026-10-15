// Only mounted editors participate; no account data is retained after unmount.
const dirtyEditors = new Set();
export function markResultDraft(id,dirty) { if(dirty)dirtyEditors.add(id);else dirtyEditors.delete(id); }
export function assertResultsSaved() {
  if(dirtyEditors.size)throw new Error('Есть несохранённые подходы. Нажмите «Сохранить» или «Отменить изменения» перед выходом, заменой упражнения или завершением тренировки.');
}
