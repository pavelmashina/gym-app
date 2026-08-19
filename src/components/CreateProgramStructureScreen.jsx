import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import '../create-program-step2.css';
import '../create-program-step2-fixes.css';
import '../create-program-workout-draft.css';

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ChevronIcon({ direction = 'right' }) {
  return (
    <svg
      className={direction === 'down' ? 'chevron-down' : ''}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M4.5 19.5 5.8 14 15.9 3.9a2.1 2.1 0 0 1 3 0l1.2 1.2a2.1 2.1 0 0 1 0 3L10 18.2l-5.5 1.3Z" />
      <path d="m14.7 5.1 4.2 4.2" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M5 7h14M9 7V4h6v3M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="m6 12 4 4 8-9" />
    </svg>
  );
}

function formatCount(count, forms) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} ${forms[2]}`;
  if (mod10 === 1) return `${count} ${forms[0]}`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} ${forms[1]}`;
  return `${count} ${forms[2]}`;
}

function formatWeekCount(count) {
  return formatCount(count, ['неделя', 'недели', 'недель']);
}

function formatWorkoutCount(count) {
  return formatCount(count, ['тренировка', 'тренировки', 'тренировок']);
}

function formatExerciseCount(count) {
  return formatCount(count, ['упражнение', 'упражнения', 'упражнений']);
}

function formatSetCount(count) {
  return formatCount(count, ['подход', 'подхода', 'подходов']);
}

function createPrescriptionSet() {
  return {
    id: crypto.randomUUID(),
    reps: '',
  };
}

function withDefaultPrescription(exercise) {
  if (Array.isArray(exercise.sets) && exercise.sets.length > 0) return exercise;
  return {
    ...exercise,
    sets: [createPrescriptionSet()],
  };
}

function createWorkoutDraft(workout) {
  return {
    ...workout,
    exercises: workout.exercises.map((exercise) => {
      const normalizedExercise = withDefaultPrescription(exercise);
      return {
        ...normalizedExercise,
        sets: (normalizedExercise.sets ?? []).map((set) => ({ ...set })),
      };
    }),
  };
}

function ProgramExercisePicker({ workout, weekNumber, onBack, onSave }) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedIds, setSelectedIds] = useState(() => workout.exercises.map((exercise) => exercise.id));

  useEffect(() => {
    let active = true;

    async function loadCatalog() {
      setLoading(true);
      setError('');

      const { data, error: requestError } = await supabase
        .from('exercises')
        .select('id, name, muscle_group, movement_type, difficulty')
        .order('name', { ascending: true });

      if (!active) return;

      if (requestError) {
        console.error('Unable to load exercises for program:', requestError);
        setError('Не удалось загрузить базу упражнений. Попробуйте ещё раз.');
        setCatalog([]);
      } else {
        setCatalog(data ?? []);
      }

      setLoading(false);
    }

    loadCatalog();

    return () => {
      active = false;
    };
  }, [reloadKey]);

  const filteredExercises = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru');
    if (!normalizedQuery) return catalog;

    return catalog.filter((exercise) => [
      exercise.name,
      exercise.muscle_group,
      exercise.movement_type,
    ]
      .filter(Boolean)
      .some((value) => value.toLocaleLowerCase('ru').includes(normalizedQuery)));
  }, [catalog, query]);

  function toggleExercise(exerciseId) {
    setSelectedIds((current) => (
      current.includes(exerciseId)
        ? current.filter((id) => id !== exerciseId)
        : [...current, exerciseId]
    ));
  }

  function handleSave() {
    const catalogById = new Map(catalog.map((exercise) => [exercise.id, exercise]));
    const existingById = new Map(workout.exercises.map((exercise) => [exercise.id, exercise]));
    const selectedExercises = selectedIds
      .map((id) => {
        const catalogExercise = catalogById.get(id);
        const existingExercise = existingById.get(id);
        if (!catalogExercise && !existingExercise) return null;

        if (existingExercise) {
          return withDefaultPrescription({
            ...catalogExercise,
            ...existingExercise,
          });
        }

        return withDefaultPrescription(catalogExercise);
      })
      .filter(Boolean);

    onSave(selectedExercises);
  }

  return (
    <div className="phone create-program-phone program-exercise-picker-phone">
      <header className="create-program-header">
        <button className="create-program-back" type="button" aria-label="Назад к тренировке" onClick={onBack}>
          <BackIcon />
        </button>
        <strong>Добавить упражнение</strong>
        <span className="create-program-header-spacer" />
      </header>

      <main className="program-exercise-picker-content">
        <section className="program-exercise-picker-intro">
          <span>Неделя {weekNumber}</span>
          <h1>{workout.name}</h1>
          <p>Выберите упражнения из общей базы. Уже добавленные упражнения отмечены.</p>
        </section>

        <label className="program-exercise-search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти упражнение"
            aria-label="Поиск упражнений"
          />
          {query && (
            <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}>×</button>
          )}
        </label>

        <div className="program-exercise-picker-meta">
          <span>{loading ? 'Загружаем базу…' : `${catalog.length} упражнений в базе`}</span>
          <strong>Выбрано: {selectedIds.length}</strong>
        </div>

        {loading && (
          <div className="program-exercise-state">
            <div className="exercise-list-spinner" aria-hidden="true" />
            <span>Загружаем упражнения…</span>
          </div>
        )}

        {!loading && error && (
          <div className="program-exercise-state error program-exercise-error-state">
            <span>{error}</span>
            <button type="button" onClick={() => setReloadKey((value) => value + 1)}>Повторить</button>
          </div>
        )}

        {!loading && !error && filteredExercises.length === 0 && (
          <div className="program-exercise-state">По вашему запросу ничего не найдено.</div>
        )}

        {!loading && !error && filteredExercises.length > 0 && (
          <section className="program-exercise-picker-list" aria-label="База упражнений">
            {filteredExercises.map((exercise) => {
              const selected = selectedIds.includes(exercise.id);
              return (
                <button
                  className={`program-exercise-picker-row${selected ? ' selected' : ''}`}
                  type="button"
                  key={exercise.id}
                  onClick={() => toggleExercise(exercise.id)}
                  aria-pressed={selected}
                >
                  <span className="program-exercise-check">{selected && <CheckIcon />}</span>
                  <span className="program-exercise-row-copy">
                    <strong>{exercise.name}</strong>
                    <small>{[exercise.muscle_group, exercise.movement_type].filter(Boolean).join(' · ')}</small>
                  </span>
                </button>
              );
            })}
          </section>
        )}
      </main>

      <footer className="create-program-footer">
        <button className="create-program-next" type="button" onClick={handleSave} disabled={loading || Boolean(error)}>
          Готово · {selectedIds.length}
        </button>
      </footer>
    </div>
  );
}

