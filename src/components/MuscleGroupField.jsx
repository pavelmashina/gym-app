import { useRef } from 'react';
import {
  CUSTOM_EXERCISE_MUSCLE_GROUPS,
  EXERCISE_MUSCLE_GROUP_OTHER,
  MAX_MUSCLE_GROUP_LENGTH,
  muscleGroupChoiceError,
} from '../lib/exerciseLibrary.js';

// Group select of the own-exercise form. «Другое» opens a text field for any other group.
// onChange receives the changed draft fields: { muscleGroup } or { customMuscleGroup }.
export function MuscleGroupField({ muscleGroup, customMuscleGroup = '', onChange }) {
  // Focus the text field only when the user picks «Другое», not when an exercise opens with it.
  const focusTyped = useRef(false);
  const other = muscleGroup === EXERCISE_MUSCLE_GROUP_OTHER;
  const typedError = other && customMuscleGroup.trim() ? muscleGroupChoiceError({ muscleGroup, customMuscleGroup }) : '';
  return <>
    <label><span>Группа мышц *</span><select required value={muscleGroup} onChange={(event) => {
      focusTyped.current = event.target.value === EXERCISE_MUSCLE_GROUP_OTHER;
      onChange({ muscleGroup: event.target.value });
    }}>
      {CUSTOM_EXERCISE_MUSCLE_GROUPS.map((value) => <option key={value}>{value}</option>)}
      <option>{EXERCISE_MUSCLE_GROUP_OTHER}</option>
    </select></label>
    {other && <label className="exercise-library-muscle-other">
      <span>Своя группа мышц *</span>
      <input required value={customMuscleGroup} maxLength={MAX_MUSCLE_GROUP_LENGTH}
        ref={(node) => { if (node && focusTyped.current) { focusTyped.current = false; node.focus(); } }}
        placeholder="Например, вращатели плеча" aria-invalid={Boolean(typedError)}
        onChange={(event) => onChange({ customMuscleGroup: event.target.value })} />
      {typedError && <small className="exercise-library-field-error" role="alert">{typedError}</small>}
    </label>}
  </>;
}
