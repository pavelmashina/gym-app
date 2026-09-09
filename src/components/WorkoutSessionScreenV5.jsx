import { useEffect, useState } from 'react';
import { getWorkoutEntry, startWorkout } from '../lib/workoutSessions.js';
import { WorkoutSessionScreen as WorkoutSessionScreenV4 } from './WorkoutSessionScreenV4.jsx';
import '../workout-session-report-fixes.css';

function BackIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>;
}

function formatCount(count, forms) {
  const value = Math.abs(Number(count) || 0);
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} ${forms[2]}`;
  if (mod10 === 1) return `${count} ${forms[0]}`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} ${forms[1]}`;
  return `${count} ${forms[2]}`;
}

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`));
}

function plannedSetLabel(set) {
  return set.plannedReps ? `${set.plannedReps} повт.` : 'Повторы не заданы';
}

function PlannedWorkout({ workout, onBack, onStart, starting, error }) {
  return <div className="phone workout-session-phone">
    <header className="workout-session-header"><button type="button" aria-label="Назад" onClick={onBack}><BackIcon /></button><strong>Тренировка</strong><span /></header>
    <main className="workout-session-content">
      <section className="workout-session-hero"><span>{formatDate(workout.scheduledDate)}</span><h1>{workout.name}</h1><p>{formatCount(workout.exercises.length, ['упражнение', 'упражнения', 'упражнений'])} · тренировка ещё не начата</p></section>
      <section className="workout-plan-list">{workout.exercises.map((exercise, index) => <article className="workout-plan-card" key={exercise.id}><div className="workout-plan-number">{index + 1}</div><div className="workout-plan-main"><span>{exercise.muscleGroup || 'Упражнение'}</span><h2>{exercise.name}</h2>{exercise.prescription && <div className="workout-plan-prescription"><span>План</span><strong>{exercise.prescription}</strong></div>}<div className="workout-plan-sets">{exercise.sets.map((set) => <span key={set.id}>Подход {set.setNumber} · {plannedSetLabel(set)}</span>)}</div></div></article>)}</section>
      {error && <div className="workout-session-error">{error}</div>}
    </main>
    <footer className="workout-session-footer"><button type="button" onClick={onStart} disabled={starting}>{starting ? 'Начинаем…' : 'Начать тренировку'}</button></footer>
  </div>;
}

export function WorkoutSessionScreen(props) {
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState('');
  const [delegate, setDelegate] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setDelegate(false);
    getWorkoutEntry(props.scheduledWorkoutId)
      .then((result) => {
        if (!active) return;
        if (result?.mode === 'planned') setEntry(result);
        else setDelegate(true);
      })
      .catch((requestError) => { if (active) setError(requestError?.message || 'Не удалось открыть тренировку.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [props.scheduledWorkoutId]);

  async function handleStart() {
    if (starting) return;
    setStarting(true);
    setError('');
    try {
      await startWorkout(props.scheduledWorkoutId);
      setDelegate(true);
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось начать тренировку.');
    } finally {
      setStarting(false);
    }
  }

  if (delegate) return <WorkoutSessionScreenV4 {...props} />;
  if (loading) return <div className="phone workout-session-phone"><header className="workout-session-header"><button type="button" aria-label="Назад" onClick={props.onBack}><BackIcon /></button><strong>Тренировка</strong><span /></header><div className="workout-session-loading">Загружаем тренировку…</div></div>;
  if (!entry) return <div className="phone workout-session-phone"><header className="workout-session-header"><button type="button" aria-label="Назад" onClick={props.onBack}><BackIcon /></button><strong>Тренировка</strong><span /></header><div className="workout-session-error standalone">{error || 'Тренировка не найдена.'}</div></div>;
  return <PlannedWorkout workout={entry.workout} onBack={props.onBack} onStart={handleStart} starting={starting} error={error} />;
}
