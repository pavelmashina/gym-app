import assert from 'node:assert/strict';
import { programDraftKey, readProgramDraft, writeProgramDraft, clearProgramDraft } from '../src/lib/programDraft.js';
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
