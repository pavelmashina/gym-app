/**
 * One-time asset mirroring for all currently-active recipe/meal-plan photos.
 * Source: existing Unsplash image URLs in the catalog tables (photo IDs below).
 * The app thereafter loads JPG files locally from GitHub Pages, not Unsplash.
 * Invoke via the dedicated GitHub Actions workflow; no Supabase credentials.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

const photoIds = [
  "1525351484163-7529414344d8",
  "1547592180-85f173990554",
  "1490645935967-10de6ba17061",
  "1510693206972-df098062cb71",
  "1488477181946-6428a0291777",
  "1467003909585-2f8a72700288",
  "1517673400267-0251440c45dc",
  "1604908176997-125f25cc6f3d",
  "1571212515416-fca77afa66ee",
  "1519708227418-c8fd9a32b7a2",
  "1517673132405-a56a62b18caf",
  "1551183053-bf91a1d81141",
  "1493770348161-369560ae357d",
  "1544025162-d76694265947",
  "1498837167922-ddd27525d352",
  "1543353071-10c8ba85a904"
];
const folder = new URL('../public/assets/nutrition/photos/', import.meta.url);
await mkdir(folder, { recursive: true });
const errors = [];

async function download(id) {
  const output = new URL(`photo-${id}.jpg`, folder);
  let existing;
  try { existing = await readFile(output); } catch { /* First mirror */ }
  if (existing?.length > 1000 && existing[0] === 255 && existing[1] === 216) {
    console.log('Already mirrored:', id, existing.length);
    return;
  }
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const url = `https://images.unsplash.com/photo-${id}?fm=jpg&fit=crop&w=1200&q=82`;
      const response = await fetch(url, {
        redirect:'follow',
        signal:AbortSignal.timeout(25000),
        headers:{'Accept':'image/jpeg,image/*;q=0.8'}
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length < 1200 || bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new Error('Expected JPEG data');
      await writeFile(output, bytes);
      console.log('Mirrored',id,bytes.length,'bytes');
      return;
    } catch (error) {
      console.warn('Photo',id,'attempt',attempt+1,String(error.message));
      if (attempt < 2) await new Promise(resolve=>setTimeout(resolve, 600 * (attempt+1)));
    }
  }
  errors.push(id);
}
for (let i = 0; i < photoIds.length; i+=4) await Promise.all(photoIds.slice(i,i+4).map(download));
if (errors.length) {
  console.error('The following images could not be mirrored:',errors.join(', '));
  process.exitCode=1;
} else console.log('Mirrored all',photoIds.length,'food images.');
