import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizeCatalogSearch } from '../src/lib/exerciseCatalogV2.js';

const rows = Array.from({length: 501}, (_, i) => ({id: `id-${i}`, name: `Карточка ${i}`, muscle_group:'Грудь', equipment:'Штанга', status:'published', source_sheet:'catalog_v2', owner_id:null}));
rows[0] = {...rows[0], name:'Жим лёжа', aliases:[{alias:'Bench Press',language:'en'}], family_name_ru:'Жимы от груди'};
rows[1] = {...rows[1], owner_id:'alice'};
const legacy = { id:'legacy', name:'Старое упражнение', status:'retired', owner_id:null, equipment:'Гантели', muscle_group:'Ноги' };
const rebuilt = {id:'legs-1', name:'Приседания со штангой на плечах', status:'legacy',
  source_sheet:'Упражнения (Ноги) список', owner_id:null, muscle_group:'Ноги',
  variation_axes:[{label:'Постановка ног',options:['шире плеч','на ширине плеч']}],
  muscle_tags:['Передняя поверхность бедра (ППБ)','Ягодицы','Приводящие']};
const oldRows = [legacy, { ...rows[0], status:'retired', source_sheet:'catalog_v2' }, rebuilt];
let apiPageCap = Infinity;
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
        return {data:source.slice(start,Math.min(end+1,start+apiPageCap)),count:Number.isFinite(apiPageCap)?source.length:undefined,error:null};
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
  .replace("import { signVariationMedia } from './exerciseVariationSelection.js';", 'const signVariationMedia = async axes => axes;')
  .replace("import.meta.env.VITE_EXERCISE_CATALOG_V2 === 'true'",'true');
const library = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
const result = await library.listExerciseLibrary();
assert.equal(result.all.length,502,'New leg card joins existing active catalog and own records');
assert.equal(result.mine.length,1);
assert.deepEqual(result.recent.map(x=>x.id),['id-1','legs-1']);
assert(result.all.some(x=>x.id==='legs-1'&&x.variation_axes?.length===1));
const legs=result.all.find(x=>x.id==='legs-1');
assert.deepEqual(library.exerciseMuscleTags(legs),['ППБ','Ягодицы','Приводящие']);
assert.equal(legs.display_muscle_group,'ППБ','Primary label uses compact approved name');
assert.equal(library.displayMuscleTag('Задняя поверхность бедра (ЗПБ)'), 'ЗПП');
assert.equal(library.displayMuscleTag('Передняя поверхность бедра (ППБ)'), 'ППБ');
assert(library.EXERCISE_MUSCLE_GROUPS.includes('ППБ') && library.EXERCISE_MUSCLE_GROUPS.includes('ЗПП'));
assert(library.EXERCISE_MUSCLE_GROUPS.includes('Икроножные') && library.EXERCISE_MUSCLE_GROUPS.includes('Приводящие'));
assert.equal(library.filterExerciseList(result.all,{muscleGroup:'ППБ'}).length,1);
assert.equal(library.filterExerciseList(result.all,{muscleGroup:'Приводящие'}).length,1);
assert.equal(library.filterExerciseList(result.all,{muscleGroup:'Ноги',query:'приводящие'}).length,1,'Legs filter stays compatible with secondary group search');
assert.deepEqual(library.exerciseMuscleTags({muscle_group:'Спина'}),['Спина'],'Historical and own exercises retain single group');

assert(!result.all.some(x=>x.id==='legacy'),'Retired exercise never appears in any picker');
assert.deepEqual(requests.map(row => row.join(':')).sort(),
  [...Array.from({length:6},(_,i)=>['exercise_catalog_v2',i*100,i*100+99]),['exercises',0,99]]
    .map(row=>row.join(':')).sort(), 'Both sources are fully paginated with 100-row pages');
