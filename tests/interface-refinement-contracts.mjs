import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(path)=>fs.readFileSync(path,'utf8');

const picker=read('src/components/ExerciseLibraryPicker.jsx');
const library=read('src/lib/exerciseLibrary.js');
const workoutSessions=read('src/lib/workoutSessions.js');
const createProgram=read('src/components/CreateProgramScreen.jsx');
const standaloneCss=read('src/standalone-workout.css');
const design=read('src/design-system.css');
const html=read('index.html');

// Recent exercises are display-only in selectors and come from actual performed workout sets.
assert.doesNotMatch(picker,/markExerciseRecent/);
assert.match(picker,/recent:\s*filter\(library\.recent\)\.slice\(0, 5\)/);
assert.match(library,/user_recent_exercises[\s\S]*?\.limit\(5\)/);
assert.match(workoutSessions,/markRecentExerciseForSet/);
assert.match(workoutSessions,/if \(payload\.completed\) void markRecentExerciseForSet\(setId\)/);
assert.match(workoutSessions,/if \(result\.completed\) void markRecentExerciseForSet\(setId\)/);

// Draft autosave remains active, but success/restored notices are silent.
assert.match(createProgram,/writeProgramDraft/);
assert.match(createProgram,/draftKey && draftError/);
assert.doesNotMatch(createProgram,/Черновик автоматически сохраняется/);
assert.doesNotMatch(createProgram,/Изменения сохраняются на этом устройстве/);

// Standalone workout action uses the shared monochrome design system and compact touch target.
assert.match(standaloneCss,/background:\s*var\(--ink\)/);
assert.match(standaloneCss,/min-height:\s*40px/);
assert.doesNotMatch(standaloneCss,/#1769e0|#1557ac/);

// Mobile viewport is fixed without a global touchmove blocker; iOS form controls stay >=16px.
assert.match(html,/maximum-scale=1/);
assert.match(html,/user-scalable=no/);
assert.match(design,/iOS focus zoom guard/);
assert.match(design,/font-size:\s*16px\s*!important/);
assert.doesNotMatch(design,/touchmove/);

console.log('Interface refinement contracts passed.');
