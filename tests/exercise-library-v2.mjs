import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCatalogSearch } from '../src/lib/exerciseCatalogV2.js';

const rows = Array.from({length: 501}, (_, i) => ({id: `id-${i}`, name: `Карточка ${i}`, muscle_group:'Грудь', equipment:'Штанга'}));
rows[0] = {...rows[0], name:'Жим лёжа', aliases:[{alias:'Bench Press',language:'en'}], family_name_ru:'Жимы от груди'};
rows[1] = {...rows[1], owner_id:'alice'};
const legacy = {id:'legacy', name:'Старое упражнение', equipment:'Гантели', muscle_group:'Ноги'};
let failRecent = false;
const requests = [];
const client = {
  auth:{getUser:async()=>({data:{user:{id:'alice'}},error:null})},
  from(table) {
    const query = {select(){return this},order(){return this},eq(){return this},
      async range(start,end){requests.push([table,start,end]);return {data:rows.slice(start,end+1),error:null}},
      async limit(){return {data:[{exercise_id:'legacy'},{exercise_id:'id-1'}],error:failRecent?new Error('network'):null}},
      async in(column,ids){assert.equal(table,'exercises');assert.deepEqual(ids,['legacy']);return {data:[legacy],error:null}},
    };
    return query;
  },
};
globalThis.__catalogTest = {client,normalizeCatalogSearch};
const source = readFileSync(new URL('../src/lib/exerciseLibrary.js',import.meta.url),'utf8')
  .replace("import { supabase } from './supabase.js';",'const supabase = globalThis.__catalogTest.client;')
  .replace("import { normalizeCatalogSearch } from './exerciseCatalogV2.js';",'const normalizeCatalogSearch = globalThis.__catalogTest.normalizeCatalogSearch;')
  .replace("import.meta.env.VITE_EXERCISE_CATALOG_V2 === 'true'",'true');
const library = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
const result = await library.listExerciseLibrary();
assert.equal(result.all.length,501);
assert.equal(result.mine.length,1);
assert.deepEqual(result.recent.map(x=>x.id),['id-1']);
assert.deepEqual(requests,[['exercise_catalog_v2',0,499],['exercise_catalog_v2',500,999]]);
assert.equal(library.filterExerciseList(result.all,{query:'  ЖИМ лежа  '}).length,1);
assert.equal(library.filterExerciseList(result.all,{query:'press bench'}).length,1);
assert.equal(library.filterExerciseList(result.all,{query:'жимы груди'}).length,1);
assert.equal(library.filterExerciseList(result.all,{query:'bench',equipment:'Гантели'}).length,0);
assert.equal(library.filterExerciseList(result.recent,{muscleGroup:'Ноги',equipment:'Гантели'}).length,0);
assert(!result.all.some(row=>row.id==='legacy'),'Recent history must not reintroduce duplicate catalogue cards');
failRecent = true;
await assert.rejects(library.listExerciseLibrary(),/недавние/);
delete globalThis.__catalogTest;
console.log('Library v2: pagination, aliases, token search, combined filters, private/recent and legacy retention passed.');
