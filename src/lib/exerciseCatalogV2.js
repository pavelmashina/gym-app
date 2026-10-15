// Pure v2 authoring/search contracts. The v2 reader is enabled only after database rollout.
export function normalizeCatalogSearch(value) {
  return String(value ?? '').normalize('NFKC').toLocaleLowerCase('ru').replaceAll('ё','е')
    .replace(/[«»“”"']/g, '').replace(/[-–—]/g, ' ').replace(/\s+/g, ' ').trim();
}

export function searchCatalogV2(cards, { query = '', muscleGroupCode = '', equipmentCode = '' } = {}) {
  const tokens = normalizeCatalogSearch(query).split(' ').filter(Boolean);
  return cards.filter(card => {
    if (muscleGroupCode && card.muscle_group_code !== muscleGroupCode) return false;
    if (equipmentCode && card.equipment_code !== equipmentCode && !(card.additional_equipment ?? []).includes(equipmentCode)) return false;
    const text = normalizeCatalogSearch([
      card.name_ru, card.family_name_ru, card.family_code, card.equipment_name_ru, card.equipment_code,
      ...(card.aliases ?? []).map(alias => alias.alias),
    ].filter(Boolean).join(' '));
    return tokens.every(token => text.includes(token));
  });
}

export function validateCatalogCard(card, { requireResolvedIdentity = true } = {}) {
  const errors = [];
  const requiredText = ['canonical_key','name_ru','family_code','muscle_group_code','equipment_code',
    'movement_pattern_code','short_description','measurement_note','identity_evidence','provenance'];
  for (const field of requiredText) if (typeof card[field] !== 'string' || !card[field].trim()) errors.push(`missing:${field}`);
  if (!/^[a-z][a-z0-9_]*$/.test(card.canonical_key ?? '')) errors.push('invalid:canonical_key');
  if (!['draft','review','published'].includes(card.status)) errors.push('invalid:status');
  if (!['strength','isometric','mobility','cardio','other'].includes(card.activity_type)) errors.push('invalid:activity_type');
  if (!['multi_joint','single_joint','isometric','mixed'].includes(card.mechanics)) errors.push('invalid:mechanics');
  if (![1,2,3].includes(card.difficulty)) errors.push('invalid:difficulty');
  if (!['standing','seated','supine','prone','inclined','hanging','kneeling','side_lying','mixed'].includes(card.body_position)) errors.push('invalid:body_position');
  if (!['bilateral','unilateral','alternating','independent'].includes(card.laterality)) errors.push('invalid:laterality');
  if (!['weight_reps','bodyweight_reps','assisted_reps','duration','carry','cardio'].includes(card.measurement_type)) errors.push('invalid:measurement_type');
  if (!['barbell_total','dumbbell_each','kettlebell_each','external_total','bodyweight','stack','plates','machine_indicated','assistance','none'].includes(card.load_mode)) errors.push('invalid:load_mode');
  for (const field of ['primary_muscles','setup_instructions','execution_steps','technique_cues','common_mistakes','safety_notes']) {
    if (!Array.isArray(card[field]) || card[field].length === 0 || card[field].some(x => typeof x !== 'string' || !x.trim())) errors.push(`missing:${field}`);
  }
  if (!Array.isArray(card.execution_steps) || card.execution_steps.length < 3 || card.execution_steps.length > 6) errors.push('invalid:execution_steps');
  if (!Array.isArray(card.aliases) || !card.aliases.some(a => a.language === 'en' && a.alias?.trim())) errors.push('missing:english_alias');
  const aliases = new Set();
  for (const alias of card.aliases ?? []) {
    const key = alias.language + ':' + normalizeCatalogSearch(alias.alias);
    if (!['ru','en'].includes(alias.language) || !String(alias.alias ?? '').trim()) errors.push('invalid:alias');
    if (aliases.has(key)) errors.push('duplicate:alias');
    aliases.add(key);
  }
  if (requireResolvedIdentity && (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(card.id ?? '') || card.identity_status !== 'confirmed')) errors.push('unresolved:identity');
  if (card.measurement_type === 'assisted_reps' && card.load_mode !== 'assistance') errors.push('invalid:assistance_load');
  if (card.activity_type === 'isometric' && card.measurement_type !== 'duration') errors.push('invalid:isometric_measurement');
  for (const media of card.media ?? []) {
    if (!media.storage_path || !media.copyright_source || !media.license_info) errors.push('missing:media_rights');
  }
  return errors;
}
