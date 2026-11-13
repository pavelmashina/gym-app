import { exerciseMuscleTags } from '../lib/exerciseLibrary.js';
import { exerciseEquipmentTags } from '../lib/exerciseVariationSelection.js';

// Compact, borderless list metadata: main and secondary muscle groups followed
// by the base apparatus and the additional apparatus in the default variant.
export function ExerciseMuscleTagLine({ exercise }) {
  return <small className="exercise-library-row-tags" aria-label="Группы мышц и оборудование">
    {exerciseMuscleTags(exercise).map((name, index) =>
      <span className={index === 0 ? 'is-primary' : 'is-secondary'} key={name}>{name}</span>)}
    {exerciseEquipmentTags(exercise).map((equipment, index) =>
      <span className={index ? 'is-equipment-extra' : 'is-equipment'} key={equipment}>{equipment}</span>)}
  </small>;
}