const complete = await library.listExerciseLibrary({includeLegacy:true});
assert.deepEqual(complete.all.map(x=>x.id),result.all.map(x=>x.id),'Browse-only mode does not revive retired rows');
assert(!complete.all.some(x=>x.id==='legacy'));
assert.equal(library.filterExerciseList(result.all,{query:'  ЖИМ лежа  '}).length,1);
assert.equal(library.filterExerciseList(result.all,{query:'press bench'}).length,1);
assert.equal(library.filterExerciseList(result.all,{query:'жимы груди'}).length,1);
assert.equal(library.filterExerciseList(result.all,{query:'bench',equipment:'Гантели'}).length,0);
assert.equal(library.filterExerciseList(result.recent,{muscleGroup:'Ноги',equipment:'Гантели'}).length,0);
assert(!result.all.some(row=>row.id==='legacy'),'Recent history must not reintroduce duplicate catalogue cards');
// Regression: a capped API may return only 50 of the requested 100 records.
 // 113 populated leg rows must ALL appear in the user-visible base, without
 // silently treating the short response as the final page.
const sheetSnapshot = JSON.parse(readFileSync(new URL('../data/exercise-catalog/rebuilt-legs-from-sheet.json', import.meta.url),'utf8'));
assert.equal(sheetSnapshot.exercises.length,113);
oldRows.splice(0,oldRows.length,legacy,...sheetSnapshot.exercises.map(row=>({
  ...row,id:'leg-'+row.source_row,owner_id:null,muscle_group:'Ноги',
  source_sheet:'Упражнения (Ноги) список',status:'legacy',
})));
apiPageCap=50;
const loaded = await library.listExerciseLibrary();
const legRows=loaded.all.filter(row=>row.source_sheet==='Упражнения (Ноги) список');
assert.equal(legRows.length,113,'Every leg exercise is accessible even with API row limits');
assert.deepEqual(new Set(legRows.map(row=>row.source_row)),new Set(sheetSnapshot.exercises.map(row=>row.source_row)));
assert.equal(library.filterExerciseList(legRows).length,113,'Default Все filters show the full leg list');
assert.equal(library.filterExerciseList(legRows,{muscleGroup:'Все',equipment:'Все'}).length,113);
const movementGroups=library.exerciseMovementFilterOptions(legRows);
assert(movementGroups.length>=15,'Movement types distinguish the exercises, not only Силовое');
assert(movementGroups.includes('Приседания')&&movementGroups.includes('Выпады')&&movementGroups.includes('Тяга'));
assert(!movementGroups.includes('Другое'),'Every imported leg name has a recognized pattern');
assert.equal(legRows.filter(x=>library.exerciseMovementType(x)==='Приседания').length,
  library.filterExerciseList(legRows,{movementType:'Приседания'}).length);
assert(library.filterExerciseList(legRows,{movementType:'Приседания'}).length>10);
assert.equal(library.filterExerciseList(legRows,{movementType:'Прыжки'}).length,2);
assert.equal(library.filterExerciseList(legRows,{movementType:'Тяга',muscleGroup:'ЗПП'}).every(x=>library.exerciseMovementType(x)==='Тяга'),true);
assert.equal(library.exerciseMovementType({name:'Статическое удержание в приседе плие'}),'Статические удержания');
assert.equal(library.exerciseMovementType({name:'Выпрыгивания из приседа'}),'Прыжки');
assert.equal(library.exerciseMovementType({name:'Гакк-приседания в тренажёре'}),'Приседания');
assert.equal(library.exerciseMovementType({name:'Румынская тяга со штангой'}),'Тяга');
assert(requests.some(row=>row[0]==='exercises'&&row[1]===50),'Catalog continues past an API-limited first page');
assert(requests.some(row=>row[0]==='exercises'&&row[1]===100),'Catalog loads the remaining thirteen rows');
failRecent = true;
await assert.rejects(library.listExerciseLibrary(),/недавние/);
delete globalThis.__catalogTest;
console.log('Library v2: imported sheets, retired catalog hiding, user/recents and filters passed.');
