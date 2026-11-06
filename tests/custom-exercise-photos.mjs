import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(path,'utf8');
const lib = read('src/lib/exerciseLibrary.js');
const form = read('src/components/CustomExerciseForm.jsx');
const card = read('src/components/ExerciseInfoModal.jsx');
const gallery = read('src/components/ExercisePhotoGallery.jsx');
const galleryCss = read('src/exercise-photo-gallery.css');
const pickerCss = read('src/exercise-library-picker.css');
const programStyles = read('src/training-program-polish.css');
const schema = read('supabase/schema/exercise-photo-storage.sql');
const migration = read('supabase/migrations/20261104102500_custom_exercise_photo_gallery.sql');

for (const name of ['EXERCISE_PHOTOS_BUCKET','MAX_EXERCISE_PHOTOS','exercisePhotoPaths','signedPhotoUrls','resolvedPhotoUrls','resolvedPhotos','uploadExercisePhoto']) {
  assert.ok(lib.includes(name),name);
}
assert.match(lib,/const MAX_PHOTO_SIZE = 8 \* 1024 \* 1024/);
assert.match(lib,/\.select\('id,photo_path,photo_paths'\)/);
assert.match(lib,/const photoFields = new Map/);
assert.match(lib,/photo_paths: uploadedPhotos/);
assert.match(lib,/photo_paths: nextPaths/);
assert.match(lib,/const keptPaths = previousPaths\.filter/);
assert.match(lib,/const obsoletePaths = previousPaths\.filter/);
assert.match(lib,/validatePhotoGallery\(selectedPhotos, keptPaths\.length\)/);
assert.match(lib,/\.eq\('owner_id',\s*user.id\)/);

assert.match(form,/type="file" multiple accept="image\/jpeg,image\/png,image\/webp"/);
assert.match(form,/URL\.createObjectURL\(file\)/);
assert.match(form,/URL\.revokeObjectURL\(preview\.url\)/);
assert.match(form,/photoFiles: \[\.\.\.current\.photoFiles, \.\.\.files\]/);
assert.match(form,/photoFiles: current\.photoFiles\.filter/);
assert.match(form,/removedPhotoPaths: \[\.\.\.current\.removedPhotoPaths, photo\.path\]/);
assert.match(card,/<ExercisePhotoGallery photos=\{photos\}/);
assert.match(form,/<ExercisePhotoGallery photos=\{previewGallery\}/);
assert.match(gallery,/aria-label="Предыдущее фото"/);
assert.match(gallery,/aria-label="Следующее фото"/);
assert.match(gallery,/onTouchStart=\{beginTouch\}/);
assert.match(gallery,/onTouchEnd=\{endTouch\}/);
assert.match(gallery,/setExpanded\(true\)/);
assert.match(gallery,/aria-modal="true"/);
assert.match(gallery,/event\.key === 'Escape'/);
assert.match(gallery,/event\.key === 'ArrowLeft'/);
assert.match(gallery,/event\.key === 'ArrowRight'/);
assert.match(galleryCss,/touch-action:pan-y/);
assert.match(galleryCss,/object-fit:contain/);
assert.match(pickerCss,/\.exercise-library-photo-thumbnails/);
assert.match(schema,/photo_paths text\[\] not null/);
assert.match(migration,/photo_paths = array\[photo_path\]/);
assert.match(migration,/cardinality\(photo_paths\) = 0/);
for (const p of ['select','insert','delete']) assert.match(schema,new RegExp('create policy "exercise_photos_'+p+'_own"'));

assert.match(programStyles,/\.program-detail-header \.program-detail-tabs button::after/);
assert.match(programStyles,/\.program-detail-header \.program-detail-tabs button\.active::after/);
assert.match(programStyles,/\.program-detail-phone \.program-detail-meta-card strong/);

// Execute the library's pure gallery normalization and input guards, not just source contracts.
const stub = `const supabase = {auth:{getUser:async()=>({data:{user:{id:'test-user'}},error:null})}};`;
const source = lib
  .replace("import { supabase } from './supabase.js';",stub)
  .replace("import { normalizeCatalogSearch } from './exerciseCatalogV2.js';","const normalizeCatalogSearch = x => x;")
  .replace("import { programDraftKey } from './programDraft.js';","const programDraftKey = id => id;")
  .replace("import.meta.env.VITE_EXERCISE_CATALOG_V2 === 'true'","true");
const library = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
assert.deepEqual(library.exercisePhotoPaths({photo_path:'old.jpg',photo_paths:[]}),['old.jpg']);
assert.deepEqual(library.exercisePhotoPaths({photo_path:'old.jpg',photo_paths:['a.jpg','b.jpg']}),['a.jpg','b.jpg']);
assert.deepEqual(library.exercisePhotoPaths({photo_path:null,photo_paths:[]}),[]);
assert.equal(library.MAX_EXERCISE_PHOTOS,10);
const newExercise = {name:'Моё упражнение',muscleGroup:'Грудь',equipment:'Гантели'};
const photo = {type:'image/png',size:256};
await assert.rejects(library.createCustomExercise({...newExercise,photoFiles:Array(11).fill(photo)}),/до 10 фото/);
await assert.rejects(library.createCustomExercise({...newExercise,photoFiles:[{type:'image/gif',size:100}]}),/JPEG, PNG или WebP/);
await assert.rejects(library.createCustomExercise({...newExercise,photoFiles:[{type:'image/jpeg',size:9*1024*1024}]}),/8 МБ/);
console.log('Custom exercise photo galleries: ordered migration, upload/edit contracts, swipes, lightbox and format/limit guards passed.');
