// New-result contract only. Never reinterpret legacy weight/reps as duration or assistance.
import {configurationFields,parseConfigurationKey} from './exerciseConfiguration.js';
const fields = ['weight','reps','duration_seconds','distance_meters','assistance_weight'];
const formats = {
  weight_reps: { required:['weight','reps'], allowed:['weight','reps'], loads:['barbell_total','dumbbell_each','kettlebell_each','external_total','stack','plates','machine_indicated'] },
  bodyweight_reps: { required:['reps'], allowed:['reps','weight'], loads:['bodyweight'] },
  assisted_reps: { required:['reps','assistance_weight'], allowed:['reps','assistance_weight'], loads:['assistance'] },
  duration: { required:['duration_seconds'], allowed:['duration_seconds'], loads:['bodyweight','none'] },
  carry: { required:['weight'], allowed:['weight','duration_seconds','distance_meters'], loads:['dumbbell_each','kettlebell_each','external_total'] },
  cardio: { required:['duration_seconds'], allowed:['duration_seconds','distance_meters'], loads:['none'] },
};

export function resultFieldsV2(type) {
  return formats[type]?.allowed ?? [];
}

export function formatResultV2(row) {
  if (!row) return '';
  const parts = [];
  if (row.weight != null) parts.push(`${row.weight} кг${['dumbbell_each','kettlebell_each'].includes(row.load_mode) ? ' / снаряд' : ''}`);
  if (row.assistance_weight != null) parts.push(`помощь ${row.assistance_weight} кг`);
  if (row.reps != null) parts.push(`${row.reps} повт.`);
  if (row.duration_seconds != null) parts.push(`${row.duration_seconds} с`);
  if (row.distance_meters != null) parts.push(`${row.distance_meters} м`);
  if (row.side) parts.push(row.side === 'left' ? 'левая сторона' : 'правая сторона');
  if(row.configuration_key && row.configuration_key!=='standard') {
    const settings=parseConfigurationKey(row.configuration_key);
    for(const [key,label] of configurationFields)if(settings[key]!=null)parts.push(`${label}: ${settings[key]}`);
  }
  return parts.join(' · ') || 'Результат не заполнен';
}

export function parseMetricInput(input) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) throw new Error('Введите конечное число.');
    return input;
  }
  if (typeof input !== 'string' || !/^\d+(?:[.,]\d+)?$/.test(input.trim())) throw new Error('Введите число без единиц измерения.');
  const value = Number(input.trim().replace(',','.'));
  if (!Number.isFinite(value)) throw new Error('Введите конечное число.');
  return value;
}

export function validateResultV2(row) {
  const errors = [];
  if (row.metric_version !== 'v2') errors.push('version:v2_required');
  if (!['working','warmup'].includes(row.set_type)) errors.push('invalid:set_type');
  if (typeof row.completed !== 'boolean') errors.push('invalid:completed');
  if (typeof row.exercise_id !== 'string' || !row.exercise_id) errors.push('missing:exercise_id');
  const format = formats[row.measurement_type];
  if (!format) return [...errors,'invalid:measurement_type'];
  if (!format.loads.includes(row.load_mode)) errors.push('invalid:load_mode');
  if (row.weight_unit !== 'kg') errors.push('invalid:weight_unit');
  if (typeof row.configuration_key !== 'string' || !row.configuration_key.trim()) errors.push('missing:configuration_key');
  if (!['bilateral','unilateral','alternating','independent'].includes(row.laterality)) errors.push('invalid:laterality');
  if (['unilateral','independent'].includes(row.laterality)) {
    if (!['left','right'].includes(row.side)) errors.push('missing:side');
  } else if (row.side != null) errors.push('unexpected:side');
  for (const field of fields) {
    const value = row[field];
    if (value == null) continue;
    if (!format.allowed.includes(field)) errors.push(`unexpected:${field}`);
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) errors.push(`invalid:${field}`);
    if (field === 'reps' && (!Number.isInteger(value) || value < 1 || value > 999)) errors.push('invalid:reps');
    if (['duration_seconds','distance_meters'].includes(field) && value <= 0) errors.push(`invalid:${field}`);
    if (['weight','assistance_weight'].includes(field) && value > 10000) errors.push(`invalid:${field}`);
  }
  if (row.completed) {
    for (const field of format.required) if (row[field] == null) errors.push(`missing:${field}`);
    if (row.measurement_type === 'carry' && row.duration_seconds == null && row.distance_meters == null) errors.push('missing:carry_extent');
  }
  return [...new Set(errors)];
}

// Positive = a is better, negative = b is better, zero = equal, null = incomparable.
// No estimated 1RM formula here: preserve the existing legacy formula in its own path.
export function compareResultsV2(a,b) {
  if (validateResultV2(a).length || validateResultV2(b).length) return null;
  if (!a.completed || !b.completed || a.set_type !== 'working' || b.set_type !== 'working') return null;
  for (const key of ['exercise_id','measurement_type','load_mode','weight_unit','configuration_key','laterality','side']) {
    if ((a[key] ?? null) !== (b[key] ?? null)) return null;
  }
  const machineLoad = ['stack','plates','assistance','machine_indicated'].includes(a.load_mode);
  if (machineLoad && (!a.equipment_instance_id || !b.equipment_instance_id)) return null;
  if ((a.equipment_instance_id ?? null) !== (b.equipment_instance_id ?? null)) return null;
  const delta = (x,y) => Math.sign(x-y);
  switch (a.measurement_type) {
    case 'weight_reps':
      // Different reps and weight cannot be ranked without an explicit metric choice.
      if (a.reps === b.reps) return delta(a.weight,b.weight);
      if (a.weight === b.weight) return delta(a.reps,b.reps);
      return null;
    case 'bodyweight_reps':
      // null = no additional weight, never replace with the user's body mass.
      if ((a.weight ?? 0) !== (b.weight ?? 0)) return null;
      return delta(a.reps,b.reps);
    case 'assisted_reps':
      if (a.reps === b.reps) return delta(b.assistance_weight,a.assistance_weight);
      if (a.assistance_weight === b.assistance_weight) return delta(a.reps,b.reps);
      return null;
    case 'duration': return delta(a.duration_seconds,b.duration_seconds);
    case 'carry':
      if (a.weight !== b.weight) return null;
      // Distance-only and time-only tasks are distinct. Do not invent a ranking objective.
      if (a.duration_seconds == null && b.duration_seconds == null) return delta(a.distance_meters,b.distance_meters);
      if (a.distance_meters == null && b.distance_meters == null) return delta(a.duration_seconds,b.duration_seconds);
      if (a.distance_meters != null && b.distance_meters != null && a.duration_seconds === b.duration_seconds) return delta(a.distance_meters,b.distance_meters);
      return null;
    case 'cardio':
      if (a.distance_meters != null && b.distance_meters != null) {
        if (a.distance_meters === b.distance_meters) return delta(b.duration_seconds,a.duration_seconds);
        if (a.duration_seconds === b.duration_seconds) return delta(a.distance_meters,b.distance_meters);
      }
      return null;
    default: return null;
  }
}

export function externalLoadVolumeV2(row) {
  if (validateResultV2(row).length || !row.completed || row.set_type !== 'working') return null;
  if (row.measurement_type !== 'weight_reps') return null;
  // kg-repetitions in the recorded convention (e.g. ONE dumbbell), not total-body work.
  // Callers must not sum across load_mode or equipment contexts.
  return { value: row.weight * row.reps, unit:'kg_reps', load_mode:row.load_mode,
    equipment_instance_id:row.equipment_instance_id ?? null, side:row.side ?? null };
}
