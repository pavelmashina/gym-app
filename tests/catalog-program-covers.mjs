import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { catalogCoverUrls, preferProgramCover } from '../src/lib/catalogCoverUrls.js';

const source = { cover_image: 'program-fullbody-example.webp', cover_image_detail: 'program-fullbody-example-hq.webp' };
assert.deepEqual(catalogCoverUrls(source, '/gym-app/'), {
  coverUrl: '/gym-app/assets/program-fullbody-example.webp',
  coverDetailUrl: '/gym-app/assets/program-fullbody-example-hq.webp',
});
assert.deepEqual(catalogCoverUrls({ cover_image: 'program-fullbody-example.webp' }, '/gym-app/'), {
  coverUrl: '/gym-app/assets/program-fullbody-example.webp',
  coverDetailUrl: '/gym-app/assets/program-fullbody-example.webp',
});
assert.deepEqual(catalogCoverUrls(null, '/gym-app/'), { coverUrl: null, coverDetailUrl: null });
for (const invalid of ['../../private.webp', 'http://example.com/picture.jpg', '/external.png', 'image.svg', '', null]) {
  assert.equal(catalogCoverUrls({ cover_image: invalid }, '/gym-app/').coverUrl, null);
}
assert.equal(preferProgramCover('signed-own-cover', 'catalog-cover'), 'signed-own-cover');
assert.equal(preferProgramCover(null, 'catalog-cover'), 'catalog-cover');
assert.equal(preferProgramCover(null, null), null);

// Regression: adopted copies have an empty cover_path. The original cover
// must remain visible in My Programs, full details and Completed.
const programs = readFileSync('src/lib/programs.js', 'utf8');
const catalog = readFileSync('src/lib/catalogPrograms.js', 'utf8');
const card = readFileSync('src/components/ProgramListCard.jsx', 'utf8');
assert.match(programs, /async function loadCatalogCoverUrls\(programRows\)/);
assert.match(programs, /source_catalog_program_id/);
assert.match(programs, /supabase.from\('catalog_programs'\)[\s\S]*?select\('id, source_payload'\)/);
assert.match(programs, /return preferProgramCover\(signedUrl, catalogCovers.get\(row.source_catalog_program_id\)\)/);
assert.match(programs, /async function listRecentCompletedPrograms\(\)[\s\S]*?loadCatalogCoverUrls\(rows \?\? \[\]\)[\s\S]*?coverUrl:await resolveProgramCover\(row, catalogCovers\)/);
assert.match(programs, /async function listPrograms\(\)[\s\S]*?loadCatalogCoverUrls\(rows\)[\s\S]*?coverUrl: await resolveProgramCover\(row, catalogCovers\)/);
assert.match(programs, /async function getProgram\(programId\)[\s\S]*?loadCatalogCoverUrls\(\[programRow\]\)[\s\S]*?coverUrl: await resolveProgramCover\(programRow, catalogCovers\)/);
assert.match(catalog, /catalogCoverUrls\(sourcePayload, import.meta.env.BASE_URL\)/);
assert.match(card, /program.coverUrl \? <img src=\{program.coverUrl\}/);
console.log('Adopted catalog artwork fallback and owner-cover precedence verified.');
