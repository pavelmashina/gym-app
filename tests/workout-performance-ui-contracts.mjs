import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(p,'utf8');
const home=read('src/components/HomeScreen.jsx');
const styles=read('src/styles.css');
const workout=read('src/components/WorkoutSessionScreenV3.jsx');
const lib=read('src/lib/workoutSessions.js');
const editor=read('src/components/ExerciseConfigurationEditor.jsx');
const picker=read('src/components/EquipmentInstancePicker.jsx');
const activeCss=read('src/workout-session-active-v3.css');
const completedCss=read('src/workout-session-completed-reference.css');
const standalone=read('src/components/StandaloneExerciseEditor.jsx');

assert.match(home,/workout_sessions/);
assert.match(home,/standalone_owner_id/);
assert.match(home,/toDateKey\(new Date\(row\.ended_at\)\)/);
assert.match(styles,/\.food-grid[\s\S]*grid-template-columns:\s*1fr/);
assert.match(styles,/\.food-stat span[\s\S]*white-space:\s*nowrap/);
assert.match(home,/CarouselArrowIcon/);
assert.match(styles,/\.carousel-arrow[\s\S]*background:\s*transparent/);

assert.match(workout,/function LegacySetRow/);
assert.match(workout,/setTimeout\(\(\)=>\{timerRef\.current=null;onPersist/);
assert.match(workout,/const tempId=.*crypto\.randomUUID\(\)/);
assert.match(workout,/sets:\[\.\.\.item\.sets,optimistic\]/);
assert.match(workout,/deletePerformedSet\(set\.id\)/);
assert.match(workout,/completed:next\.completed/);
assert.match(lib,/const performedSetWriteQueues = new Map\(\)/);
assert.match(lib,/previous\.catch\(\(\) => \{\}\)\.then/);
assert.match(lib,/void markRecentExerciseForSet/);
assert.match(workout,/setInterval\(\(\) => setNow\(Date\.now\(\)\), 1000\)/);

assert.match(editor,/opened/);
assert.match(editor,/changeTimerRef/);
assert.match(editor,/250/);
assert.match(picker,/enabled=true/);
assert.match(picker,/if\(!enabled\)return undefined/);
assert.match(activeCss,/execution-settings-triangle/);

assert.match(workout,/Удалить упражнение/);
assert.match(workout,/deleteSessionExercise/);
assert.doesNotMatch(standalone,/Убрать упражнение|standalone-remove-exercise/);

assert.match(workout,/M12 15V3/);
assert.match(completedCss,/Completion layout hardening/);
assert.match(completedCss,/@media \(max-width: 360px\)[\s\S]*completed-result-meta[\s\S]*grid-template-columns:\s*1fr/);
assert.doesNotMatch(completedCss,/overflow-x:\s*(hidden|clip)/);

console.log('Workout performance and UI contracts passed.');
