import { useMemo, useState } from 'react';
import { ExerciseLibraryPicker } from './ExerciseLibraryPicker.jsx';
import '../create-program-step2.css';
import '../create-program-step2-fixes.css';
import '../create-program-workout-draft.css';
import '../create-program-cycle.css';
import '../exercise-library-picker.css';
import { formatRussianCount } from '../lib/formatRussianCount.js';

function BackIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>; }
function TrashIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M5 7h14M9 7V4h6v3M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13" /></svg>; }
function ChevronIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>; }


function createSet() { return { id: crypto.randomUUID(), reps: '' }; }
function exerciseKey(exercise) { return exercise.sourceWorkoutExerciseId ?? exercise.linkedExerciseId ?? exercise.id; }
function normalizeExercise(exercise) { return { ...exercise, sets: Array.isArray(exercise.sets) && exercise.sets.length ? exercise.sets : [createSet()] }; }

function ExercisePicker({ workout, onBack, onSave }) {
  const existingCanonicalIds = useMemo(() => workout.exercises
    .map((exercise) => exercise.linkedExerciseId ?? (!exercise.sourceWorkoutExerciseId ? exercise.id : null))
    .filter(Boolean), [workout.exercises]);
  const [selectedIds, setSelectedIds] = useState(existingCanonicalIds);
  const [catalog, setCatalog] = useState([]);

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

  return <div className="phone create-program-phone program-exercise-picker-phone">
    <header className="create-program-header"><button className="create-program-back" type="button" aria-label="Назад" onClick={onBack}><BackIcon /></button><strong>Упражнения</strong><span className="create-program-header-spacer" /></header>
    <main className="program-exercise-picker-content">
      <section className="program-exercise-picker-intro"><span>Цикл тренировок</span><h1>{workout.name}</h1><p>Выберите упражнения из базы или создайте своё.</p></section>
      <ExerciseLibraryPicker
        multi
        selectedIds={selectedIds}
        onChange={(ids, all) => { setSelectedIds(ids); setCatalog(all); }}
      />
    </main>
    <footer className="create-program-footer"><button className="create-program-next" type="button" onClick={save}>Готово · {selectedIds.length}</button></footer>
  </div>;
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

  return <div className="phone create-program-phone program-workout-editor-phone program-workout-draft-phone">
    <header className="create-program-header"><button className="create-program-back" type="button" onClick={onBack}><BackIcon /></button><strong>Тренировка цикла</strong><span className="create-program-header-spacer" /></header>
    <main className="program-workout-editor-content">
      <section className="program-workout-editor-intro"><span>Один цикл</span><input className="cycle-workout-name-input" type="text" value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} maxLength={80} /><p>Добавьте упражнения и задайте подходы.</p></section>
      <section className="program-workout-editor-section">
        <div className="program-workout-editor-section-head"><div><span>Упражнения</span><h2>{formatRussianCount(draft.exercises.length, ['упражнение', 'упражнения', 'упражнений'])}</h2></div></div>
        <div className="program-workout-selected-list">{draft.exercises.map((exercise, index) => {
          const key = exerciseKey(exercise);
          return <article className="program-workout-exercise-card" key={key}>
            <header className="program-workout-exercise-head"><span className="program-workout-exercise-number">{index + 1}</span><div><strong>{exercise.name}</strong><small>{exercise.prescription || [exercise.display_muscle_group || exercise.muscle_group, exercise.equipment || exercise.movement_type].filter(Boolean).join(' · ') || 'Нет дополнительных данных'}</small></div><button className="cycle-exercise-remove" type="button" aria-label="Удалить упражнение" onClick={() => removeExercise(key)}><TrashIcon /></button></header>
            <div className="program-workout-sets"><div className="program-workout-set-columns"><span>Подход</span><span>Повторения</span><span /></div>{(exercise.sets ?? []).map((set, setIndex) => <div className="program-workout-set-row" key={set.id}><span className="program-workout-set-number">{setIndex + 1}</span><label><input type="number" inputMode="numeric" min="1" max="999" value={set.reps} onChange={(event) => updateExercise(key, (item) => ({ ...item, sets: item.sets.map((candidate) => candidate.id === set.id ? { ...candidate, reps: event.target.value } : candidate) }))} placeholder="—" /></label><button className="program-workout-set-remove" type="button" onClick={() => updateExercise(key, (item) => ({ ...item, sets: item.sets.filter((candidate) => candidate.id !== set.id) }))}><TrashIcon /></button></div>)}</div>
            <button className="program-workout-add-set" type="button" onClick={() => updateExercise(key, (item) => ({ ...item, sets: [...(item.sets ?? []), createSet()] }))}><PlusIcon /><span>Добавить подход</span></button>
          </article>;
        })}</div>
        <button className="program-workout-add-exercise" type="button" onClick={() => setPickerOpen(true)}><span><PlusIcon /></span><div><strong>Добавить упражнение</strong><small>Недавние, мои и вся база</small></div><ChevronIcon /></button>
      </section>
    </main>
    <footer className="create-program-footer"><button className="create-program-next" type="button" onClick={() => onSave({ ...draft, name: draft.name.trim() || 'Без названия' })}>Сохранить тренировку</button></footer>
  </div>;
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

  return <div className="phone create-program-phone create-program-step2-phone cycle-builder-phone">
    <header className="create-program-header"><button className="create-program-back" type="button" onClick={onBack}><BackIcon /></button><strong>Создать программу</strong><span className="create-program-header-spacer" /></header>
    <main className="create-program-content create-program-step2-content">
      <section className="create-program-intro create-program-step2-intro"><span>Шаг 2</span><h1>Один цикл тренировок</h1><p>Соберите последовательность тренировок, которая затем будет повторяться.</p></section>
      <section className="program-step2-summary"><div><span>Программа</span><strong>{programName}</strong></div><div className="program-step2-summary-meta"><span>1 цикл</span><span>{formatRussianCount(cycle.workouts.length, ['тренировка', 'тренировки', 'тренировок'])}</span><span>{formatRussianCount(totalExercises, ['упражнение', 'упражнения', 'упражнений'])}</span></div>{categories.length > 0 && <div className="program-step2-categories">{categories.map((category) => <span key={category}>{category}</span>)}</div>}</section>
      <section className="cycle-recommendation-card"><strong>Рекомендация</strong><span>Обычно удобнее, если один цикл примерно равен одной неделе. Но это не ограничение.</span></section>
      <section className="program-step2-section"><div className="program-step2-section-head"><div><span>Цикл</span><h2>Последовательность тренировок</h2></div></div><div className="cycle-workout-list">{cycle.workouts.map((workout, index) => <article className="program-workout-card cycle-workout-card" key={workout.id}><div className="program-workout-number">{index + 1}</div><div className="program-workout-copy"><strong>{workout.name}</strong><span>{workout.exercises.length ? formatRussianCount(workout.exercises.length, ['упражнение', 'упражнения', 'упражнений']) : 'Упражнения не выбраны'}</span></div><button className="program-workout-open" type="button" onClick={() => setEditingWorkoutId(workout.id)}><ChevronIcon /></button><button className="program-workout-remove" type="button" onClick={() => updateCycle((current) => ({ ...current, workouts: current.workouts.filter((item) => item.id !== workout.id) }))}><TrashIcon /></button></article>)}</div><button className="program-add-workout cycle-add-workout" type="button" onClick={addWorkout}><span><PlusIcon /></span><strong>Добавить тренировку в цикл</strong></button></section>
    </main>
    <footer className="create-program-footer"><button className="create-program-next" type="button" disabled={!ready} onClick={onNext}>Далее</button></footer>
  </div>;
}
