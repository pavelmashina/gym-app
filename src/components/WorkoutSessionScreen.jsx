import { useEffect, useMemo, useState } from 'react';
import {
  addPerformedSet,
  completeWorkout,
  getWorkoutEntry,
  startWorkout,
  updateExerciseNote,
  updatePerformedSet,
} from '../lib/workoutSessions.js';
import '../workout-session.css';

function formatDate(dateString) {
  if (!dateString) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
    .format(new Date(`${dateString}T12:00:00`));
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function plannedSetLabel(set) {
  return set.plannedReps ? `${set.plannedReps} повт.` : 'Повторы не заданы';
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m5 12 4 4L19 6" />
    </svg>
  );
}

function PlannedWorkout({ workout, onStart, starting, error }) {
  return (
    <>
      <main className="workout-session-content">
        <section className="workout-session-hero">
          <span>{formatDate(workout.scheduledDate)}</span>
          <h1>{workout.name}</h1>
          <p>{workout.exercises.length} упражнений · тренировка ещё не начата</p>
        </section>

        <section className="workout-plan-list">
          {workout.exercises.map((exercise, index) => (
            <article className="workout-plan-card" key={exercise.id}>
              <div className="workout-plan-number">{index + 1}</div>
              <div className="workout-plan-main">
                <span>{exercise.muscleGroup || 'Упражнение'}</span>
                <h2>{exercise.name}</h2>
                <div className="workout-plan-sets">
                  {exercise.sets.map((set) => (
                    <span key={set.id}>Подход {set.setNumber} · {plannedSetLabel(set)}</span>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </section>

        {error && <div className="workout-session-error">{error}</div>}
      </main>

      <footer className="workout-session-footer">
        <button type="button" onClick={onStart} disabled={starting}>
          {starting ? 'Начинаем…' : 'Начать тренировку'}
        </button>
      </footer>
    </>
  );
}

function ActiveWorkout({ entry, onEntryChange, onFinish, finishing, error }) {
  const { workout, session } = entry;
  const [now, setNow] = useState(() => Date.now());
  const [savingSetId, setSavingSetId] = useState(null);
  const [localError, setLocalError] = useState('');

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = useMemo(() => {
    const started = new Date(session.startedAt).getTime();
    return session.activeDurationSeconds + Math.max(0, Math.floor((now - started) / 1000));
  }, [now, session.activeDurationSeconds, session.startedAt]);

  function patchSet(exerciseId, setId, patch) {
    onEntryChange((current) => ({
      ...current,
      workout: {
        ...current.workout,
        exercises: current.workout.exercises.map((exercise) => (
          exercise.id !== exerciseId
            ? exercise
            : {
                ...exercise,
                sets: exercise.sets.map((set) => (set.id === setId ? { ...set, ...patch } : set)),
              }
        )),
      },
    }));
  }

  async function saveSet(exerciseId, set) {
    setSavingSetId(set.id);
    setLocalError('');
    try {
      await updatePerformedSet(set.id, set);
    } catch (saveError) {
      setLocalError(saveError.message);
    } finally {
      setSavingSetId(null);
    }
  }

  async function toggleComplete(exerciseId, set) {
    if (!set.completed && (!set.reps || Number(set.reps) <= 0)) {
      setLocalError('Укажите количество повторений перед завершением подхода.');
      return;
    }
    const next = { ...set, completed: !set.completed };
    patchSet(exerciseId, set.id, { completed: next.completed });
    await saveSet(exerciseId, next);
  }

  async function addSet(exercise) {
    setLocalError('');
    const nextNumber = Math.max(0, ...exercise.sets.map((set) => set.setNumber)) + 1;
    try {
      const created = await addPerformedSet(exercise.id, nextNumber);
      onEntryChange((current) => ({
        ...current,
        workout: {
          ...current.workout,
          exercises: current.workout.exercises.map((item) => (
            item.id === exercise.id ? { ...item, sets: [...item.sets, created] } : item
          )),
        },
      }));
    } catch (addError) {
      setLocalError(addError.message);
    }
  }

  async function saveNote(exercise) {
    try {
      await updateExerciseNote(exercise.id, exercise.note ?? '');
    } catch (noteError) {
      setLocalError(noteError.message);
    }
  }

  return (
    <>
      <main className="workout-session-content active">
        <section className="workout-active-head">
          <div>
            <span>Тренировка идёт</span>
            <h1>{workout.name}</h1>
          </div>
          <div className="workout-timer" aria-label="Время тренировки">{formatTime(elapsed)}</div>
        </section>

        <section className="workout-execution-list">
          {workout.exercises.map((exercise, exerciseIndex) => (
            <article className="workout-exercise-card" key={exercise.id}>
              <div className="workout-exercise-title">
                <span>{exerciseIndex + 1} · {exercise.muscleGroup || 'Упражнение'}</span>
                <h2>{exercise.name}</h2>
              </div>

              <div className="performed-set-head">
                <span>Тип</span><span>Вес</span><span>Повт.</span><span />
              </div>

              <div className="performed-set-list">
                {exercise.sets.map((set) => (
                  <div className={`performed-set-row${set.completed ? ' done' : ''}`} key={set.id}>
                    <button
                      className="set-type-toggle"
                      type="button"
                      onClick={() => {
                        const setType = set.setType === 'working' ? 'warmup' : 'working';
                        const next = { ...set, setType };
                        patchSet(exercise.id, set.id, { setType });
                        saveSet(exercise.id, next);
                      }}
                      disabled={savingSetId === set.id}
                    >
                      {set.setType === 'working' ? `Раб. ${set.setNumber}` : `Разм. ${set.setNumber}`}
                    </button>
                    <input
                      inputMode="decimal"
                      placeholder="кг"
                      value={set.weight}
                      onChange={(event) => patchSet(exercise.id, set.id, { weight: event.target.value })}
                      onBlur={() => saveSet(exercise.id, set)}
                    />
                    <input
                      inputMode="numeric"
                      placeholder={set.plannedReps ? String(set.plannedReps) : '—'}
                      value={set.reps}
                      onChange={(event) => patchSet(exercise.id, set.id, { reps: event.target.value })}
                      onBlur={() => saveSet(exercise.id, set)}
                    />
                    <button
                      className="set-complete-button"
                      type="button"
                      aria-label={set.completed ? 'Вернуть подход' : 'Завершить подход'}
                      onClick={() => toggleComplete(exercise.id, set)}
                      disabled={savingSetId === set.id}
                    >
                      <CheckIcon />
                    </button>
                  </div>
                ))}
              </div>

              <button className="add-set-button" type="button" onClick={() => addSet(exercise)}>
                + Добавить подход
              </button>

              <label className="exercise-note-field">
                <span>Заметка к упражнению</span>
                <textarea
                  rows="2"
                  value={exercise.note ?? ''}
                  placeholder="Техника, ощущения, подсказка на следующий раз…"
                  onChange={(event) => onEntryChange((current) => ({
                    ...current,
                    workout: {
                      ...current.workout,
                      exercises: current.workout.exercises.map((item) => (
                        item.id === exercise.id ? { ...item, note: event.target.value } : item
                      )),
                    },
                  }))}
                  onBlur={() => saveNote(exercise)}
                />
              </label>
            </article>
          ))}
        </section>

        {(error || localError) && <div className="workout-session-error">{error || localError}</div>}
      </main>

      <footer className="workout-session-footer">
        <button type="button" onClick={onFinish} disabled={finishing}>
          {finishing ? 'Завершаем…' : 'Завершить тренировку'}
        </button>
      </footer>
    </>
  );
}

function CompletedWorkout({ entry, onDone }) {
  const completedSets = entry.workout.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.completed);
  const workingSets = completedSets.filter((set) => set.setType === 'working');
  const warmupSets = completedSets.filter((set) => set.setType === 'warmup');
  const tonnage = workingSets.reduce((sum, set) => {
    const weight = Number(set.weight || 0);
    const reps = Number(set.reps || 0);
    return sum + weight * reps;
  }, 0);

  return (
    <>
      <main className="workout-session-content completed">
        <section className="workout-complete-hero">
          <div className="workout-complete-mark"><CheckIcon /></div>
          <span>Тренировка завершена</span>
          <h1>{entry.workout.name}</h1>
          <p>{formatDate(entry.workout.scheduledDate)}</p>
        </section>

        <section className="workout-result-grid">
          <div><span>Время</span><strong>{formatTime(entry.session.activeDurationSeconds)}</strong></div>
          <div><span>Рабочих подходов</span><strong>{workingSets.length}</strong></div>
          <div><span>Разминочных</span><strong>{warmupSets.length}</strong></div>
          <div><span>Тоннаж</span><strong>{Math.round(tonnage).toLocaleString('ru-RU')} кг</strong></div>
        </section>
      </main>

      <footer className="workout-session-footer">
        <button type="button" onClick={onDone}>На главную</button>
      </footer>
    </>
  );
}

export function WorkoutSessionScreen({ scheduledWorkoutId, onBack, onCompleted }) {
  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getWorkoutEntry(scheduledWorkoutId)
      .then((result) => { if (active) setEntry(result); })
      .catch((loadError) => { if (active) setError(loadError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [scheduledWorkoutId]);

  async function handleStart() {
    setStarting(true);
    setError('');
    try {
      setEntry(await startWorkout(scheduledWorkoutId));
    } catch (startError) {
      setError(startError.message);
    } finally {
      setStarting(false);
    }
  }

  async function handleFinish() {
    if (!entry?.session?.id) return;
    setFinishing(true);
    setError('');
    try {
      setEntry(await completeWorkout(entry.session.id));
    } catch (finishError) {
      setError(finishError.message);
    } finally {
      setFinishing(false);
    }
  }

  return (
    <div className="phone workout-session-phone">
      <header className="workout-session-header">
        <button type="button" aria-label="Назад" onClick={onBack}><BackIcon /></button>
        <strong>Тренировка</strong>
        <span />
      </header>

      {loading && <div className="workout-session-loading">Загружаем тренировку…</div>}
      {!loading && !entry && <div className="workout-session-error standalone">{error || 'Тренировка не найдена.'}</div>}
      {!loading && entry?.mode === 'planned' && (
        <PlannedWorkout workout={entry.workout} onStart={handleStart} starting={starting} error={error} />
      )}
      {!loading && entry?.mode === 'active' && (
        <ActiveWorkout entry={entry} onEntryChange={setEntry} onFinish={handleFinish} finishing={finishing} error={error} />
      )}
      {!loading && entry?.mode === 'completed' && (
        <CompletedWorkout entry={entry} onDone={onCompleted} />
      )}
    </div>
  );
}
