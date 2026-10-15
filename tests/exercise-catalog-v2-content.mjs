import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { referenceCards } from '../data/exercise-catalog/reference-cards.mjs';
import { catalogDrafts } from '../data/exercise-catalog/index.mjs';
import { searchCatalogV2, validateCatalogCard } from '../src/lib/exerciseCatalogV2.js';
const legacy = JSON.parse(readFileSync(new URL('../docs/exercise-catalog-v2/legacy-shared-catalog.json',import.meta.url),'utf8'));
const manifest = JSON.parse(readFileSync(new URL('../docs/exercise-catalog-v2/required-catalog-manifest.json',import.meta.url),'utf8'));
assert.equal(referenceCards.length,6);
assert.equal(catalogDrafts.length,109);
assert.equal(new Set(catalogDrafts.map(x=>x.canonical_key)).size,109);
assert.equal(new Set(catalogDrafts.map(x=>x.name_ru)).size,109);
for (const item of manifest) assert(catalogDrafts.some(card=>card.name_ru===item.required_name),item.required_name);
assert.equal(new Set(catalogDrafts.filter(x=>x.id).map(x=>x.id)).size,9);
for (const card of catalogDrafts) {
  assert.deepEqual(validateCatalogCard(card,{requireResolvedIdentity:false}),[],card.name_ru);
  assert(manifest.some(x=>x.required_name===card.name_ru));
  if(card.id) assert(legacy.some(x=>x.id===card.id));
}
assert.equal(new Set(referenceCards.map(x=>x.canonical_key)).size,6);
for (const card of referenceCards) {
  assert.deepEqual(validateCatalogCard(card,{requireResolvedIdentity:false}),[],card.name_ru);
  assert(manifest.some(x=>x.required_name===card.name_ru));
  assert.equal(card.status,'review');
  if (card.id) {
    assert(legacy.some(x=>x.id===card.id),'Confirmed ID must already exist');
    assert.deepEqual(validateCatalogCard(card),[]);
  } else assert(validateCatalogCard(card).includes('unresolved:identity'));
}
assert.equal(referenceCards.filter(x=>x.id).length,4);
assert.equal(new Set(referenceCards.map(x=>JSON.stringify(x.execution_steps))).size,6);
assert.equal(searchCatalogV2(referenceCards,{query:'ЖИМ лежа',equipmentCode:'barbell'}).length,1);
assert.equal(searchCatalogV2(referenceCards,{query:'bench press',muscleGroupCode:'legs'}).length,0);
assert.equal(searchCatalogV2(referenceCards,{query:'Forearm Plank'})[0].canonical_key,'forearm_plank');
assert.equal(searchCatalogV2(referenceCards,{query:'Румынская',equipmentCode:'barbell'})[0].load_mode,'barbell_total');
assert.equal(searchCatalogV2(referenceCards,{query:'',muscleGroupCode:'legs'}).length,2);
assert(validateCatalogCard({...referenceCards[0],execution_steps:['']}).includes('missing:execution_steps'));
assert(validateCatalogCard({...referenceCards[5],measurement_type:'weight_reps'}).includes('invalid:isometric_measurement'));
assert(validateCatalogCard({...referenceCards[0],load_mode:'stack',measurement_type:'assisted_reps'}).includes('invalid:assistance_load'));
assert(validateCatalogCard({...referenceCards[0],media:[{storage_path:'placeholder'}]}).includes('missing:media_rights'));
console.log('Catalog content: all 109 required cards. Search/filter and validation tests passed; resolved identities checked separately by duplicate/seed tests. Not published.');
