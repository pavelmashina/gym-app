import { useRef, useState } from 'react';
import { ExerciseLibraryPicker } from './ExerciseLibraryPicker.jsx';
import { addSessionExercise, loadWorkoutSession } from '../lib/workoutSessions.js';
import { assertResultsSaved, flushPendingSetEdits } from '../lib/resultDraftGuard.js';
import { appBox, appHeight } from '../lib/portraitLock.js';
import '../exercise-library-picker.css';
import '../workout-exercise-adder.css';

function PlusIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function scrollParent(node) {
  for (let el = node.parentElement; el; el = el.parentElement) {
    const { overflowY } = getComputedStyle(el);
    if ((overflowY === 'auto' || overflowY === 'scroll') && el.scrollHeight > el.clientHeight) return el;
  }
  return document.scrollingElement;
}

// The new card takes the button's place, partly under the fixed footer. Show all of it between
// the top bar and the footer, or at least its head when it is taller than that space.
function revealAddedCard(id, framesLeft = 10) {
  const card = document.querySelector(`[data-session-exercise-id="${id}"]`);
  // React may render the reloaded workout a frame or two later.
  if (!card) { if (framesLeft > 0) requestAnimationFrame(() => revealAddedCard(id, framesLeft - 1)); return; }
  // Measured as the user sees the app: the page is turned while the phone is on its side (#102).
  const header = document.querySelector('.workout-session-header');
  const footer = document.querySelector('.workout-session-footer');
  const top = (header ? appBox(header).bottom : 0) + 12;
  const bottom = (footer ? appBox(footer).top : appHeight()) - 12;
  const rect = appBox(card);
  const shift = rect.bottom > bottom ? Math.min(rect.bottom - bottom, rect.top - top) : Math.min(0, rect.top - top);
  if (shift) scrollParent(card).scrollBy({ top: shift, behavior: 'smooth' });
}

// Issue #61: any active workout, from a program or standalone, takes one more exercise at its end,
// with one empty set. In a program workout the user chooses: only this workout, or the program too.
export function WorkoutExerciseAdder({ sessionId, empty, standalone, canAddToProgram, onEntryChange }) {
  const [open, setOpen] = useState(false);
  // The picked exercise while the user chooses where it goes.
  const [choice, setChoice] = useState(null);
  // '' when idle, otherwise the scope being saved: 'session' or 'program'.
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const pending = useRef(false);

  function openPicker() { setError(''); setOpen(true); }
  // A failed add belongs to the picker: closing it also dismisses the error.
  function closePicker() { if (!pending.current) { setOpen(false); setChoice(null); setError(''); } }
  function closeChoice() { if (!pending.current) setChoice(null); }
  function pick(exercise) {
    if (pending.current) return;
    if (canAddToProgram) { setError(''); setChoice(exercise); } else add(exercise, 'session');
  }

  async function add(exercise, scope) {
    if (pending.current) return;
    pending.current = true; setBusy(scope); setError('');
    let addedId;
    try {
      assertResultsSaved();
      // The screen reloads after adding, so what was just typed must reach the server first.
      await flushPendingSetEdits();
      addedId = await addSessionExercise(sessionId, exercise.id, scope);
    } catch (e) {
      // Back to the picker, where the error shows and another try is one tap away.
      setChoice(null);
      setError(e.message);
      pending.current = false; setBusy('');
      return;
    }
    // Added on the server: a failed reload must not invite a second, duplicate add from the picker.
    setChoice(null);
    setOpen(false);
    try {
      onEntryChange(await loadWorkoutSession(sessionId));
      requestAnimationFrame(() => revealAddedCard(addedId));
    } catch (e) {
      setError(`Упражнение добавлено, но экран не обновился. ${e.message}`);
    } finally {
      pending.current = false; setBusy('');
    }
  }

  return <section className="workout-exercise-adder">
    {empty && <p className="workout-exercise-adder-empty">Пока нет упражнений. Добавьте первое, затем укажите подходы и результаты.{standalone ? ' Ничего из программы не копируется.' : ''}</p>}
    <button className="workout-add-exercise" type="button" disabled={Boolean(busy)} onClick={openPicker}><PlusIcon />Добавить упражнение</button>
    {error && !open && <p className="workout-exercise-adder-error" role="alert">{error}</p>}
    {open && <div className="workout-modal-shell" role="dialog" aria-modal="true" aria-label="Добавить упражнение">
      <button className="workout-modal-scrim" type="button" aria-label="Закрыть" disabled={Boolean(busy)} onClick={closePicker} />
      <section className="workout-modal-card replace-modal">
        <div className="workout-modal-head"><div><span>Текущая тренировка</span><h3>Добавить упражнение</h3></div><button type="button" aria-label="Закрыть" disabled={Boolean(busy)} onClick={closePicker}>×</button></div>
        {error && <p className="workout-exercise-adder-error" role="alert">{error}</p>}
        {busy && !choice ? <p className="workout-exercise-adder-busy">Добавляем упражнение…</p> : <ExerciseLibraryPicker onSelect={pick} />}
      </section>
    </div>}
    {choice && <div className="reorder-scope-shell workout-add-scope" role="dialog" aria-modal="true" aria-label="Куда добавить упражнение">
      <button className="exercise-actions-scrim" type="button" aria-label="Отмена" disabled={Boolean(busy)} onClick={closeChoice} />
      <section className="reorder-scope-card">
        <span>Куда добавить упражнение?</span>
        <h3>{choice.name}</h3>
        <p>Во всю программу — упражнение появится и в следующих таких же тренировках. Завершённые тренировки не изменятся.</p>
        <button className="primary" type="button" disabled={Boolean(busy)} onClick={() => add(choice, 'session')}>{busy === 'session' ? 'Добавляем…' : 'Только в эту тренировку'}</button>
        <button type="button" disabled={Boolean(busy)} onClick={() => add(choice, 'program')}>{busy === 'program' ? 'Добавляем…' : 'Во всю программу'}</button>
        <button className="cancel" type="button" disabled={Boolean(busy)} onClick={closeChoice}>Отмена</button>
      </section>
    </div>}
  </section>;
}
