import { useState } from 'react';
import { getWorkoutEntry, markScheduledWorkoutCompleted } from '../lib/workoutSessions.js';
import { localDateKey } from '../lib/workoutLifecycle.js';
import '../workout-start-choice.css';

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`));
}

// The footer of a workout that has not started: «К тренировке» asks whether to run it in the
// app or only record it as done, without the timer and without ticking every set (#66).
export function WorkoutStartChoice({ workout, starting, onStart, onMarkedCompleted }) {
  const [step, setStep] = useState(null);
  const [completionDate, setCompletionDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const today = localDateKey();
  const busy = starting || saving;

  function open() {
    setError('');
    setCompletionDate(workout.scheduledDate && workout.scheduledDate <= today ? workout.scheduledDate : today);
    setStep('choice');
  }

  function close() {
    if (busy) return;
    setStep(null);
    setError('');
  }

  function goTo(nextStep) {
    setError('');
    setStep(nextStep);
  }

  // A refused start is shown on the screen under the plan, so the sheet steps aside.
  async function start() {
    if (busy) return;
    await onStart();
    setStep(null);
  }

  async function markCompleted() {
    if (busy || !completionDate || completionDate > today) return;
    setSaving(true);
    setError('');
    try {
      onMarkedCompleted(await markScheduledWorkoutCompleted(workout.id, completionDate));
    } catch (requestError) {
      // The server may have saved the workout even though its answer was lost.
      const latest = requestError?.code ? null : await getWorkoutEntry(workout.id).catch(() => null);
      if (latest?.mode === 'completed') onMarkedCompleted(latest);
      else setError(requestError?.message || 'Не удалось отметить тренировку выполненной.');
    } finally {
      setSaving(false);
    }
  }

  const completing = step === 'complete';
  return <>
    <footer className="workout-session-footer"><button type="button" onClick={open} disabled={busy}>{starting ? 'Начинаем…' : 'К тренировке'}</button></footer>
    {step && <div className="workout-modal-shell workout-start-choice" role="dialog" aria-modal="true" aria-label={completing ? 'Отметить тренировку выполненной' : 'Как провести тренировку'}>
      <button className="workout-modal-scrim" type="button" aria-label="Закрыть" onClick={close} />
      <section className="workout-modal-card">
        <div className="workout-modal-head">
          <div><span>{completing ? workout.name : formatDate(workout.scheduledDate)}</span><h3>{completing ? 'Отметить выполненной?' : workout.name}</h3></div>
          <button type="button" aria-label="Закрыть" onClick={close} disabled={busy}>×</button>
        </div>
        {completing ? <div className="workout-start-complete">
          <p>Веса и повторы будут взяты из предыдущей тренировки, если они есть. После сохранения результаты можно отредактировать.</p>
          <label className="workout-start-date"><span>Дата выполнения</span><input type="date" value={completionDate} max={today} disabled={saving} onChange={(event) => setCompletionDate(event.target.value)} /></label>
          {error && <div className="workout-lifecycle-error" role="alert">{error}</div>}
          <button className="primary" type="button" disabled={saving || !completionDate || completionDate > today} onClick={markCompleted}>{saving ? 'Сохраняем…' : 'Отметить выполненной'}</button>
          <button type="button" disabled={saving} onClick={() => goTo('choice')}>Назад</button>
        </div> : <div className="workout-start-options">
          <button className="primary" type="button" disabled={busy} onClick={start}><strong>{starting ? 'Начинаем…' : 'Начать'}</strong><span>С таймером и отметкой каждого подхода.</span></button>
          <button type="button" disabled={busy} onClick={() => goTo('complete')}><strong>Отметить выполненной</strong><span>Без таймера и без отметки подходов.</span></button>
        </div>}
      </section>
    </div>}
  </>;
}
