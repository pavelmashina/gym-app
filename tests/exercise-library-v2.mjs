import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCatalogSearch } from '../src/lib/exerciseCatalogV2.js';

const rows = Array.from({length: 501}, (_, i) => ({id: `id-${i}`, name: `Карточка ${i}`, muscle_group:'Грудь', equipment:'Штанга', status:'published', source_sheet:'catalog_v2', owner_id:null}));
rows[0] = {...rows[0], name:'Жим лёжа', aliases:[{alias:'Bench Press',language:'en'}], family_name_ru:'Жимы от груди'};
rows[1] = {...rows[1], owner_id:'alice'};
const legacy = { id:'legacy', name:'Старое упражнение', status:'retired', owner_id:null, equipment:'Гантели', muscle_group:'Ноги' };
const rebuilt = {id:'legs-1', name:'Приседания со штангой на плечах', status:'legacy',
  source_sheet:'Упражнения (Ноги) список', owner_id:null, muscle_group:'Ноги',
  variation_axes:[{label:'Постановка ног',options:['шире плеч','на ширине плеч']}]};
const oldRows = [legacy, { ...rows[0], status:'retired', source_sheet:'catalog_v2' }, rebuilt];
let failRecent = false;
const requests = [];
const client = {
  auth:{getUser:async()=>({data:{user:{id:'alice'}},error:null})},
  from(table) {
    const query = {
      select(){return this},order(){return this},eq(){return this},
      is(){return this},neq(){return this},
      in(){return this},
      async range(start,end){
        requests.push([table,start,end]);
        const source=table==='exercises'?oldRows:rows;
        return {data:source.slice(start,end+1),error:null};
      },
      async limit(){return {data:[{exercise_id:'legacy'},{exercise_id:'id-1'},{exercise_id:'legs-1'}],error:failRecent?new Error('network'):null}},
    };
    return query;
  },
};
globalThis.__catalogTest = {client,normalizeCatalogSearch};
const source = readFileSync(new URL('../src/lib/exerciseLibrary.js',import.meta.url),'utf8')
  .replace("import { supabase } from './supabase.js';",'const supabase = globalThis.__catalogTest.client;')
  .replace("import { normalizeCatalogSearch } from './exerciseCatalogV2.js';",'const normalizeCatalogSearch = globalThis.__catalogTest.normalizeCatalogSearch;')
  .replace("import.meta.env.VITE_EXERCISE_CATALOG_V2 === 'true'",'true');
const library = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const result = await library.listExerciseLibrary();
assert.equal(result.all.length,502,'New leg card joins existing active catalog and own records');
assert.equal(result.mine.length,1);
assert.deepEqual(result.recent.map(x=>x.id),['id-1','legs-1']);
assert(result.all.some(x=>x.id==='legs-1'&&x.variation_axes?.length===1));
assert(!result.all.some(x=>x.id==='legacy'),'Retired exercise never appears in any picker');
assert.deepEqual(requests.map(row => row.join(':')).sort(),[['exercise_catalog_v2',0,499],['exercise_catalog_v2',500,999],['exercises',0,499]].map(row => row.join(':')).sort(), 'Concurrent catalog fetches may resolve in any order');
const complete = await library.listExerciseLibrary({includeLegacy:true});
assert.deepEqual(complete.all.map(x=>x.id),result.all.map(x=>x.id),'Browse-only mode does not revive retired rows');
assert(!complete.all.some(x=>x.id==='legacy'));
assert.equal(library.filterExerciseList(result.all,{query:'  ЖИМ лежа  '}).length,1);
assert.equal(library.filterExerciseList(result.all,{query:'press bench'}).length,1);
assert.equal(library.filterExerciseList(result.all,{query:'жимы груди'}).length,1);
assert.equal(library.filterExerciseList(result.all,{query:'bench',equipment:'Гантели'}).length,0);
assert.equal(library.filterExerciseList(result.recent,{muscleGroup:'Ноги',equipment:'Гантели'}).length,0);
assert(!result.all.some(row=>row.id==='legacy'),'Recent history must not reintroduce duplicate catalogue cards');
failRecent = true;
await assert.rejects(library.listExerciseLibrary(),/недавние/);
delete globalThis.__catalogTest;
console.log('Library v2: imported sheets, retired catalog hiding, user/recents and filters passed.');
