import {normalizeCatalogSearch} from './exerciseCatalogV2.js';

export function normalizeExerciseIdentity(value) {
  return normalizeCatalogSearch(value).replace(/[^\p{L}\p{N}]+/gu,' ').trim().replace(/\s+/g,' ');
}

function collisions(entries) {
  const groups=new Map();
  for(const [value,key] of entries){if(!value)continue;const group=groups.get(value)||new Set();group.add(key);groups.set(value,group);}
  return [...groups].filter(([,keys])=>keys.size>1).map(([value,keys])=>({value,keys:[...keys].sort()}));
}

export function auditExerciseCatalog(cards) {
  const keys=cards.map((card,index)=>[card.canonical_key,String(index)]);
  const ids=cards.map(card=>[card.id,card.canonical_key]);
  const labels=cards.flatMap(card=>[card.name_ru,...(card.aliases||[]).map(a=>a.alias)].map(label=>[normalizeExerciseIdentity(label),card.canonical_key]));
  const signature=card=>[card.family_code,card.equipment_code,card.movement_pattern_code,card.body_position,card.laterality].join('|');
  const techniques=cards.map(card=>[normalizeExerciseIdentity((card.execution_steps||[]).join(' '))+'|'+card.equipment_code,card.canonical_key]);
  return {duplicateKeys:collisions(keys),duplicateIds:collisions(ids),labelCollisions:collisions(labels),
    identicalTechniques:collisions(techniques),similarVariants:collisions(cards.map(card=>[signature(card),card.canonical_key]))};
}

export function findLegacyNameOverlaps(cards,legacy) {
  const labels=new Map();
  for(const card of cards)for(const label of [card.name_ru,...card.aliases.map(a=>a.alias)]){
    const key=normalizeExerciseIdentity(label);labels.set(key,[...(labels.get(key)||[]),card]);
  }
  return legacy.flatMap(row=>(labels.get(normalizeExerciseIdentity(row.name))||[]).filter(card=>card.id!==row.id)
    .map(card=>({legacy_id:row.id,legacy_name:row.name,canonical_key:card.canonical_key,canonical_id:card.id})));
}

export function assertNoCatalogDuplicates(cards) {
  const audit=auditExerciseCatalog(cards);
  for(const field of ['duplicateKeys','duplicateIds','labelCollisions','identicalTechniques'])
    if(audit[field].length)throw new Error(`Catalog duplicate gate: ${field}: ${JSON.stringify(audit[field])}`);
  return audit;
}
