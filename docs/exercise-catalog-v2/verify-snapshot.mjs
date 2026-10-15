import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
const read = (name) => JSON.parse(readFileSync(new URL(name, import.meta.url), 'utf8'));
const catalog = read('legacy-shared-catalog.json');
const queue = read('legacy-review-queue.json');
const names = read('program-source-names.json');
const requirements = read('required-catalog-manifest.json');
assert.equal(requirements.filter(x => x.section === 'basic').length, 79);
assert.equal(requirements.filter(x => x.section === 'machine').length, 30);
assert.equal(new Set(requirements.map(x => x.required_name)).size, 109);
const normalize = (s) => s.trim().toLowerCase();
assert.equal(catalog.length, 436);
assert.equal(new Set(catalog.map(x => x.id)).size, 436);
assert.equal(queue.length, catalog.length);
const source = new Map(catalog.map(x => [x.id, x]));
for (const row of queue) {
  assert.equal(row.legacy_name, source.get(row.legacy_exercise_id)?.name);
  assert(['needs_review','confirmed'].includes(row.review_status));
  if (row.review_status === 'confirmed') {
    assert.equal(row.canonical_exercise_id, row.legacy_exercise_id);
    assert.equal(row.match_type, 'equivalent');
    assert(row.review_notes.trim());
  } else assert.equal(row.canonical_exercise_id, null);
}
assert.equal(new Set(queue.map(x => x.legacy_exercise_id)).size, catalog.length);
assert.equal(queue.filter(x => x.review_status === 'confirmed').length, 21);
assert.equal(names.length, 376);
assert.equal(names.reduce((sum, x) => sum + x.occurrences, 0), 849);
const catalogNames = new Set(catalog.map(x => normalize(x.name)));
assert.equal(names.filter(x => !catalogNames.has(normalize(x.name))).length, 333);
console.log('Snapshot integrity OK: 436 exercises, 376 program names, 333 literal mismatches. Semantic mapping NOT validated.');
