import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { catalogDrafts } from '../data/exercise-catalog/index.mjs';
import { muscleGroups,families,patterns,equipment,muscles,additionalEquipment,extraAliases } from '../data/exercise-catalog/dictionaries.mjs';
import { validateCatalogCard,normalizeCatalogSearch } from '../src/lib/exerciseCatalogV2.js';
import { machineProfiles, compatibleProfiles } from '../data/exercise-catalog/machine-profiles.mjs';
import {assertNoCatalogDuplicates} from '../src/lib/exerciseCatalogAudit.js';
const identities=JSON.parse(readFileSync(new URL('../data/exercise-catalog/identities.json',import.meta.url),'utf8'));
const legacyNames=new Map(JSON.parse(readFileSync(new URL('../docs/exercise-catalog-v2/legacy-shared-catalog.json',import.meta.url),'utf8')).map(row=>[row.id,row.name]));
const q=value=>value==null?'null':"'"+String(value).replaceAll("'","''")+"'";
const arr=value=>'array['+value.map(q).join(',')+']::text[]';
const idFor=(table,code)=>{
  const hex=createHash('sha256').update('gym_catalog_v2:'+table+':'+code).digest('hex');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-5${hex.slice(13,16)}-a${hex.slice(17,20)}-${hex.slice(20,32)}`;
};
const ref=(table,code)=>`(select id from public.${table} where code=${q(code)})`;
export const catalogRecords=catalogDrafts.map(card=>({
  ...card,id:identities[card.canonical_key].id,identity_status:'confirmed',
  identity_origin:identities[card.canonical_key].origin,
  identity_evidence:identities[card.canonical_key].evidence ?? card.identity_evidence,
  additional_equipment:[...new Set([...card.additional_equipment,...(additionalEquipment[card.canonical_key]??[])])],
  aliases:[...card.aliases,...[...(extraAliases[card.canonical_key]??[]),...(identities[card.canonical_key].origin==='preserved_legacy'?[legacyNames.get(identities[card.canonical_key].id)]:[])].filter(Boolean).map(alias=>({alias,language:/[а-яё]/i.test(alias)?'ru':'en'}))].filter((item,index,all)=>all.findIndex(other=>normalizeCatalogSearch(other.alias)===normalizeCatalogSearch(item.alias))===index),
}));

export function buildCatalogSeed({publish=false}={}) {
  assertNoCatalogDuplicates(catalogRecords);
  const statements=['-- Generated from reviewed authoring files; NEVER rewrites workout tables.','begin;'];
  const insertDictionary=(table,code,label,extras={})=>{
    const cols=['id','code','name_ru',...Object.keys(extras)];
    statements.push(`insert into public.${table}(${cols.join(',')}) values(${[q(idFor(table,code)),q(code),q(label),...Object.values(extras)].join(',')}) on conflict(code) do update set name_ru=excluded.name_ru;`);
  };
  for(const [code,label] of Object.entries(muscleGroups))insertDictionary('muscle_groups',code,label);
  for(const [code,label] of Object.entries(patterns))insertDictionary('movement_patterns',code,label);
  for(const [code,[label,filter]] of Object.entries(equipment))insertDictionary('equipment_types',code,label,{legacy_filter:q(filter)});
  for(const [code,[label,group]] of Object.entries(muscles))insertDictionary('muscles',code,label,{muscle_group_id:ref('muscle_groups',group)});
  for(const [code,label] of Object.entries(families))insertDictionary('exercise_families',code,label);
  for(const [code,[label,category,loading]] of Object.entries(machineProfiles))
    insertDictionary('machine_profiles',code,label,{machine_category:q(category),loading_mechanism:q(loading)});
  for(const card of catalogRecords){
    const errors=validateCatalogCard(card);
    if(errors.length)throw Error(`${card.canonical_key}: ${errors.join(',')}`);
    for(const code of [...card.primary_muscles,...card.secondary_muscles,...card.stabilizers])if(!muscles[code])throw Error('Unknown muscle '+code);
    const values={
      id:q(card.id),canonical_key:q(card.canonical_key),name:q(card.name_ru),muscle_group:q(muscleGroups[card.muscle_group_code]),
      equipment:q(equipment[card.equipment_code]?.[1]),exercise_type:q(card.activity_type),movement_type:q(patterns[card.movement_pattern_code]),
      family_id:ref('exercise_families',card.family_code),primary_muscle_group_id:ref('muscle_groups',card.muscle_group_code),
      primary_equipment_type_id:ref('equipment_types',card.equipment_code),movement_pattern_id:ref('movement_patterns',card.movement_pattern_code),
      activity_type:q(card.activity_type),mechanics:q(card.mechanics),difficulty:card.difficulty,body_position:q(card.body_position),laterality:q(card.laterality),
      short_description:q(card.short_description),description:q(card.short_description),setup_instructions:arr(card.setup_instructions),
      measurement_note:q(card.measurement_note),target_muscle:q(card.primary_muscles.map(code=>muscles[code][0]).join(', ')),
      synergists:q(card.secondary_muscles.map(code=>muscles[code][0]).join(', ') || null),
      execution_steps:arr(card.execution_steps),technique_cues:arr(card.technique_cues),common_mistakes:arr(card.common_mistakes),safety_notes:arr(card.safety_notes),
      technique:q(card.execution_steps.map((step,i)=>`${i+1}. ${step}`).join('\n')),measurement_type:q(card.measurement_type),load_mode:q(card.load_mode),
      status:q(publish?'published':'review'),source_sheet:q('catalog_v2'),
    };
    // Source provenance of existing rows is preserved; all historical IDs stay intact.
    const updates=Object.keys(values).filter(k=>!['id','source_sheet','status'].includes(k)).map(k=>`${k}=excluded.${k}`);
    // A review seed must not hide an existing exercise referenced by history.
    updates.push(publish ? "status='published'" : "status=case when exercises.status in ('published','legacy','retired') then exercises.status else excluded.status end");
    statements.push(`insert into public.exercises(${Object.keys(values).join(',')}) values(${Object.values(values).join(',')}) on conflict(id) do update set ${updates.join(',')};`);
    for(const table of ['exercise_aliases','exercise_muscles','exercise_equipment'])statements.push(`delete from public.${table} where exercise_id=${q(card.id)};`);
    const seen=new Set();
    for(const alias of card.aliases){
      const key=alias.language+':'+alias.alias.trim().toLocaleLowerCase('ru');if(seen.has(key))continue;seen.add(key);
      statements.push(`insert into public.exercise_aliases(exercise_id,alias,language,alias_type) values(${q(card.id)},${q(alias.alias)},${q(alias.language)},'synonym');`);
    }
    for(const [role,codes] of [['primary',card.primary_muscles],['secondary',card.secondary_muscles],['stabilizer',card.stabilizers]])for(const code of codes)
      statements.push(`insert into public.exercise_muscles values(${q(card.id)},${ref('muscles',code)},${q(role)}) on conflict(exercise_id,muscle_id) do nothing;`);
    for(const [role,codes] of [['main',[card.equipment_code]],['additional',card.additional_equipment]])for(const code of codes){
      if(!equipment[code])throw Error('Unknown equipment '+code);
      statements.push(`insert into public.exercise_equipment values(${q(card.id)},${ref('equipment_types',code)},${q(role)}) on conflict(exercise_id,equipment_type_id) do nothing;`);
    }
    for(const code of compatibleProfiles[card.equipment_code] ?? [])
      statements.push(`insert into public.exercise_machine_profiles(exercise_id,machine_profile_id) values(${q(card.id)},${ref('machine_profiles',code)}) on conflict do nothing;`);
  }
  const mappings=JSON.parse(readFileSync(new URL('../docs/exercise-catalog-v2/legacy-review-queue.json',import.meta.url),'utf8'));
  for(const mapping of mappings){
    const columns=['legacy_source','legacy_exercise_id','legacy_name','canonical_exercise_id','match_type','review_status','review_notes'];
    statements.push(`insert into public.exercise_legacy_mappings(${columns.join(',')}) values(${columns.map(key=>q(mapping[key])).join(',')}) on conflict(legacy_source,legacy_exercise_id) do nothing;`);
  }
  statements.push('commit;');return statements.join('\n');
}
if(process.argv[1]===fileURLToPath(import.meta.url))process.stdout.write(buildCatalogSeed());
