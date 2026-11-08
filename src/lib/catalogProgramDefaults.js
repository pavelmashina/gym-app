/** Number of cycles prescribed by an original catalog program.
 * Prefer an explicit repeat count; otherwise interpret the program's duration
 * against the number of weeks represented by a single template cycle. */
export function catalogProgramCycleCount(sourcePayload) {
  const payload = sourcePayload ?? {};
  const explicit = payload.cycle_repeat_count ?? payload.cycleRepeatCount
    ?? payload.cycle?.repeat_count ?? payload.cycle?.repeatCount;
  const number = Number(explicit);
  if (explicit !== null && explicit !== undefined && explicit !== '' && Number.isInteger(number) && number >= 1) {
    return Math.min(52, number);
  }
  const duration = String(payload.details?.duration ?? payload.duration ?? '');
  const match = duration.match(/(\d+)\s*(?:нед(?:ел(?:я|и|ь|ю|ей)?)?\.?|weeks?)/i);
  if (!match) return 1;
  const weeks = Number(match[1]);
  const cycleWeeks = Math.max(1, Number(payload.source_week_count) || 1);
  return Math.max(1, Math.min(52, Math.ceil(weeks / cycleWeeks)));
}
