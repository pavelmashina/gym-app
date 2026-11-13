import { exerciseMuscleTags } from '../lib/exerciseLibrary.js';

// Plain text tags as before (no extra chip borders); scroll horizontally
// when two or three groups cannot fit next to the equipment tag.
export function ExerciseMuscleTagLine({ exercise }) {
  return <small className="exercise-library-row-tags" aria-label="Группы мышц и оборудование">
    {exerciseMuscleTags(exercise).map((name, index) =>
      <span className={index === 0 ? 'is-primary' : 'is-secondary'} key={name}>{name}</span>)}
    {exercise.equipment && <span className="is-equipment">{exercise.equipment}</span>}
  </small>;
}
