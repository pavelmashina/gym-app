import { useEffect, useState } from 'react';
import { findActiveWorkoutId, getWorkoutEntry, startWorkout } from '../lib/workoutSessions.js';
import { localDateKey, plannedWorkoutIsInFuture } from '../lib/workoutLifecycle.js';
import { WorkoutSessionScreen as WorkoutSessionScreenV4 } from './WorkoutSessionScreenV4.jsx';
import { WorkoutStartChoice } from './WorkoutStartChoice.jsx';
import '../workout-session-report-fixes.css';
import { formatRussianCount } from '../lib/formatRussianCount.js';

function BackIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>;
}


function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`));
}

function plannedSetLabel(set) {
  return set.plannedReps ? `${set.plannedReps} повт.` : 'Повторы не заданы';
}

function PlannedWorkout({ workout, onBack, onStart, onMarkedCompleted, onOpenActive, starting, error }) {
  return <div className="phone workout-session-phone">
    <header className="workout-session-header"><button type="button" aria-label="Назад" onClick={onBack}><BackIcon /></button><strong>Тренировка</strong><span /></header>
    <main className="workout-session-content">
      <section className="workout-session-hero"><span>{formatDate(workout.scheduledDate)}</span><h1>{workout.name}</h1><p>{formatRussianCount(workout.exercises.length, ['упражнение', 'упражнения', 'упражнений'])} · тренировка ещё не начата</p></section>
      <section className="workout-plan-list">{workout.exercises.map((exercise, index) => <article className="workout-plan-card" key={exercise.id}><div className="workout-plan-number">{index + 1}</div><div className="workout-plan-main"><span>{exercise.muscleGroup || 'Упражнение'}</span><h2>{exercise.name}</h2>{exercise.prescription && <div className="workout-plan-prescription"><span>План</span><strong>{exercise.prescription}</strong></div>}<div className="workout-plan-sets">{exercise.sets.map((set) => <span key={set.id}>Подход {set.setNumber} · {plannedSetLabel(set)}</span>)}</div></div></article>)}</section>
      {error && <div className="workout-session-error" role="alert">{error}{onOpenActive && <div className="workout-session-recovery"><button type="button" onClick={onOpenActive}>Перейти к текущей тренировке</button></div>}</div>}
    </main>
    <WorkoutStartChoice workout={workout} starting={starting} onStart={onStart} onMarkedCompleted={onMarkedCompleted} />
  </div>;
}

export function WorkoutSessionScreen(props) {
  const [entry, setEntry] = useState(null);
  const [loadedEntry, setLoadedEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [delegate, setDelegate] = useState(false);
  const [activeWorkoutId, setActiveWorkoutId] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setDelegate(false);
    setEntry(null);
    setLoadedEntry(null);
    setActiveWorkoutId(null);
    getWorkoutEntry(props.scheduledWorkoutId)
      .then((result) => {
        if (!active) return;
        if (result?.mode !== 'planned') { setLoadedEntry(result); setDelegate(true); }
        else if (plannedWorkoutIsInFuture(result.workout, localDateKey())) setDelegate(true);
        else setEntry(result);
      })
      .catch((requestError) => { if (active) setError(requestError?.message || 'Не удалось открыть тренировку.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [props.scheduledWorkoutId, reloadKey]);

  async function handleStart() {
    if (starting) return;
    setStarting(true);
    setError('');
    setActiveWorkoutId(null);
    try {
      setLoadedEntry(await startWorkout(props.scheduledWorkoutId));
      setDelegate(true);
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось начать тренировку.');
      if (requestError?.code === 'another-active') {
        // Otherwise the only way forward would be finding that other workout unaided.
        findActiveWorkoutId().then((id) => { if (id && id !== props.scheduledWorkoutId) setActiveWorkoutId(id); }).catch(() => {});
      } else {
        // The server may have started the session even though its response was lost.
        getWorkoutEntry(props.scheduledWorkoutId).then((latest) => {
          if (latest?.mode && latest.mode !== 'planned') { setLoadedEntry(latest); setDelegate(true); }
        }).catch(() => {});
      }
    } finally {
      setStarting(false);
    }
  }

  if (delegate) return <WorkoutSessionScreenV4 {...props} initialEntry={loadedEntry} />;
  if (loading) return <div className="phone workout-session-phone"><header className="workout-session-header"><button type="button" aria-label="Назад" onClick={props.onBack}><BackIcon /></button><strong>Тренировка</strong><span /></header><div className="workout-session-loading">Загружаем тренировку…</div></div>;
  if (!entry) return <div className="phone workout-session-phone"><header className="workout-session-header"><button type="button" aria-label="Назад" onClick={props.onBack}><BackIcon /></button><strong>Тренировка</strong><span /></header><div className="workout-session-error standalone" role="alert">{error || 'Тренировка не найдена.'}<div className="workout-session-recovery"><button type="button" onClick={() => setReloadKey((value) => value + 1)}>Повторить</button></div></div></div>;
  return <PlannedWorkout workout={entry.workout} onBack={props.onBack} onStart={handleStart} onMarkedCompleted={(completed) => { setLoadedEntry(completed); setDelegate(true); }} onOpenActive={activeWorkoutId && props.onOpenWorkout ? () => props.onOpenWorkout(activeWorkoutId) : null} starting={starting} error={error} />;
}
