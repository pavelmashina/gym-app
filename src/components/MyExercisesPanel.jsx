import { useEffect, useRef, useState } from 'react';
import { deleteCustomExercise, getCustomExerciseUsage, listMyExercises } from '../lib/exerciseLibrary.js';
import { formatWorkoutCount } from '../lib/formatRussianCount.js';
import '../exercise-library-picker.css';
import '../my-exercises.css';
import { CustomExerciseForm } from './CustomExerciseForm.jsx';
import { ExerciseInfoModal } from './ExerciseInfoModal.jsx';

function PlusIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>; }

function DeleteExerciseDialog({ exercise, onClose, onDeleted }) {
  const [usage, setUsage] = useState(null);
  const [usageError, setUsageError] = useState('');
  const [usageCheck, setUsageCheck] = useState(0);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setUsage(null);
    setUsageError('');
    getCustomExerciseUsage(exercise.id)
      .then((value) => { if (active) setUsage(value); })
      .catch((requestError) => { if (active) setUsageError(requestError?.message || 'Не удалось проверить, где используется упражнение.'); });
    return () => { active = false; };
  }, [exercise.id, usageCheck]);

  async function confirmDelete() {
    setPending(true);
    setError('');
    try {
      await deleteCustomExercise(exercise.id);
      onDeleted(exercise.id);
    } catch (requestError) {
      setError(requestError?.message || 'Не удалось удалить упражнение.');
      setPending(false);
    }
  }

  return <div className="program-detail-delete-overlay" role="presentation">
    <button type="button" className="program-detail-delete-scrim" aria-label="Закрыть подтверждение" disabled={pending} onClick={onClose} />
    <section className="program-detail-delete-dialog" role="dialog" aria-modal="true" aria-labelledby="my-exercise-delete-title">
      <h2 id="my-exercise-delete-title">Удалить упражнение?</h2>
      {!usage && !usageError && <p>Проверяем, где используется «{exercise.name}»…</p>}
      {usageError && <p className="program-detail-delete-error" role="alert">{usageError}</p>}
      {usage?.total === 0 && <p>«{exercise.name}» удалится вместе с фото и видео. Отменить это нельзя.</p>}
      {usage?.total > 0 && <>
        <p>«{exercise.name}» пропадёт из «Моих упражнений» и из выбора упражнений. Сохранённые программы и результаты не изменятся.</p>
        <ul className="my-exercises-usage">
          {usage.programs > 0 && <li>В программах: {formatWorkoutCount(usage.programs)}</li>}
          {usage.scheduled > 0 && <li>В расписании: {formatWorkoutCount(usage.scheduled)}</li>}
          {usage.history > 0 && <li>В истории: {formatWorkoutCount(usage.history)}</li>}
        </ul>
      </>}
      {error && <p className="program-detail-delete-error" role="alert">{error}</p>}
      <div className="program-detail-delete-buttons">
        <button type="button" disabled={pending} onClick={onClose}>Отмена</button>
        {usageError
          ? <button type="button" onClick={() => setUsageCheck((value) => value + 1)}>Повторить</button>
          : <button type="button" className="danger" disabled={pending || !usage} onClick={confirmDelete}>{pending ? 'Удаляем…' : 'Удалить'}</button>}
      </div>
    </section>
  </div>;
}

export function MyExercisesPanel({ refreshKey = 0 }) {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [opened, setOpened] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [form, setForm] = useState(null);
  const panelRef = useRef(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    listMyExercises()
      .then((items) => { if (active) setExercises(items); })
      .catch((requestError) => { if (active) setError(requestError?.message || 'Не удалось загрузить ваши упражнения.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey, reloadKey]);

  // The form replaces the list, so a row opened far down must not leave it off screen.
  useEffect(() => { if (form) panelRef.current?.scrollIntoView({ block: 'start' }); }, [form]);

  function editExercise(exercise) {
    setOpened(null);
    setForm({ exercise });
  }

  function handleSaved(saved) {
    setExercises((current) => current.some((item) => item.id === saved.id)
      ? current.map((item) => item.id === saved.id ? saved : item)
      : [saved, ...current]);
    setForm(null);
  }

  function handleDeleted(exerciseId) {
    setExercises((current) => current.filter((item) => item.id !== exerciseId));
    setDeleting(null);
    setOpened(null);
  }

  return <section className="my-exercises" aria-label="Мои упражнения" ref={panelRef}>
    {form
      ? <CustomExerciseForm key={form.exercise?.id ?? 'new'} exercise={form.exercise} onCancel={() => setForm(null)} onSaved={handleSaved} />
      : <>
        {!loading && !error && <div className="training-toolbar-row compact-training-toolbar my-programs-create-row">
          <button className="training-create-compact" type="button" onClick={() => setForm({ exercise: null })}><PlusIcon /><span>Создать</span></button>
        </div>}
        {loading && <div className="my-programs-state"><div className="exercise-list-spinner" /><span>Загружаем ваши упражнения…</span></div>}
        {!loading && error && <div className="my-programs-state error"><span>{error}</span><button type="button" onClick={() => setReloadKey((value) => value + 1)}>Повторить</button></div>}
        {!loading && !error && exercises.length === 0 && <div className="training-empty-programs">
          <div className="training-empty-mark" aria-hidden="true">—</div>
          <strong>Пока пусто</strong>
          <span>Здесь появятся упражнения, которые вы создадите сами.</span>
        </div>}
        {!loading && !error && exercises.length > 0 && <div className="exercise-library-section"><div className="exercise-library-section-list">
          {exercises.map((exercise) => <div className="exercise-library-row-wrap" key={exercise.id}>
            <button className="exercise-library-row" type="button" onClick={() => setOpened(exercise)}>
              {exercise.resolvedPhotoUrl && <span className="exercise-library-row-photo"><img src={exercise.resolvedPhotoUrl} alt="" loading="lazy" /></span>}
              <span className="exercise-library-row-copy"><strong>{exercise.name}</strong><small>{[exercise.display_muscle_group || exercise.muscle_group, exercise.equipment].filter(Boolean).join(' · ')}</small></span>
              <span className="exercise-library-row-chevron">›</span>
            </button>
          </div>)}
        </div></div>}
      </>}
    {opened && <ExerciseInfoModal exercise={opened} onClose={() => setOpened(null)} onEdit={editExercise} onDelete={setDeleting} />}
    {deleting && <DeleteExerciseDialog exercise={deleting} onClose={() => setDeleting(null)} onDeleted={handleDeleted} />}
  </section>;
}
