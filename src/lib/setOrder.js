// Order of the sets in an exercise card of an active workout (issue #60).
// Warm-up sets always come before working sets; inside each group the stored set number decides.
// Both kinds of set rows (weight × reps and results v2) are shown in this one order.

export const isWarmupSet = (set) => set?.setType === 'warmup';

export function orderSets(sets) {
  return [...(sets ?? [])].sort((a, b) => Number(isWarmupSet(b)) - Number(isWarmupSet(a)) || a.setNumber - b.setNumber);
}

// Labels follow the shown order: Р1, Р2… for warm-ups and 1, 2… for working sets.
export function labelSets(sets) {
  let working = 0;
  let warmup = 0;
  return sets.map((set) => isWarmupSet(set)
    ? { ...set, displayLabel: `Р${++warmup}`, warmup: true }
    : { ...set, displayLabel: String(++working), warmup: false });
}

// The sets in the given id order; sets the order does not know (added meanwhile) follow in their own order.
export function applySetOrder(sets, orderedIds) {
  const byId = new Map((sets ?? []).map((set) => [set.id, set]));
  const known = orderedIds.map((id) => byId.get(id)).filter(Boolean);
  return [...known, ...orderSets((sets ?? []).filter((set) => !orderedIds.includes(set.id)))];
}

// Moves the dragged set to the place of the target set. A set never crosses
// the warm-up / working boundary, so warm-ups stay on top.
export function moveSet(orderedIds, draggedId, targetId, warmupIds) {
  const from = orderedIds.indexOf(draggedId);
  const to = orderedIds.indexOf(targetId);
  if (from < 0 || to < 0 || from === to) return orderedIds;
  if (warmupIds.has(draggedId) !== warmupIds.has(targetId)) return orderedIds;
  const next = [...orderedIds];
  next.splice(to, 0, ...next.splice(from, 1));
  return next;
}

// What the server stores after a reorder: numbers 1..n in the shown order.
export function renumberSets(sets, orderedIds) {
  return applySetOrder(sets, orderedIds).map((set, index) => ({ ...set, setNumber: index + 1 }));
}

export const sameSetOrder = (a, b) => a.length === b.length && a.every((id, index) => id === b[index]);
