import assert from 'node:assert/strict';
import { containRect } from '../src/lib/supplementPhotoEnhancement.js';

assert.deepEqual(containRect(128,128,394,230),{x:82,y:0,width:230,height:230});
assert.deepEqual(containRect(600,300,394,230),{x:0,y:16.5,width:394,height:197});
assert.equal(containRect(0,100,394,230),null);
console.log('Sportpit photo fit geometry passed.');
