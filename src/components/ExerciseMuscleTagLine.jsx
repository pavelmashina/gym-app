import { exerciseMuscleTags } from '../lib/exerciseLibrary.js';

// Card list tags remain accessible when three long muscle labels are present.
export function ExerciseMuscleTagLine({ exercise }) {
  return <span className="exercise-library-row-tags" aria-label="Группы мышц и оборудование">
    {exerciseMuscleTags(exercise).map((tag, index) =>
      <span className={index === 0 ? 'is-primary' : 'is-secondary'} key={tag}>{tag}</span>)}
    {exercise.equipment && <span className="is-equipment">{exercise.equipment}</span>}
  </span>;
}
