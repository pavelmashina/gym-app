import assert from 'node:assert/strict';
import { programDraftKey, readProgramDraft, writeProgramDraft, clearProgramDraft, hasProgramDraftProgress } from '../src/lib/programDraft.js';
import { readProgramDraftCover, writeProgramDraftCover, clearProgramDraftCover } from '../src/lib/programDraftCover.js';
import { matchesProgramFilters, programFilterOptions, EMPTY_PROGRAM_FILTERS } from '../src/lib/programFilters.js';

const values = new Map();
const storage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
const key = programDraftKey('athlete-a');
const draft = { step: 2, name: 'Сила', description: '', categories: ['Силовой тренинг'], place: 'Дом',
  equipment: 'Гантели', level: 'Начальный', scheduleMode: 'weekly_mwf', cycleRepeatCount: 4,
  editingWorkoutId: 'workout', startDate: '2026-10-21',
  programWeeks: [{ id: 'cycle', workouts: [{ id: 'workout', name: 'День 1', restDaysAfter: 2,
    exercises: [{ id: 'exercise', name: 'Жим', sets: [{ id: 'set', reps: '12' }] }] }] }] };
writeProgramDraft(storage, key, draft);
assert.deepEqual(readProgramDraft(storage, key), { ...draft, version: 1 });
assert.equal(hasProgramDraftProgress(readProgramDraft(storage, key)), true);
assert.equal(hasProgramDraftProgress(null), false);
assert.equal(hasProgramDraftProgress({ step: 1, name: '', description: '', categories: [], place: '', equipment: '', level: '', cycleRepeatCount: 1, programWeeks: [{ workouts: [] }] }), false);
assert.equal(hasProgramDraftProgress({ step: 1, name: 'Начал заполнять', programWeeks: [{ workouts: [] }] }), true);
assert.equal(hasProgramDraftProgress({ step: 2, name: '', programWeeks: [{ workouts: [] }] }), true);
assert.equal(readProgramDraft(storage, programDraftKey('athlete-b')), null, 'Accounts must not share drafts');
assert.equal(programDraftKey(null), null);
clearProgramDraft(storage, key);
assert.equal(readProgramDraft(storage, key), null);
storage.setItem(key, '{broken');
assert.throws(() => readProgramDraft(storage, key));
storage.setItem(key, JSON.stringify({ ...draft, version: 99 }));
assert.throws(() => readProgramDraft(storage, key));
storage.setItem(key, JSON.stringify({ ...draft, version: 1, programWeeks: [{}] }));
assert.throws(() => readProgramDraft(storage, key));
assert.throws(() => writeProgramDraft({ setItem() { throw new Error('quota'); } }, key, draft));

// Minimal asynchronous IndexedDB harness verifies the actual binary draft
// path, not just the "hasCover" flag stored alongside the text.
const covers = new Map();
globalThis.indexedDB = {
  open() {
    const request = {};
    queueMicrotask(() => {
      const db = {
        objectStoreNames: { contains: () => false },
        createObjectStore: () => {},
        close: () => {},
        transaction() {
          const transaction = {
            objectStore() {
              return Object.fromEntries(['get','put','delete'].map(method => [method, (value,key) => {
                const item = {};
                queueMicrotask(() => {
                  if (method === 'get') item.result = covers.get(value);
                  if (method === 'put') covers.set(key,value);
                  if (method === 'delete') covers.delete(value);
                  item.onsuccess?.();
                  queueMicrotask(() => transaction.oncomplete?.());
                });
                return item;
              }]));
            },
          };
          return transaction;
        },
      };
      request.result = db;
      request.onupgradeneeded?.();
      request.onsuccess?.();
    });
    return request;
  },
};
const demoFile = new File([new Uint8Array([1,2,3,4])], 'training-photo.webp', { type: 'image/webp' });
await writeProgramDraftCover(key,demoFile);
const restoredCover = await readProgramDraftCover(key);
assert.equal(restoredCover.name,'training-photo.webp');
assert.equal(restoredCover.type,'image/webp');
assert.deepEqual([...new Uint8Array(await restoredCover.arrayBuffer())],[1,2,3,4]);
assert.equal(await readProgramDraftCover(programDraftKey('athlete-b')),null,'Image drafts are per account');
await clearProgramDraftCover(key);
assert.equal(await readProgramDraftCover(key),null,'Deleted drafts must not retain old photos');
// Rapid writes followed by deletion must never resurrect stale image data.
const one = writeProgramDraftCover(key,demoFile);
const two = clearProgramDraftCover(key);
await Promise.all([one,two]);
assert.equal(await readProgramDraftCover(key),null);

const programs = [
  { name: 'А', trainingPlace: 'Дом', categories: ['Сила'], level: 'Начальный' },
  { name: 'Б', trainingPlace: 'Зал', categories: ['Сила', 'Кардио'], level: 'Средний' },
  { name: 'В', trainingPlace: 'Дом', categories: ['Кардио'], level: 'Начальный' },
];
assert.equal(programs.filter((p) => matchesProgramFilters(p, EMPTY_PROGRAM_FILTERS)).length, 3);
assert.deepEqual(programs.filter((p) => matchesProgramFilters(p, { place: 'Дом', category: 'Сила', level: 'Начальный' })).map((p) => p.name), ['А']);
assert.equal(programs.filter((p) => matchesProgramFilters(p, { place: 'Зал', category: 'Сила', level: 'Начальный' })).length, 0);
assert.deepEqual(programFilterOptions(programs).category, ['Кардио', 'Сила']);
assert.equal(matchesProgramFilters({}, { category: 'Сила' }), false);
console.log('Program draft persistence and filters: passed');
