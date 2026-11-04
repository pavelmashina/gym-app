/** Unique calendar-day ticks. Never label one workout as eight same-day points. */
export function dateTicks(firstKey, lastKey, count = 8) {
  const parse = key => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(key ?? ''))) return null;
    const value = new Date(`${key}T12:00:00Z`);
    return Number.isNaN(value.getTime()) || value.toISOString().slice(0,10) !== key ? null : value;
  };
  const first = parse(firstKey);
  const last = parse(lastKey);
  if (!first || !last) return [];
  const days = Math.round((last.getTime() - first.getTime()) / 86400000);
  if (days <= 0) return [firstKey];
  const tickCount = Math.min(Math.max(1, Math.floor(count)), days + 1);
  if (tickCount === 1) return [firstKey];
  const unique = new Set();
  for (let i = 0; i < tickCount; i++) {
    const day = Math.round((days * i) / (tickCount - 1));
    unique.add(new Date(first.getTime() + day * 86400000).toISOString().slice(0,10));
  }
  return [...unique];
}
