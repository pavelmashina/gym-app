import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import '../create-program-step2.css';

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

function ProgramExercisePicker({ workout, weekNumber, onBack, onSave }) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState(() => workout.exercises.map((exercise) => exercise.id));

  useEffect(() => {
    let active = true;

    async function loadCatalog() {
      setLoading(true);
      setError('');

      const { data, error: requestError } = await supabase
        .from('exercises')
        .select('id, name, muscle_group, movement_type, difficulty')
        .eq('is_active', true)
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
  }, []);

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
      .map((id) => catalogById.get(id) ?? existingById.get(id))
      .filter(Boolean);
    onSave(selectedExercises);
  }

  return (
    <div className="phone create-program-phone program-exercise-picker-phone">
      <header className="create-program-header">
        <button className="create-program-back" type="button" aria-label="Назад к тренировке" onClick={onBack}>
          <BackIcon />
        </button>
        <strong>Упражнения</strong>
        <span className="create-program-header-spacer" />
      </header>

      <main className="program-exercise-picker-content">
        <section className="program-exercise-picker-intro">
          <span>Неделя {weekNumber}</span>
          <h1>{workout.name}</h1>
          <p>Выберите упражнения из общей базы. Можно добавить несколько упражнений.</p>
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

        {!loading && error && <div className="program-exercise-state error">{error}</div>}

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
                    <small>
                      {[exercise.muscle_group, exercise.movement_type].filter(Boolean).join(' · ')}
                    </small>
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

  useEffect(() => {
    if (programWeeks.length > 0 && openWeekIds.length === 0) {
      setOpenWeekIds([programWeeks[0].id]);
    }
  }, [programWeeks, openWeekIds.length]);

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

  function saveExercises(weekId, workoutId, exercises) {
    updateWeek(weekId, (week) => ({
      ...week,
      workouts: week.workouts.map((workout) => (
        workout.id === workoutId ? { ...workout, exercises } : workout
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
      <ProgramExercisePicker
        key={`${editingWorkout.weekId}:${editingWorkout.workoutId}`}
        workout={editingWorkoutValue}
        weekNumber={editingWeek.number}
        onBack={() => setEditingWorkout(null)}
        onSave={(exercises) => saveExercises(editingWeek.id, editingWorkoutValue.id, exercises)}
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
                                <input
                                  type="text"
                                  value={workout.name}
                                  onChange={(event) => renameWorkout(week.id, workout.id, event.target.value)}
                                  placeholder={`Тренировка ${workoutIndex + 1}`}
                                  maxLength={80}
                                  aria-label={`Название тренировки ${workoutIndex + 1} недели ${week.number}`}
                                />
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
                                    {workout.exercises.length > 3 && (
                                      <small>+{workout.exercises.length - 3}</small>
                                    )}
                                  </div>
                                )}
                              </div>
                              <button
                                className="program-workout-open"
                                type="button"
                                aria-label={`Выбрать упражнения для тренировки ${workoutIndex + 1}`}
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
