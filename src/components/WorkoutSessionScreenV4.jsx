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
  const [interruptConfirmOpen, setInterruptConfirmOpen] = useState(false);
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

  function captureWorkoutAction(event) {
    const element = event.target instanceof Element ? event.target : null;
    const interruptButton = element?.closest('.workout-abandon-button');
    if (!interruptButton) return;
    event.preventDefault();
    event.stopPropagation();
    setInterruptConfirmOpen(true);
  }

  function interruptWorkout() {
    setInterruptConfirmOpen(false);
    // Intentionally keep the WorkoutSession active. The session, entered sets,
    // notes and elapsed time remain available and Home shows “Продолжить тренировку”.
    props.onBack?.();
  }

  return <div onClickCapture={captureWorkoutAction}>
    <WorkoutSessionScreenV3 key={version} {...props} onRequestReplacement={openReplacement} />

    {interruptConfirmOpen && <div className="workout-modal-shell" role="dialog" aria-modal="true" aria-label="Прервать тренировку">
      <button className="workout-modal-scrim" type="button" aria-label="Закрыть" onClick={() => setInterruptConfirmOpen(false)} />
      <section className="workout-modal-card workout-interrupt-confirm">
        <div className="workout-modal-head"><div><span>Текущая тренировка</span><h3>Прервать тренировку?</h3></div><button type="button" onClick={() => setInterruptConfirmOpen(false)}>×</button></div>
        <p>Все введённые подходы, заметки и время сохранятся. Вы сможете продолжить эту тренировку позже.</p>
        <div className="workout-interrupt-confirm-actions">
          <button type="button" onClick={() => setInterruptConfirmOpen(false)}>Продолжить сейчас</button>
          <button className="primary" type="button" onClick={interruptWorkout}>Прервать и выйти</button>
        </div>
      </section>
    </div>}

    {replacementTarget && <div className="workout-modal-shell" role="dialog" aria-modal="true" aria-label="Заменить упражнение">
      <button className="workout-modal-scrim" type="button" aria-label="Закрыть" onClick={closeReplacement} />
      <section className="workout-modal-card replace-modal">
        <div className="workout-modal-head"><div><span>Текущая тренировка</span><h3>Заменить упражнение</h3></div><button type="button" onClick={closeReplacement} disabled={replacementLoading}>×</button></div>
        {replacementError && <div className="program-exercise-state error"><span>{replacementError}</span></div>}
        <ExerciseLibraryPicker excludeId={replacementTarget.linkedExerciseId || replacementTarget.exerciseId} onSelect={chooseReplacement} />
        {replacementLoading && <div className="program-exercise-state"><span>Заменяем упражнение…</span></div>}
      </section>
    </div>}
  </div>;
}
