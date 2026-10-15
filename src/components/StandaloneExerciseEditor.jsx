import { useRef, useState } from 'react';
import { ExerciseLibraryPicker } from './ExerciseLibraryPicker.jsx';
import { addStandaloneExercise, loadWorkoutSession } from '../lib/workoutSessions.js';
import { assertResultsSaved } from '../lib/resultDraftGuard.js';
import { supabase } from '../lib/supabase.js';
import '../exercise-library-picker.css';
import '../standalone-workout.css';

export function StandaloneExerciseEditor({ sessionId, exercises, onEntryChange }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pending = useRef(false);
  const empty = !exercises.length;
  async function remove(exercise) {
    if (pending.current) return;
    if (!window.confirm('Удалить упражнение «' + exercise.name + '» и его подходы из этой разовой тренировки?')) return;
    pending.current = true; setBusy(true); setError('');
    try {
      assertResultsSaved();
      const { data, error } = await supabase.from('workout_session_exercises').delete()
        .eq('id', exercise.id).eq('workout_session_id', sessionId).select('id').single();
      if (error || !data) throw new Error('Не удалось удалить упражнение.');
      onEntryChange(await loadWorkoutSession(sessionId));
    } catch (e) { setError(e.message); }
    finally { pending.current = false; setBusy(false); }
  }
  async function add(exercise) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError('');
    try {
      assertResultsSaved();
      await addStandaloneExercise(sessionId, exercise.id);
      setOpen(false);
      onEntryChange(await loadWorkoutSession(sessionId));
    } catch (e) { setError(e.message); }
    finally { pending.current = false; setBusy(false); }
  }
  return <section className="standalone-exercise-editor">
    {empty && <p>Пока нет упражнений. Добавьте первое, затем укажите подходы и результаты. Ничего из программы не копируется.</p>}
    <button className="standalone-add-exercise" type="button" disabled={busy} onClick={() => { setError(''); setOpen(true); }}>+ Добавить упражнение</button>
    {!empty && <details><summary>Убрать упражнение</summary>{exercises.map(exercise => <button className="standalone-remove-exercise" key={exercise.id} type="button" disabled={busy} onClick={() => remove(exercise)}>Удалить: {exercise.name}</button>)}</details>}
    {error && <p role="alert">{error}</p>}
    {open && <div className="workout-modal-shell" role="dialog" aria-modal="true" aria-label="Добавить упражнение">
      <button className="workout-modal-scrim" type="button" aria-label="Закрыть" disabled={busy} onClick={() => setOpen(false)} />
      <section className="workout-modal-card replace-modal">
        <div className="workout-modal-head"><h3>Добавить упражнение</h3><button type="button" aria-label="Закрыть" disabled={busy} onClick={() => setOpen(false)}>×</button></div>
        {error && <p role="alert">{error}</p>}
        {busy ? <p>Добавляем…</p> : <ExerciseLibraryPicker onSelect={add} />}
      </section>
    </div>}
  </section>;
}
