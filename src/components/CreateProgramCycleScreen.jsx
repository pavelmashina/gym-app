import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import '../create-program-step2.css';
import '../create-program-step2-fixes.css';
import '../create-program-workout-draft.css';
import '../create-program-cycle.css';

function BackIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>;
}

function PlusIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}

function TrashIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13" /></svg>;
}

function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
}

function CheckIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="m6 12 4 4 8-9" /></svg>;
}

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>;
}

function formatCount(count, forms) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} ${forms[2]}`;
  if (mod10 === 1) return `${count} ${forms[0]}`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} ${forms[1]}`;
  return `${count} ${forms[2]}`;
}

function createSet() {
  return { id: crypto.randomUUID(), reps: '' };
}

function exerciseKey(exercise) {
  return exercise.sourceWorkoutExerciseId ?? exercise.linkedExerciseId ?? exercise.id;
}

function normalizeExercise(exercise) {
  return {
    ...exercise,
    sets: Array.isArray(exercise.sets) && exercise.sets.length ? exercise.sets : [createSet()],
  };
}

function ExercisePicker({ workout, onBack, onSave }) {
  const [catalog, setCatalog] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const existingCanonicalIds = useMemo(() => workout.exercises.map((exercise) => exercise.linkedExerciseId ?? (!exercise.sourceWorkoutExerciseId ? exercise.id : null)).filter(Boolean), [workout.exercises]);
  const [selectedIds, setSelectedIds] = useState(existingCanonicalIds);

  useEffect(() => {
    let active = true;
    supabase.from('exercises')
      .select('id, name, muscle_group, movement_type, difficulty')
      .order('name', { ascending: true })
      .then(({ data, error: requestError }) => {
        if (!active) return;
        if (requestError) {
          setError('Не удалось загрузить базу упражнений.');
          setCatalog([]);
        } else setCatalog(data ?? []);
        setLoading(false);
      });
    return () => { active = false; };
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase('ru');
    if (!normalized) return catalog;
    return catalog.filter((exercise) => [exercise.name, exercise.muscle_group, exercise.movement_type]
      .filter(Boolean)
      .some((value) => value.toLocaleLowerCase('ru').includes(normalized)));
  }, [catalog, query]);

  function toggle(id) {
    setSelectedIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  function save() {
    const byId = new Map(catalog.map((exercise) => [exercise.id, exercise]));
    const existingByCanonical = new Map(workout.exercises
      .map((exercise) => [exercise.linkedExerciseId ?? (!exercise.sourceWorkoutExerciseId ? exercise.id : null), exercise])
      .filter(([id]) => Boolean(id)));
    const snapshotOnly = workout.exercises.filter((exercise) => exercise.sourceWorkoutExerciseId && !exercise.linkedExerciseId);
    const canonical = selectedIds.map((id) => {
      const existing = existingByCanonical.get(id);
      if (existing) return existing;
      const source = byId.get(id);
      return source ? normalizeExercise({ ...source, linkedExerciseId: source.id }) : null;
    }).filter(Boolean);
    onSave([...snapshotOnly, ...canonical]);
  }

  return (
    <div className="phone create-program-phone program-exercise-picker-phone">
      <header className="create-program-header">
        <button className="create-program-back" type="button" aria-label="Назад" onClick={onBack}><BackIcon /></button>
        <strong>Добавить упражнение</strong><span className="create-program-header-spacer" />
      </header>
      <main className="program-exercise-picker-content">
        <section className="program-exercise-picker-intro">
          <span>Цикл тренировок</span><h1>{workout.name}</h1><p>Выберите упражнения из общей базы. Упражнения из готового каталога с исходным названием сохраняются отдельно.</p>
        </section>
        <label className="program-exercise-search"><SearchIcon /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти упражнение" /></label>
        {loading && <div className="program-exercise-state"><div className="exercise-list-spinner" aria-hidden="true" /><span>Загружаем упражнения…</span></div>}
        {!loading && error && <div className="program-exercise-state error">{error}</div>}
        {!loading && !error && (
          <section className="program-exercise-picker-list">
            {filtered.map((exercise) => {
              const selected = selectedIds.includes(exercise.id);
              return (
                <button className={`program-exercise-picker-row${selected ? ' selected' : ''}`} type="button" key={exercise.id} onClick={() => toggle(exercise.id)} aria-pressed={selected}>
                  <span className="program-exercise-check">{selected && <CheckIcon />}</span>
                  <span className="program-exercise-row-copy"><strong>{exercise.name}</strong><small>{[exercise.muscle_group, exercise.movement_type].filter(Boolean).join(' · ')}</small></span>
                </button>
              );
            })}
          </section>
        )}
      </main>
      <footer className="create-program-footer"><button className="create-program-next" type="button" onClick={save} disabled={loading || Boolean(error)}>Готово · {selectedIds.length}</button></footer>
    </div>
  );
}

function WorkoutEditor({ workout, onBack, onSave }) {
  const [draft, setDraft] = useState(() => ({ ...workout, exercises: workout.exercises.map(normalizeExercise) }));
  const [pickerOpen, setPickerOpen] = useState(false);

  function updateExercise(key, updater) {
    setDraft((current) => ({ ...current, exercises: current.exercises.map((exercise) => exerciseKey(exercise) === key ? updater(exercise) : exercise) }));
  }

  function removeExercise(key) {
    setDraft((current) => ({ ...current, exercises: current.exercises.filter((exercise) => exerciseKey(exercise) !== key) }));
  }

  if (pickerOpen) {
    return <ExercisePicker workout={draft} onBack={() => setPickerOpen(false)} onSave={(exercises) => { setDraft((current) => ({ ...current, exercises })); setPickerOpen(false); }} />;
  }

  return (
    <div className="phone create-program-phone program-workout-editor-phone program-workout-draft-phone">
      <header className="create-program-header"><button className="create-program-back" type="button" onClick={onBack}><BackIcon /></button><strong>Тренировка цикла</strong><span className="create-program-header-spacer" /></header>
      <main className="program-workout-editor-content">
        <section className="program-workout-editor-intro"><span>Один цикл</span><input className="cycle-workout-name-input" type="text" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={80} /><p>Добавьте упражнения и задайте подходы. Эта тренировка будет повторяться вместе со всем циклом.</p></section>
        <section className="program-workout-editor-section">
          <div className="program-workout-editor-section-head"><div><span>Упражнения</span><h2>{formatCount(draft.exercises.length, ['упражнение','упражнения','упражнений'])}</h2></div></div>
          <div className="program-workout-selected-list">
            {draft.exercises.map((exercise, index) => {
              const key = exerciseKey(exercise);
              return (
                <article className="program-workout-exercise-card" key={key}>
                  <header className="program-workout-exercise-head">
                    <span className="program-workout-exercise-number">{index + 1}</span>
                    <div><strong>{exercise.name}</strong><small>{exercise.prescription || [exercise.muscle_group, exercise.movement_type].filter(Boolean).join(' · ') || 'Нет дополнительных данных'}</small></div>
                    <button className="cycle-exercise-remove" type="button" aria-label="Удалить упражнение" onClick={() => removeExercise(key)}><TrashIcon /></button>
                  </header>
                  <div className="program-workout-sets">
                    <div className="program-workout-set-columns"><span>Подход</span><span>Повторения</span><span /></div>
                    {(exercise.sets ?? []).map((set, setIndex) => (
                      <div className="program-workout-set-row" key={set.id}>
                        <span className="program-workout-set-number">{setIndex + 1}</span>
                        <label><input type="number" inputMode="numeric" min="1" max="999" value={set.reps} onChange={(event) => updateExercise(key, (item) => ({ ...item, sets: item.sets.map((candidate) => candidate.id === set.id ? { ...candidate, reps: event.target.value } : candidate) }))} placeholder="—" /></label>
                        <button className="program-workout-set-remove" type="button" onClick={() => updateExercise(key, (item) => ({ ...item, sets: item.sets.filter((candidate) => candidate.id !== set.id) }))}><TrashIcon /></button>
                      </div>
                    ))}
                  </div>
                  <button className="program-workout-add-set" type="button" onClick={() => updateExercise(key, (item) => ({ ...item, sets: [...(item.sets ?? []), createSet()] }))}><PlusIcon /><span>Добавить подход</span></button>
                </article>
              );
            })}
          </div>
          <button className="program-workout-add-exercise" type="button" onClick={() => setPickerOpen(true)}><span><PlusIcon /></span><div><strong>Добавить упражнение</strong><small>Выбрать из базы упражнений</small></div><ChevronIcon /></button>
        </section>
      </main>
      <footer className="create-program-footer"><button className="create-program-next" type="button" onClick={() => onSave({ ...draft, name: draft.name.trim() || 'Без названия' })}>Сохранить тренировку</button></footer>
    </div>
  );
}

export function CreateProgramCycleScreen({ programName, categories, programWeeks, onProgramWeeksChange, onBack, onNext }) {
  const cycle = programWeeks[0] ?? { id: crypto.randomUUID(), number: 1, workouts: [] };
  const [editingWorkoutId, setEditingWorkoutId] = useState(null);
  const totalExercises = cycle.workouts.reduce((sum, workout) => sum + workout.exercises.length, 0);
  const ready = cycle.workouts.length > 0 && cycle.workouts.every((workout) => workout.name.trim() && workout.exercises.length > 0);
  const editingWorkout = cycle.workouts.find((workout) => workout.id === editingWorkoutId) ?? null;

  function updateCycle(updater) {
    onProgramWeeksChange((current) => {
      const currentCycle = current[0] ?? cycle;
      return [{ ...updater(currentCycle), number: 1 }];
    });
  }

  function addWorkout() {
    const nextNumber = cycle.workouts.length + 1;
    const workout = { id: crypto.randomUUID(), name: `Тренировка ${nextNumber}`, restDaysAfter: 1, exercises: [] };
    updateCycle((current) => ({ ...current, workouts: [...current.workouts, workout] }));
    setEditingWorkoutId(workout.id);
  }

  if (editingWorkout) {
    return <WorkoutEditor workout={editingWorkout} onBack={() => setEditingWorkoutId(null)} onSave={(draft) => { updateCycle((current) => ({ ...current, workouts: current.workouts.map((workout) => workout.id === editingWorkout.id ? { ...draft, id: workout.id } : workout) })); setEditingWorkoutId(null); }} />;
  }

  return (
    <div className="phone create-program-phone create-program-step2-phone cycle-builder-phone">
      <header className="create-program-header"><button className="create-program-back" type="button" onClick={onBack}><BackIcon /></button><strong>Создать программу</strong><span className="create-program-header-spacer" /></header>
      <main className="create-program-content create-program-step2-content">
        <section className="create-program-intro create-program-step2-intro"><span>Шаг 2</span><h1>Один цикл тренировок</h1><p>Соберите последовательность тренировок, которая затем будет повторяться. Количество повторений цикла и ритм вы зададите на следующем шаге.</p></section>
        <section className="program-step2-summary">
          <div><span>Программа</span><strong>{programName}</strong></div>
          <div className="program-step2-summary-meta"><span>1 цикл</span><span>{formatCount(cycle.workouts.length,['тренировка','тренировки','тренировок'])}</span><span>{formatCount(totalExercises,['упражнение','упражнения','упражнений'])}</span></div>
          {categories.length > 0 && <div className="program-step2-categories">{categories.map((category) => <span key={category}>{category}</span>)}</div>}
        </section>
        <section className="cycle-recommendation-card"><strong>Рекомендация</strong><span>Обычно удобнее, если один цикл примерно равен одной неделе. Но это не ограничение: цикл может быть короче или длиннее.</span></section>
        <section className="program-step2-section">
          <div className="program-step2-section-head"><div><span>Цикл</span><h2>Последовательность тренировок</h2></div></div>
          <div className="cycle-workout-list">
            {cycle.workouts.map((workout, index) => (
              <article className="program-workout-card cycle-workout-card" key={workout.id}>
                <div className="program-workout-number">{index + 1}</div>
                <div className="program-workout-copy"><strong>{workout.name}</strong><span>{workout.exercises.length ? formatCount(workout.exercises.length,['упражнение','упражнения','упражнений']) : 'Упражнения не выбраны'}</span></div>
                <button className="program-workout-open" type="button" onClick={() => setEditingWorkoutId(workout.id)}><ChevronIcon /></button>
                <button className="program-workout-remove" type="button" onClick={() => updateCycle((current) => ({ ...current, workouts: current.workouts.filter((item) => item.id !== workout.id) }))}><TrashIcon /></button>
              </article>
            ))}
          </div>
          <button className="program-add-workout cycle-add-workout" type="button" onClick={addWorkout}><span><PlusIcon /></span><strong>Добавить тренировку в цикл</strong></button>
        </section>
      </main>
      <footer className="create-program-footer"><button className="create-program-next" type="button" disabled={!ready} onClick={onNext}>Далее</button></footer>
    </div>
  );
}
