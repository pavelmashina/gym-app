import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const slugs = ['protein', 'gainer', 'creatine', 'bcaa', 'omega3', 'vitamins'];
const formats = { hero: 20000, square: 40000, thumbnail: 3000 };
const root = 'public/assets/sportpit';
for (const [format, minBytes] of Object.entries(formats)) {
  for (const slug of slugs) {
    const file = path.join(root, format, slug + '.webp');
    assert.ok(fs.existsSync(file), 'Missing generated photo: ' + file);
    const content = fs.readFileSync(file);
    assert.ok(content.length >= minBytes, 'Image suspiciously small: ' + file);
    assert.equal(content.toString('ascii', 0, 4), 'RIFF', 'Invalid WebP header: ' + file);
    assert.equal(content.toString('ascii', 8, 12), 'WEBP', 'Invalid WebP encoding: ' + file);
  }
}
const ui = fs.readFileSync('src/components/SportPitScreen.jsx', 'utf8');
assert.match(ui, /assets\/sportpit/);
assert.match(ui, /compact \? 'thumbnail' : 'hero'/);
console.log('All 18 generated supplement photos exist and are valid WebP files.');
