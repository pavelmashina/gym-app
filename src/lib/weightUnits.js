// Issue #101: weights are stored in kilograms. The unit chosen for an exercise ('kg' or 'lb')
// changes only what the workout screen shows and accepts. Pounds are written «lbs» everywhere.
export const KG_PER_LB = 0.45359237;

export const weightUnitLabel = (unit) => (unit === 'lb' ? 'lbs' : 'кг');

const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

export function toDisplayWeight(weightKg, unit) {
  if (weightKg === '' || weightKg === null || weightKg === undefined) return '';
  const value = Number(weightKg);
  if (!Number.isFinite(value)) return '';
  return String(round(unit === 'lb' ? value / KG_PER_LB : value, 2));
}

export function fromDisplayWeight(value, unit) {
  if (value === '') return '';
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed)) return '';
  return String(round(unit === 'lb' ? parsed * KG_PER_LB : parsed, 2));
}

// A results v2 weight typed in pounds, as kilograms. Three decimals, so that every pound value
// with up to two decimals comes back unchanged (22.5 lbs → 10.206 kg → 22.5 lbs; two decimals give 22.51).
// Text that is not a plain number is returned as it is: the row's own validation rejects it.
export function poundsInputToKg(value) {
  if (typeof value !== 'string' || !/^\d+(?:[.,]\d+)?$/.test(value.trim())) return value;
  return round(Number(value.trim().replace(',', '.')) * KG_PER_LB, 3);
}
