import { useState } from 'react';
import { replaceSessionExercise } from '../lib/workoutSessions.js';
import { ExerciseLibraryPicker } from './ExerciseLibraryPicker.jsx';
import { WorkoutSessionScreen as WorkoutSessionScreenV3 } from './WorkoutSessionScreenV3.jsx';
import '../exercise-library-picker.css';
import '../workout-exercise-info-media.css';

export function WorkoutSessionScreen(props) {
  const [replacementTarget, setReplacementTarget] = useState(null);
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacementError, setReplacementError] = useState('');
  const [version, setVersion] = useState(0);

  function openReplacement(exercise) {
    setReplacementError('');
    setReplacementTarget(exercise);
  }

  async function chooseReplacement(exercise) {
    if (!replacementTarget) return;
    setReplacementLoading(true);
    setReplacementError('');
    try {
      await replaceSessionExercise(replacementTarget.id, exercise.id);
      setReplacementTarget(null);
      setVersion((value) => value + 1);
    } catch (error) {
      setReplacementError(error?.message || 'Не удалось заменить упражнение.');
    } finally {
      setReplacementLoading(false);
    }
  }

  function closeReplacement() {
    if (replacementLoading) return;
    setReplacementTarget(null);
    setReplacementError('');
  }

  return <>
    <WorkoutSessionScreenV3 key={version} {...props} onRequestReplacement={openReplacement} />
    {replacementTarget && <div className="workout-modal-shell" role="dialog" aria-modal="true" aria-label="Заменить упражнение">
      <button className="workout-modal-scrim" type="button" aria-label="Закрыть" onClick={closeReplacement} />
      <section className="workout-modal-card replace-modal">
        <div className="workout-modal-head"><div><span>Текущая тренировка</span><h3>Заменить упражнение</h3></div><button type="button" onClick={closeReplacement} disabled={replacementLoading}>×</button></div>
        {replacementError && <div className="program-exercise-state error"><span>{replacementError}</span></div>}
        <ExerciseLibraryPicker excludeId={replacementTarget.linkedExerciseId || replacementTarget.exerciseId} onSelect={chooseReplacement} />
        {replacementLoading && <div className="program-exercise-state"><span>Заменяем упражнение…</span></div>}
      </section>
    </div>}
  </>;
}
