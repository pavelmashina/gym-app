import { useEffect, useMemo, useState } from 'react';
import {
  abandonWorkout,
  addPerformedSet,
  completeWorkout,
  deletePerformedSet,
  getExerciseHistorySummary,
  getWorkoutEntry,
  listWorkoutExerciseCatalog,
  loadWorkoutSession,
  moveSessionExercise,
  replaceSessionExercise,
  startWorkout,
  updateExerciseNote,
  updatePerformedSet,
} from '../lib/workoutSessions.js';
import '../workout-session.css';

const KG_PER_LB = 0.45359237;

function formatDate(dateString) {
  if (!dateString) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' })
    .format(new Date(`${dateString}T12:00:00`));
}

function formatHistoryDate(dateString) {
  if (!dateString) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(dateString));
}

function formatTime(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  return [hours, minutes, seconds].map((value) => String(value).padStart(2, '0')).join(':');
}

function formatRestTime(totalSeconds) {
  const safe = Math.max(0, Math.floor(totalSeconds || 0));
  const minutes = Math.floor(safe / 60);
  const seconds = safe % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function plannedSetLabel(set) {
  return set.plannedReps ? `${set.plannedReps} повт.` : 'Повторы не заданы';
}

function toDisplayWeight(weightKg, unit) {
  if (weightKg === '' || weightKg === null || weightKg === undefined) return '';
  const value = Number(weightKg);
  if (!Number.isFinite(value)) return '';
  const converted = unit === 'lb' ? value / KG_PER_LB : value;
  return String(Math.round(converted * 100) / 100);
}

function fromDisplayWeight(displayValue, unit) {
  if (displayValue === '') return '';
  const value = Number(String(displayValue).replace(',', '.'));
  if (!Number.isFinite(value)) return '';
  const kg = unit === 'lb' ? value * KG_PER_LB : value;
  return String(Math.round(kg * 100) / 100);
}

function formatWeight(weightKg, unit = 'kg') {
  const display = toDisplayWeight(weightKg, unit);
  return display === '' ? '—' : `${display} ${unit === 'lb' ? 'lb' : 'кг'}`;
}

function bestWorkingSet(sets) {
  let best = null;
  for (const set of sets ?? []) {
    if (!set.completed || set.setType !== 'working') continue;
    const weight = Number(set.weight || 0);
    const reps = Number(set.reps || 0);
    if (weight <= 0 || reps <= 0) continue;
    const metric = weight * (1 + reps / 30);
    if (!best || metric > best.metric) best = { set, metric };
  }
  return best;
}

function workingTonnage(sets) {
  return (sets ?? [])
    .filter((set) => set.completed && set.setType === 'working')
    .reduce((sum, set) => sum + Number(set.weight || 0) * Number(set.reps || 0), 0);
}

function progressTone(delta) {
  if (delta === null) return 'new';
  if (delta > 1) return 'up';
  if (delta < -1) return 'down';
  return 'same';
}

function progressLabel(delta) {
  if (delta === null) return 'Первый результат';
  if (Math.abs(delta) <= 1) return 'Без изменений';
  return `${delta > 0 ? '+' : ''}${delta.toFixed(1).replace('.', ',')}%`;
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

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" />
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

function HistoryModal({ data, exerciseName, unit, onClose }) {
  return (
    <div className="workout-modal-shell" role="dialog" aria-modal="true" aria-label={`История ${exerciseName}`}>
      <button className="workout-modal-scrim" type="button" aria-label="Закрыть" onClick={onClose} />
      <section className="workout-modal-card history-modal">
        <div className="workout-modal-head">
          <div>
            <span>История упражнения</span>
            <h3>{exerciseName}</h3>
          </div>
          <button type="button" onClick={onClose}>×</button>
        </div>

        {data?.best && (
          <div className="history-best-card">
            <span>Лучший подход</span>
            <strong>{formatWeight(data.best.set.weight, unit)} × {data.best.set.reps}</strong>
            <small>{formatHistoryDate(data.best.date)}</small>
          </div>
        )}

        <div className="history-section-title">Предыдущий результат</div>
        {!data?.previous ? (
          <p className="history-empty">Это упражнение ещё не выполнялось в завершённой тренировке.</p>
        ) : (
          <>
            <div className="history-date">{formatHistoryDate(data.previous.date)}</div>
            <div className="history-table">
              <div className="history-row head"><span>Подход</span><span>Вес</span><span>Повторы</span></div>
              {data.previous.sets.map((set) => (
                <div className="history-row" key={set.id}>
                  <span>{set.setType === 'warmup' ? 'Разм.' : set.setNumber}</span>
                  <strong>{formatWeight(set.weight, unit)}</strong>
                  <strong>{set.reps || '—'}</strong>
                </div>
              ))}
            </div>
          </>
        )}
      </section>
    </div>
  );
}

function ReplaceExerciseModal({ exercises, currentExerciseId, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return exercises.filter((exercise) => (
      exercise.id !== currentExerciseId
      && (!normalized
        || exercise.name.toLowerCase().includes(normalized)
        || (exercise.muscle_group || '').toLowerCase().includes(normalized))
    )).slice(0, 80);
  }, [currentExerciseId, exercises, query]);

  return (
    <div className="workout-modal-shell" role="dialog" aria-modal="true" aria-label="Заменить упражнение">
      <button className="workout-modal-scrim" type="button" aria-label="Закрыть" onClick={onClose} />
      <section className="workout-modal-card replace-modal">
        <div className="workout-modal-head">
          <div><span>Текущая тренировка</span><h3>Заменить упражнение</h3></div>
          <button type="button" onClick={onClose}>×</button>
        </div>
        <input
          className="replace-exercise-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Поиск упражнения"
          autoFocus
        />
        <div className="replace-exercise-list">
          {filtered.map((exercise) => (
            <button key={exercise.id} type="button" onClick={() => onSelect(exercise)}>
              <strong>{exercise.name}</strong>
              <span>{exercise.muscle_group || 'Без группы'}</span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function ActiveWorkout({ entry, onEntryChange, onFinish, onAbandon, finishing, abandoning, error }) {
  const { workout, session } = entry;
  const [now, setNow] = useState(() => Date.now());
  const [savingSetId, setSavingSetId] = useState(null);
  const [localError, setLocalError] = useState('');
  const [history, setHistory] = useState(null);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [replaceTarget, setReplaceTarget] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [restStartedAt, setRestStartedAt] = useState(null);
  const [weightUnit, setWeightUnit] = useState(() => {
    const stored = window.localStorage.getItem('gym-weight-unit');
    return stored === 'lb' ? 'lb' : 'kg';
  });

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const elapsed = useMemo(() => {
    const started = new Date(session.startedAt).getTime();
    return session.activeDurationSeconds + Math.max(0, Math.floor((now - started) / 1000));
  }, [now, session.activeDurationSeconds, session.startedAt]);

  const restElapsed = restStartedAt ? Math.max(0, Math.floor((now - restStartedAt) / 1000)) : 0;

  function setUnit(nextUnit) {
    setWeightUnit(nextUnit);
    window.localStorage.setItem('gym-weight-unit', nextUnit);
  }

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
    if (next.completed) setRestStartedAt(Date.now());
  }

  async function addSet(exercise, setType) {
    setLocalError('');
    const nextNumber = Math.max(0, ...exercise.sets.map((set) => set.setNumber)) + 1;
    try {
      const created = await addPerformedSet(exercise.id, nextNumber, setType);
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

  async function removeSet(exercise, set) {
    setLocalError('');
    try {
      await deletePerformedSet(set.id);
      onEntryChange((current) => ({
        ...current,
        workout: {
          ...current.workout,
          exercises: current.workout.exercises.map((item) => (
            item.id === exercise.id
              ? { ...item, sets: item.sets.filter((candidate) => candidate.id !== set.id) }
              : item
          )),
        },
      }));
    } catch (deleteError) {
      setLocalError(deleteError.message);
    }
  }

  async function saveNote(exercise) {
    try {
      await updateExerciseNote(exercise.id, exercise.note ?? '');
    } catch (noteError) {
      setLocalError(noteError.message);
    }
  }

  async function openHistory(exercise) {
    setHistoryLoading(true);
    setLocalError('');
    try {
      const data = await getExerciseHistorySummary(exercise.exerciseId, session.id);
      setHistory({ exerciseName: exercise.name, data });
    } catch (historyError) {
      setLocalError(historyError.message);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openReplacement(exercise) {
    setReplaceTarget(exercise);
    if (catalog.length > 0) return;
    setCatalogLoading(true);
    try {
      setCatalog(await listWorkoutExerciseCatalog());
    } catch (catalogError) {
      setLocalError(catalogError.message);
      setReplaceTarget(null);
    } finally {
      setCatalogLoading(false);
    }
  }

  async function chooseReplacement(exercise) {
    if (!replaceTarget) return;
    setLocalError('');
    try {
      await replaceSessionExercise(replaceTarget.id, exercise.id);
      setReplaceTarget(null);
      onEntryChange(await loadWorkoutSession(session.id));
    } catch (replaceError) {
      setLocalError(replaceError.message);
    }
  }

  async function moveExercise(exercise, direction) {
    setLocalError('');
    try {
      await moveSessionExercise(exercise.id, direction);
      onEntryChange(await loadWorkoutSession(session.id));
    } catch (moveError) {
      setLocalError(moveError.message);
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

        <div className="workout-active-tools">
          <div className="weight-unit-toggle" aria-label="Единица веса">
            <button className={weightUnit === 'kg' ? 'active' : ''} type="button" onClick={() => setUnit('kg')}>kg</button>
            <button className={weightUnit === 'lb' ? 'active' : ''} type="button" onClick={() => setUnit('lb')}>lbs</button>
          </div>
          {restStartedAt && (
            <div className="rest-timer" aria-live="polite">
              <span>Отдых</span>
              <strong>{formatRestTime(restElapsed)}</strong>
              <button type="button" onClick={() => setRestStartedAt(null)}>Сбросить</button>
            </div>
          )}
        </div>

        <section className="workout-execution-list">
          {workout.exercises.map((exercise, exerciseIndex) => (
            <article className="workout-exercise-card" key={exercise.id}>
              <div className="workout-exercise-title-row">
                <div className="workout-exercise-title">
                  <span>{exerciseIndex + 1} · {exercise.muscleGroup || 'Упражнение'}</span>
                  <h2>{exercise.name}</h2>
                </div>
                <div className="exercise-order-buttons">
                  <button type="button" aria-label="Выше" disabled={exerciseIndex === 0} onClick={() => moveExercise(exercise, -1)}>↑</button>
                  <button type="button" aria-label="Ниже" disabled={exerciseIndex === workout.exercises.length - 1} onClick={() => moveExercise(exercise, 1)}>↓</button>
                </div>
              </div>

              <div className="exercise-secondary-actions">
                <button type="button" onClick={() => openHistory(exercise)} disabled={historyLoading}>
                  {historyLoading ? 'Загружаем…' : 'Предыдущий результат'}
                </button>
                <button type="button" onClick={() => openReplacement(exercise)}>Заменить</button>
              </div>

              <div className="performed-set-head five-columns">
                <span>Тип</span><span>Вес</span><span>Повт.</span><span /><span />
              </div>

              <div className="performed-set-list">
                {exercise.sets.map((set) => (
                  <div className={`performed-set-row five-columns${set.completed ? ' done' : ''}`} key={set.id}>
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
                      placeholder={weightUnit === 'lb' ? 'lb' : 'кг'}
                      value={toDisplayWeight(set.weight, weightUnit)}
                      onChange={(event) => patchSet(exercise.id, set.id, {
                        weight: fromDisplayWeight(event.target.value, weightUnit),
                      })}
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
                    <button
                      className="set-delete-button"
                      type="button"
                      aria-label="Удалить подход"
                      onClick={() => removeSet(exercise, set)}
                      disabled={savingSetId === set.id}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>

              <div className="add-set-actions">
                <button className="add-set-button" type="button" onClick={() => addSet(exercise, 'working')}>
                  + Рабочий подход
                </button>
                <button className="add-set-button warmup" type="button" onClick={() => addSet(exercise, 'warmup')}>
                  + Разминочный
                </button>
              </div>

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

      <footer className="workout-session-footer workout-session-footer-dual">
        <button className="workout-abandon-button" type="button" onClick={onAbandon} disabled={finishing || abandoning}>
          {abandoning ? 'Прерываем…' : 'Прервать тренировку'}
        </button>
        <button type="button" onClick={onFinish} disabled={finishing || abandoning}>
          {finishing ? 'Завершаем…' : 'Завершить тренировку'}
        </button>
      </footer>

      {history && (
        <HistoryModal
          data={history.data}
          exerciseName={history.exerciseName}
          unit={weightUnit}
          onClose={() => setHistory(null)}
        />
      )}

      {replaceTarget && !catalogLoading && (
        <ReplaceExerciseModal
          exercises={catalog}
          currentExerciseId={replaceTarget.exerciseId}
          onSelect={chooseReplacement}
          onClose={() => setReplaceTarget(null)}
        />
      )}
    </>
  );
}

function CompletedWorkout({ entry, onDone }) {
  const [comparisons, setComparisons] = useState([]);
  const [comparisonLoading, setComparisonLoading] = useState(true);
  const completedSets = entry.workout.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.completed);
  const workingSets = completedSets.filter((set) => set.setType === 'working');
  const warmupSets = completedSets.filter((set) => set.setType === 'warmup');
  const tonnage = workingTonnage(completedSets);
  const completedExerciseCount = entry.workout.exercises.filter((exercise) => (
    exercise.sets.some((set) => set.completed && set.setType === 'working')
  )).length;

  useEffect(() => {
    let active = true;
    setComparisonLoading(true);

    Promise.all(entry.workout.exercises.map(async (exercise) => {
      const currentBest = bestWorkingSet(exercise.sets);
      const currentTonnage = workingTonnage(exercise.sets);
      const history = await getExerciseHistorySummary(exercise.exerciseId, entry.session.id);
      const previousBest = bestWorkingSet(history.previous?.sets ?? []);
      const previousTonnage = workingTonnage(history.previous?.sets ?? []);
      const delta = currentBest && previousBest
        ? ((currentBest.metric / previousBest.metric) - 1) * 100
        : null;
      const isNewBest = Boolean(
        currentBest
        && (!history.best || currentBest.metric > history.best.estimatedOneRepMax + 0.0001),
      );

      return {
        id: exercise.id,
        name: exercise.name,
        currentBest,
        previousBest,
        currentTonnage,
        previousTonnage,
        delta,
        isNewBest,
        previousDate: history.previous?.date ?? null,
      };
    }))
      .then((rows) => { if (active) setComparisons(rows); })
      .catch(() => { if (active) setComparisons([]); })
      .finally(() => { if (active) setComparisonLoading(false); });

    return () => { active = false; };
  }, [entry.session.id, entry.workout.exercises]);

  const improved = comparisons.filter((item) => item.delta !== null && item.delta > 1).length;
  const declined = comparisons.filter((item) => item.delta !== null && item.delta < -1).length;
  const records = comparisons.filter((item) => item.isNewBest).length;

  return (
    <>
      <main className="workout-session-content completed workout-completed-expanded">
        <section className="workout-complete-hero">
          <div className="workout-complete-mark"><CheckIcon /></div>
          <span>Тренировка завершена</span>
          <h1>{entry.workout.name}</h1>
          <p>{formatDate(entry.workout.scheduledDate)}</p>
        </section>

        <section className="workout-result-grid workout-result-grid-expanded">
          <div><span>Время</span><strong>{formatTime(entry.session.activeDurationSeconds)}</strong></div>
          <div><span>Тоннаж</span><strong>{Math.round(tonnage).toLocaleString('ru-RU')} кг</strong></div>
          <div><span>Упражнений</span><strong>{completedExerciseCount}/{entry.workout.exercises.length}</strong></div>
          <div><span>Рабочих подходов</span><strong>{workingSets.length}</strong></div>
          <div><span>Разминочных</span><strong>{warmupSets.length}</strong></div>
          <div><span>Новых лучших</span><strong>{comparisonLoading ? '…' : records}</strong></div>
        </section>

        <section className="workout-progress-section">
          <div className="workout-progress-heading">
            <div>
              <span>Сравнение</span>
              <h2>Прогресс к прошлому результату</h2>
            </div>
            {!comparisonLoading && comparisons.length > 0 && (
              <div className="workout-progress-balance">
                <span className="up">↑ {improved}</span>
                <span className="down">↓ {declined}</span>
              </div>
            )}
          </div>

          {comparisonLoading && <div className="workout-progress-loading">Сравниваем с историей…</div>}

          {!comparisonLoading && comparisons.map((item) => {
            const tone = progressTone(item.delta);
            return (
              <article className="workout-progress-card" key={item.id}>
                <div className="workout-progress-card-head">
                  <strong>{item.name}</strong>
                  <span className={`workout-progress-chip ${tone}`}>{progressLabel(item.delta)}</span>
                </div>

                {item.isNewBest && <div className="workout-new-record">Новый лучший подход</div>}

                <div className="workout-progress-values">
                  <div>
                    <span>Сегодня</span>
                    <strong>
                      {item.currentBest
                        ? `${formatWeight(item.currentBest.set.weight)} × ${item.currentBest.set.reps}`
                        : 'Нет рабочего подхода'}
                    </strong>
                    <small>Тоннаж {Math.round(item.currentTonnage).toLocaleString('ru-RU')} кг</small>
                  </div>
                  <div>
                    <span>Предыдущий</span>
                    <strong>
                      {item.previousBest
                        ? `${formatWeight(item.previousBest.set.weight)} × ${item.previousBest.set.reps}`
                        : 'Нет данных'}
                    </strong>
                    <small>
                      {item.previousDate
                        ? `${formatHistoryDate(item.previousDate)} · ${Math.round(item.previousTonnage).toLocaleString('ru-RU')} кг`
                        : 'Первое завершённое выполнение'}
                    </small>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      </main>

      <footer className="workout-session-footer">
        <button type="button" onClick={onDone}>На главную</button>
      </footer>
    </>
  );
}

function AbandonedWorkout({ entry, onDone }) {
  const completedSets = entry.workout.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.completed);
  const workingSets = completedSets.filter((set) => set.setType === 'working');

  return (
    <>
      <main className="workout-session-content completed">
        <section className="workout-complete-hero abandoned">
          <div className="workout-abandoned-mark">×</div>
          <span>Тренировка прервана</span>
          <h1>{entry.workout.name}</h1>
          <p>Она отмечена как пропущенная. Следующая тренировка программы останется в расписании.</p>
        </section>

        <section className="workout-result-grid">
          <div><span>Время до остановки</span><strong>{formatTime(entry.session.activeDurationSeconds)}</strong></div>
          <div><span>Выполнено подходов</span><strong>{completedSets.length}</strong></div>
          <div><span>Рабочих</span><strong>{workingSets.length}</strong></div>
          <div><span>Статус</span><strong>Пропущена</strong></div>
        </section>

        <div className="workout-abandoned-note">
          Выполненные подходы сохранены внутри этой сессии, но не используются как завершённый результат для «Предыдущего результата» и личных рекордов.
        </div>
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
  const [abandoning, setAbandoning] = useState(false);
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

  async function handleAbandon() {
    if (!entry?.session?.id) return;
    const confirmed = window.confirm('Прервать тренировку? Она будет отмечена как пропущенная, а выполненные подходы не попадут в завершённую историю.');
    if (!confirmed) return;

    setAbandoning(true);
    setError('');
    try {
      setEntry(await abandonWorkout(entry.session.id));
    } catch (abandonError) {
      setError(abandonError.message);
    } finally {
      setAbandoning(false);
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
        <ActiveWorkout
          entry={entry}
          onEntryChange={setEntry}
          onFinish={handleFinish}
          onAbandon={handleAbandon}
          finishing={finishing}
          abandoning={abandoning}
          error={error}
        />
      )}
      {!loading && entry?.mode === 'completed' && (
        <CompletedWorkout entry={entry} onDone={onCompleted} />
      )}
      {!loading && entry?.mode === 'abandoned' && (
        <AbandonedWorkout entry={entry} onDone={onCompleted} />
      )}
    </div>
  );
}
