import { useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { replaceSessionExercise } from '../lib/workoutSessions.js';
import { ExerciseLibraryPicker } from './ExerciseLibraryPicker.jsx';
import { WorkoutSessionScreen as WorkoutSessionScreenV3 } from './WorkoutSessionScreenV3.jsx';
import '../exercise-library-picker.css';

async function loadReplacementTarget(scheduledWorkoutId, exerciseIndex) {
  const { data: sessions, error: sessionError } = await supabase
    .from('workout_sessions')
    .select('id')
    .eq('scheduled_workout_id', scheduledWorkoutId)
    .eq('status', 'active')
    .order('started_at', { ascending: false })
    .limit(1);
  if (sessionError || !sessions?.[0]) throw new Error('Не удалось определить активную тренировку.');

  const { data: exercises, error: exerciseError } = await supabase
    .from('workout_session_exercises')
    .select('id, exercise_id, position')
    .eq('workout_session_id', sessions[0].id)
    .order('position', { ascending: true });
  if (exerciseError) throw new Error('Не удалось открыть базу упражнений.');
  const target = exercises?.[exerciseIndex];
  if (!target) throw new Error('Не удалось определить упражнение для замены.');
  return target;
}

export function WorkoutSessionScreen(props) {
  const { scheduledWorkoutId } = props;
  const rootRef = useRef(null);
  const lastExerciseIndex = useRef(0);
  const [replacementTarget, setReplacementTarget] = useState(null);
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacementError, setReplacementError] = useState('');
  const [version, setVersion] = useState(0);

  function captureClick(event) {
    const element = event.target instanceof Element ? event.target : null;
    const more = element?.closest('.exercise-more-button');
    if (more) {
      const card = more.closest('[data-exercise-index]');
      const index = Number(card?.dataset?.exerciseIndex);
      if (Number.isInteger(index)) lastExerciseIndex.current = index;
      return;
    }

    const action = element?.closest('.exercise-action-row');
    if (!action || !action.textContent?.includes('Заменить упражнение')) return;
    event.preventDefault();
    event.stopPropagation();
    setReplacementLoading(true);
    setReplacementError('');

    const closeButton = rootRef.current?.querySelector('.exercise-actions-heading > button');
    window.setTimeout(() => closeButton?.click(), 0);

    loadReplacementTarget(scheduledWorkoutId, lastExerciseIndex.current)
      .then(setReplacementTarget)
      .catch((error) => setReplacementError(error?.message || 'Не удалось открыть базу упражнений.'))
      .finally(() => setReplacementLoading(false));
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
    setReplacementTarget(null);
    setReplacementError('');
  }

  return <div ref={rootRef} onClickCapture={captureClick}>
    <WorkoutSessionScreenV3 key={version} {...props} />
    {(replacementTarget || replacementLoading || replacementError) && <div className="workout-modal-shell" role="dialog" aria-modal="true" aria-label="Заменить упражнение">
      <button className="workout-modal-scrim" type="button" aria-label="Закрыть" onClick={closeReplacement} />
      <section className="workout-modal-card replace-modal">
        <div className="workout-modal-head"><div><span>Текущая тренировка</span><h3>Заменить упражнение</h3></div><button type="button" onClick={closeReplacement}>×</button></div>
        {replacementLoading && !replacementTarget && <div className="program-exercise-state"><span>Загружаем базу упражнений…</span></div>}
        {replacementError && <div className="program-exercise-state error"><span>{replacementError}</span></div>}
        {replacementTarget && <ExerciseLibraryPicker excludeId={replacementTarget.exercise_id} onSelect={chooseReplacement} />}
      </section>
    </div>}
  </div>;
}