function ProgramWorkoutEditor({ workout, weekNumber, onBack, onSave }) {
  const initialDraftRef = useRef(null);
  if (!initialDraftRef.current) {
    initialDraftRef.current = createWorkoutDraft(workout);
  }

  const [draft, setDraft] = useState(() => initialDraftRef.current);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const initialSnapshotRef = useRef(JSON.stringify(initialDraftRef.current));
  const nameInputRef = useRef(null);
  const isDirty = JSON.stringify(draft) !== initialSnapshotRef.current;

  useEffect(() => {
    if (!renaming) return;
    const input = nameInputRef.current;
    if (!input) return;
    input.focus();
    input.select();
  }, [renaming]);

  function updateExercise(exerciseId, updater) {
    setDraft((current) => ({
      ...current,
      exercises: current.exercises.map((exercise) => (
        exercise.id === exerciseId ? updater(exercise) : exercise
      )),
    }));
  }

  function addSet(exerciseId) {
    updateExercise(exerciseId, (exercise) => ({
      ...exercise,
      sets: [...(exercise.sets ?? []), createPrescriptionSet()],
    }));
  }

  function updateSetReps(exerciseId, setId, reps) {
    updateExercise(exerciseId, (exercise) => ({
      ...exercise,
      sets: (exercise.sets ?? []).map((set) => (
        set.id === setId ? { ...set, reps } : set
      )),
    }));
  }

  function removeSet(exerciseId, setId) {
    updateExercise(exerciseId, (exercise) => ({
      ...exercise,
      sets: (exercise.sets ?? []).filter((set) => set.id !== setId),
    }));
  }

  function handleBack() {
    if (isDirty) {
      setShowExitConfirm(true);
      return;
    }
    onBack();
  }

  function handleSave() {
    onSave({
      ...draft,
      name: draft.name.trim() || 'Без названия',
    });
  }

  if (pickerOpen) {
    return (
      <ProgramExercisePicker
        workout={draft}
        weekNumber={weekNumber}
        onBack={() => setPickerOpen(false)}
        onSave={(exercises) => {
          setDraft((current) => ({ ...current, exercises }));
          setPickerOpen(false);
        }}
      />
    );
  }

  return (
    <>
      <div className="phone create-program-phone program-workout-editor-phone program-workout-draft-phone">
        <header className="create-program-header">
          <button className="create-program-back" type="button" aria-label="Назад к структуре программы" onClick={handleBack}>
            <BackIcon />
          </button>
          <strong>Тренировка</strong>
          <span className="create-program-header-spacer" />
        </header>

        <main className="program-workout-editor-content">
          <section className="program-workout-editor-intro">
            <span>Неделя {weekNumber}</span>
            <div className={`program-workout-editor-title-row${renaming ? ' editing' : ''}`}>
              {renaming ? (
                <input
                  ref={nameInputRef}
                  type="text"
                  value={draft.name}
                  onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                  onBlur={() => setRenaming(false)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                  }}
                  maxLength={80}
                  aria-label="Название тренировки"
                />
              ) : (
                <h1>{draft.name || 'Без названия'}</h1>
              )}
              <button
                className="program-workout-edit-icon"
                type="button"
                aria-label="Изменить название тренировки"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => setRenaming(true)}
              >
                <PencilIcon />
              </button>
            </div>
            <p>Добавьте упражнения и задайте для каждого количество подходов и повторений.</p>
          </section>

          <section className="program-workout-editor-section">
            <div className="program-workout-editor-section-head">
              <div>
                <span>Упражнения</span>
                <h2>{draft.exercises.length > 0 ? formatExerciseCount(draft.exercises.length) : 'Пока пусто'}</h2>
              </div>
            </div>

            {draft.exercises.length > 0 && (
              <div className="program-workout-selected-list">
                {draft.exercises.map((exercise, index) => {
                  const sets = exercise.sets ?? [];

                  return (
                    <article className="program-workout-exercise-card" key={exercise.id}>
                      <header className="program-workout-exercise-head">
                        <span className="program-workout-exercise-number">{index + 1}</span>
                        <div>
                          <strong>{exercise.name}</strong>
                          <small>{[exercise.muscle_group, exercise.movement_type].filter(Boolean).join(' · ')}</small>
                        </div>
                        <span className="program-workout-set-count">{formatSetCount(sets.length)}</span>
                      </header>

                      <div className="program-workout-sets">
                        <div className="program-workout-set-columns" aria-hidden="true">
                          <span>Подход</span>
                          <span>Повторения</span>
                          <span />
                        </div>

                        {sets.map((set, setIndex) => (
                          <div className="program-workout-set-row" key={set.id}>
                            <span className="program-workout-set-number">{setIndex + 1}</span>
                            <label>
                              <span className="sr-only">Повторения в подходе {setIndex + 1}</span>
                              <input
                                type="number"
                                inputMode="numeric"
                                min="1"
                                max="999"
                                value={set.reps}
                                onChange={(event) => updateSetReps(exercise.id, set.id, event.target.value)}
                                placeholder="0"
                                aria-label={`Повторения, подход ${setIndex + 1}`}
                              />
                            </label>
                            <button
                              className="program-workout-set-remove"
                              type="button"
                              aria-label={`Удалить подход ${setIndex + 1}`}
                              onClick={() => removeSet(exercise.id, set.id)}
                            >
                              <TrashIcon />
                            </button>
                          </div>
                        ))}
                      </div>

                      <button className="program-workout-add-set" type="button" onClick={() => addSet(exercise.id)}>
                        <PlusIcon />
                        <span>Добавить подход</span>
                      </button>
                    </article>
                  );
                })}
              </div>
            )}

            <button className="program-workout-add-exercise" type="button" onClick={() => setPickerOpen(true)}>
              <span><PlusIcon /></span>
              <div>
                <strong>Добавить упражнение</strong>
                <small>Выбрать из базы упражнений</small>
              </div>
              <ChevronIcon />
            </button>
          </section>
        </main>

        <footer className="create-program-footer program-workout-save-footer">
          <button className="create-program-next" type="button" onClick={handleSave}>
            Сохранить
          </button>
        </footer>
      </div>

      {showExitConfirm && (
        <div className="program-unsaved-overlay" role="presentation" onMouseDown={() => setShowExitConfirm(false)}>
          <div
            className="program-unsaved-dialog"
            role="dialog"
            aria-modal="true"
            aria-labelledby="program-unsaved-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="program-unsaved-dialog-icon">!</div>
            <h2 id="program-unsaved-title">Есть несохранённые изменения</h2>
            <p>Упражнения, подходы, повторения или название тренировки были изменены. Выйти без сохранения?</p>
            <div className="program-unsaved-actions">
              <button type="button" className="program-unsaved-stay" onClick={() => setShowExitConfirm(false)}>
                Остаться
              </button>
              <button type="button" className="program-unsaved-leave" onClick={onBack}>
                Выйти без сохранения
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function CreateProgramStructureScreen({
  programName,
  weekCount,
  categories,
  programWeeks,
  onProgramWeeksChange,
  onBack,
}) {
  const [openWeekIds, setOpenWeekIds] = useState([]);
  const [editingWorkout, setEditingWorkout] = useState(null);
  const initializedWeekAccordion = useRef(false);

  useEffect(() => {
    if (!initializedWeekAccordion.current && programWeeks.length > 0) {
      initializedWeekAccordion.current = true;
      setOpenWeekIds([programWeeks[0].id]);
      return;
    }

    const validIds = new Set(programWeeks.map((week) => week.id));
    setOpenWeekIds((current) => current.filter((id) => validIds.has(id)));
  }, [programWeeks]);

  const totalWorkouts = programWeeks.reduce((sum, week) => sum + week.workouts.length, 0);
  const totalExercises = programWeeks.reduce(
    (sum, week) => sum + week.workouts.reduce((workoutSum, workout) => workoutSum + workout.exercises.length, 0),
    0,
  );

  const editingWeek = editingWorkout
    ? programWeeks.find((week) => week.id === editingWorkout.weekId)
    : null;
  const editingWorkoutValue = editingWeek
    ? editingWeek.workouts.find((workout) => workout.id === editingWorkout.workoutId)
    : null;

  function toggleWeek(weekId) {
    setOpenWeekIds((current) => (
      current.includes(weekId)
        ? current.filter((id) => id !== weekId)
        : [...current, weekId]
    ));
  }

  function updateWeek(weekId, updater) {
    onProgramWeeksChange((current) => current.map((week) => (
      week.id === weekId ? updater(week) : week
    )));
  }

  function addWorkout(weekId) {
    updateWeek(weekId, (week) => {
      const nextNumber = week.workouts.length + 1;
      return {
        ...week,
        workouts: [
          ...week.workouts,
          {
            id: crypto.randomUUID(),
            name: `Тренировка ${nextNumber}`,
            exercises: [],
          },
        ],
      };
    });

    setOpenWeekIds((current) => (current.includes(weekId) ? current : [...current, weekId]));
  }

  function renameWorkout(weekId, workoutId, value) {
    updateWeek(weekId, (week) => ({
      ...week,
      workouts: week.workouts.map((workout) => (
        workout.id === workoutId ? { ...workout, name: value } : workout
      )),
    }));
  }

  function removeWorkout(weekId, workoutId) {
    updateWeek(weekId, (week) => ({
      ...week,
      workouts: week.workouts.filter((workout) => workout.id !== workoutId),
    }));
  }

  function saveWorkoutDraft(weekId, workoutId, workoutDraft) {
    updateWeek(weekId, (week) => ({
      ...week,
      workouts: week.workouts.map((workout) => (
        workout.id === workoutId
          ? { ...workout, ...workoutDraft, id: workout.id }
          : workout
      )),
    }));
    setEditingWorkout(null);
  }

  const structureReady = programWeeks.length === weekCount
    && programWeeks.every((week) => (
      week.workouts.length > 0
      && week.workouts.every((workout) => workout.name.trim() && workout.exercises.length > 0)
    ));

  if (editingWorkout && editingWeek && editingWorkoutValue) {
    return (
      <ProgramWorkoutEditor
        key={`${editingWorkout.weekId}:${editingWorkout.workoutId}`}
        workout={editingWorkoutValue}
        weekNumber={editingWeek.number}
        onBack={() => setEditingWorkout(null)}
        onSave={(workoutDraft) => saveWorkoutDraft(editingWeek.id, editingWorkoutValue.id, workoutDraft)}
      />
    );
  }

  return (
    <div className="phone create-program-phone create-program-step2-phone">
      <header className="create-program-header">
        <button className="create-program-back" type="button" aria-label="Назад к основной информации" onClick={onBack}>
          <BackIcon />
        </button>
        <strong>Создать программу</strong>
        <span className="create-program-header-spacer" />
      </header>

      <main className="create-program-content create-program-step2-content">
        <section className="create-program-intro create-program-step2-intro">
          <span>Шаг 2</span>
          <h1>Структура программы</h1>
          <p>В каждой неделе добавьте нужное количество тренировок, а затем выберите упражнения для каждой тренировки.</p>
        </section>

        <section className="program-step2-summary" aria-label="Параметры создаваемой программы">
          <div>
            <span>Программа</span>
            <strong>{programName}</strong>
          </div>
          <div className="program-step2-summary-meta">
            <span>{formatWeekCount(weekCount)}</span>
            <span>{formatWorkoutCount(totalWorkouts)}</span>
            <span>{formatExerciseCount(totalExercises)}</span>
          </div>
          {categories.length > 0 && (
            <div className="program-step2-categories">
              {categories.map((category) => <span key={category}>{category}</span>)}
            </div>
          )}
        </section>

        <section className="program-step2-section">
          <div className="program-step2-section-head">
            <div>
              <span>Структура программы</span>
              <h2>В программе {formatWeekCount(weekCount)}</h2>
            </div>
          </div>

          <div className="program-week-list">
            {programWeeks.map((week) => {
              const isOpen = openWeekIds.includes(week.id);
              const weekExerciseCount = week.workouts.reduce(
                (sum, workout) => sum + workout.exercises.length,
                0,
              );

              return (
                <section className={`program-week-card${isOpen ? ' open' : ''}`} key={week.id}>
                  <button
                    className="program-week-header"
                    type="button"
                    onClick={() => toggleWeek(week.id)}
                    aria-expanded={isOpen}
                  >
                    <span className="program-week-number">{week.number}</span>
                    <span className="program-week-copy">
                      <strong>Неделя {week.number}</strong>
                      <small>
                        {week.workouts.length === 0
                          ? 'Тренировки не добавлены'
                          : `${formatWorkoutCount(week.workouts.length)} · ${formatExerciseCount(weekExerciseCount)}`}
                      </small>
                    </span>
                    <span className="program-week-chevron"><ChevronIcon direction={isOpen ? 'down' : 'right'} /></span>
                  </button>

                  {isOpen && (
                    <div className="program-week-body">
                      {week.workouts.length > 0 && (
                        <div className="program-workout-list">
                          {week.workouts.map((workout, workoutIndex) => (
                            <article className="program-workout-card" key={workout.id}>
                              <div className="program-workout-number" aria-hidden="true">{workoutIndex + 1}</div>
                              <div className="program-workout-copy">
                                <div className="program-workout-name-row">
                                  <input
                                    type="text"
                                    value={workout.name}
                                    onChange={(event) => renameWorkout(week.id, workout.id, event.target.value)}
                                    placeholder={`Тренировка ${workoutIndex + 1}`}
                                    maxLength={80}
                                    aria-label={`Название тренировки ${workoutIndex + 1} недели ${week.number}`}
                                  />
                                  <span className="program-workout-name-edit" aria-hidden="true"><PencilIcon /></span>
                                </div>
                                <span>
                                  {workout.exercises.length > 0
                                    ? formatExerciseCount(workout.exercises.length)
                                    : 'Упражнения не выбраны'}
                                </span>
                                {workout.exercises.length > 0 && (
                                  <div className="program-workout-exercise-preview">
                                    {workout.exercises.slice(0, 3).map((exercise) => (
                                      <small key={exercise.id}>{exercise.name}</small>
                                    ))}
                                    {workout.exercises.length > 3 && <small>+{workout.exercises.length - 3}</small>}
                                  </div>
                                )}
                              </div>
                              <button
                                className="program-workout-open"
                                type="button"
                                aria-label={`Открыть тренировку ${workoutIndex + 1}`}
                                onClick={() => setEditingWorkout({ weekId: week.id, workoutId: workout.id })}
                              >
                                <ChevronIcon />
                              </button>
                              <button
                                className="program-workout-remove"
                                type="button"
                                aria-label={`Удалить тренировку ${workoutIndex + 1}`}
                                onClick={() => removeWorkout(week.id, workout.id)}
                              >
                                <TrashIcon />
                              </button>
                            </article>
                          ))}
                        </div>
                      )}

                      <button className="program-add-workout" type="button" onClick={() => addWorkout(week.id)}>
                        <span><PlusIcon /></span>
                        <strong>Добавить тренировку</strong>
                      </button>
                    </div>
                  )}
                </section>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="create-program-footer">
        <button className="create-program-next" type="button" disabled={!structureReady}>
          Далее
        </button>
      </footer>
    </div>
  );
}
