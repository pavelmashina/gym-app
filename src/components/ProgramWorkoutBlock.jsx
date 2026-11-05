import { useState } from 'react';
import { formatRussianCount } from '../lib/formatRussianCount.js';
import { formatProgramExerciseSummary } from '../lib/programExerciseSummary.js';
import '../catalog-programs.css';

const EMPTY = 'Нет данных';

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>;
}

/** Shared, collapsed-by-default template workout for catalog and personal programs. */
export function ProgramWorkoutBlock({ workout, index }) {
  const [open, setOpen] = useState(false);
  const exercises = workout.exercises ?? [];
  return <article className={`catalog-workout-card${open ? ' open' : ''}`}>
    <button className="catalog-workout-head" type="button" onClick={() => setOpen(value => !value)} aria-expanded={open}>
      <span className="catalog-workout-index">{index + 1}</span>
      <span className="catalog-workout-title"><strong>{workout.name || `Тренировка ${index + 1}`}</strong><span className="catalog-workout-exercise-count">{formatRussianCount(exercises.length, ['упражнение','упражнения','упражнений'])}</span></span>
      <span className="catalog-workout-chevron"><ChevronIcon /></span>
    </button>
    {open && <div className="catalog-workout-exercises">
      {exercises.length === 0 ? <div className="catalog-no-data-row">{EMPTY}</div> : exercises.map((exercise, exerciseIndex) =>
        <div className="catalog-workout-exercise" key={exercise.id || `${exercise.name}-${exerciseIndex}`}>
          <span className="catalog-exercise-number">{exerciseIndex + 1}</span>
          <span className="catalog-exercise-copy"><strong>{exercise.name || EMPTY}</strong><span>{formatProgramExerciseSummary(exercise)}</span></span>
        </div>)}
    </div>}
  </article>;
}
