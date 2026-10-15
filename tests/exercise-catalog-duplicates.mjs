import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {catalogRecords} from '../scripts/exercise-catalog-seed.mjs';
import {distinctVariants} from '../data/exercise-catalog/distinct-variants.mjs';
import {reviewedMatches,reviewedLegacyPairs} from '../data/exercise-catalog/legacy-reviewed-matches.mjs';
import {assertNoCatalogDuplicates,findLegacyNameOverlaps,normalizeExerciseIdentity} from '../src/lib/exerciseCatalogAudit.js';
const read=name=>JSON.parse(readFileSync(new URL('../docs/exercise-catalog-v2/'+name,import.meta.url),'utf8'));
const audit=assertNoCatalogDuplicates(catalogRecords);
const legacyById=new Map(read('legacy-shared-catalog.json').map(row=>[row.id,row]));
for(const [key,id,reason] of reviewedMatches){
  assert(legacyById.has(id));assert(reason.length>40);
  assert.equal(catalogRecords.find(c=>c.canonical_key===key).id,id);
}
for(const pair of reviewedLegacyPairs){
  assert.equal(pair.ids.length,2);assert(pair.ids.every(id=>legacyById.has(id)));
  assert(['duplicate','distinct','needs_clarification'].includes(pair.decision));
  if(pair.decision==='duplicate'){
    const [a,b]=pair.ids.map(id=>legacyById.get(id));
    assert(a.technique);assert.equal(a.technique,b.technique);assert.equal(a.equipment,b.equipment);
  }
}
assert.equal(catalogRecords.length,109);
assert.equal(new Set(catalogRecords.map(c=>c.id)).size,109);
assert.equal(catalogRecords.filter(c=>c.identity_origin==='preserved_legacy').length,21);
assert.equal(catalogRecords.find(c=>c.canonical_key==='lying_ez_triceps_extension').aliases.find(a=>a.alias==='Французский жим лёжа с EZ-грифом').language,'ru');
assert.deepEqual(findLegacyNameOverlaps(catalogRecords,read('legacy-shared-catalog.json')),[]);
assert.equal(audit.similarVariants.length,13);
for(const group of audit.similarVariants){
  const review=distinctVariants.find(([keys])=>JSON.stringify([...keys].sort())===JSON.stringify(group.keys));
  assert(review && review[1].length>20,`Unreviewed similar group: ${group.keys}`);
}
for(const item of read('required-catalog-manifest.json')){
  const card=catalogRecords.find(c=>c.canonical_key===item.canonical_key);
  assert.equal(item.exercise_id,card.id);
  assert.equal(item.identity_origin,card.identity_origin);
}
for(const mapping of read('legacy-review-queue.json').filter(x=>x.review_status==='confirmed')){
  assert.equal(mapping.canonical_exercise_id,mapping.legacy_exercise_id);
  assert(catalogRecords.some(c=>c.id===mapping.canonical_exercise_id && c.identity_origin==='preserved_legacy'));
}
const duplicate={...catalogRecords[0],id:'other-id',canonical_key:'duplicate'};
assert.throws(()=>assertNoCatalogDuplicates([...catalogRecords,duplicate]),/duplicate gate/);
const ambiguous={...catalogRecords[1],aliases:[...catalogRecords[1].aliases,{alias:'ПРИСЕДАНИЯ — СО ШТАНГОЙ НА СПИНЕ',language:'ru'}]};
assert.throws(()=>assertNoCatalogDuplicates(catalogRecords.map(c=>c.id===ambiguous.id?ambiguous:c)),/labelCollisions/);
assert.equal(normalizeExerciseIdentity('«ЖИМ—лёжа»'),'жим лежа');
console.log('Duplicate audit: 109 unique identities, zero label/alias/technique collisions, 13 reviewed variant groups, zero cross-ID exact legacy name overlaps. Not a claim that all legacy semantic duplicates are resolved.');
