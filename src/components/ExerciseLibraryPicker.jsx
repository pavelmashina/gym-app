import { useEffect, useMemo, useState } from 'react';
import {
  EXERCISE_EQUIPMENT,
  EXERCISE_MUSCLE_GROUPS,
  filterExerciseList,
  listExerciseLibrary,
} from '../lib/exerciseLibrary.js';
import '../exercise-library-picker.css';
import { CustomExerciseForm } from './CustomExerciseForm.jsx';
import { ExerciseInfoModal } from './ExerciseInfoModal.jsx';

function SearchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>; }
function InfoIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7.2v.2"/></svg>; }
function ChevronIcon({ open = false }) { return <svg className={open ? 'open' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg>; }

function LibraryRow({ exercise, selected, onClick, onInfo, multi }) {
  return <div className={`exercise-library-row-wrap${selected ? ' selected' : ''}`}>
    <button className="exercise-library-row" type="button" onClick={onClick} aria-pressed={multi ? selected : undefined}>
      {multi && <span className="exercise-library-check">{selected ? '✓' : ''}</span>}
      {exercise.resolvedPhotoUrl && <span className="exercise-library-row-photo"><img src={exercise.resolvedPhotoUrl} alt="" loading="lazy" /></span>}
      <span className="exercise-library-row-copy"><strong>{exercise.name}</strong><small>{[exercise.display_muscle_group || exercise.muscle_group, exercise.equipment].filter(Boolean).join(' · ')}</small></span>
      {!multi && <span className="exercise-library-row-chevron">›</span>}
    </button>
    <button className="exercise-library-row-info" type="button" aria-label={`Информация об упражнении ${exercise.name}`} onClick={() => onInfo(exercise)}><InfoIcon /></button>
  </div>;
}

function LibrarySection({ title, items, selectedIds, multi, onPick, onInfo, hideHeading = false }) {
  const [open, setOpen] = useState(true);
  return <section className="exercise-library-section" aria-label={title}>
    {!hideHeading && <button className="exercise-library-section-head" type="button" onClick={() => setOpen((value) => !value)}>
      <span className="exercise-library-section-title"><strong>{title}</strong><small>{items.length}</small></span>
      <ChevronIcon open={open} />
    </button>}
    {(hideHeading || open) && <div className="exercise-library-section-list">{items.length ? items.map((exercise) => <LibraryRow key={exercise.id} exercise={exercise} selected={selectedIds.includes(exercise.id)} multi={multi} onClick={() => onPick(exercise)} onInfo={onInfo} />) : <div className="exercise-library-empty">Пока здесь ничего нет</div>}</div>}
  </section>;
}

export function ExerciseLibraryPicker({ selectedIds = [], multi = false, browseOnly = false, excludeId = null, onChange, onSelect, searchPlaceholder = 'Название упражнения' }) {
  const [library, setLibrary] = useState({ all: [], mine: [], recent: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [muscleGroup, setMuscleGroup] = useState('Все');
  const [equipment, setEquipment] = useState('Все');
  const [formOpen, setFormOpen] = useState(false);
  const [editingExercise, setEditingExercise] = useState(null);
  const [lastChoice, setLastChoice] = useState(null);
  const [infoExercise, setInfoExercise] = useState(null);

  function editExercise(exercise) {
    setEditingExercise(exercise);
    setInfoExercise(null);
    setFormOpen(true);
  }

  function reload() {
    setLoading(true);
    setError('');
    listExerciseLibrary({ includeLegacy: browseOnly }).then(setLibrary).catch((requestError) => setError(requestError?.message || 'Не удалось загрузить базу упражнений.')).finally(() => setLoading(false));
  }

  useEffect(reload, [browseOnly]);

  const filterConfig = useMemo(() => ({ query, muscleGroup, equipment }), [query, muscleGroup, equipment]);
  const visible = useMemo(() => {
    const filter = (items) => filterExerciseList(items, filterConfig).filter((exercise) => exercise.id !== excludeId);
    return { recent: filter(library.recent).slice(0, 5), mine: filter(library.mine), all: filter(library.all) };
  }, [library, filterConfig, excludeId]);

  function pick(exercise) {
    if (browseOnly) { setInfoExercise(exercise); return; }
    if (multi) {
      const next = selectedIds.includes(exercise.id) ? selectedIds.filter((id) => id !== exercise.id) : [...selectedIds, exercise.id];
      onChange?.(next, library.all.some(item=>item.id===exercise.id)?library.all:[...library.all,exercise]);
    } else onSelect?.(exercise);
  }

  function closeForm() {
    setFormOpen(false);
    setEditingExercise(null);
  }

  async function handleSaved(saved) {
    if (editingExercise) {
      setLibrary(current=>Object.fromEntries(Object.entries(current).map(([key,items])=>[key,items.map(item=>item.id===saved.id?saved:item)])));
      closeForm();
      return;
    }
    setLibrary((current) => ({ all: [...current.all, saved].sort((a, b) => a.name.localeCompare(b.name, 'ru')), mine: [saved, ...current.mine], recent: current.recent }));
    setLastChoice({ muscleGroup: saved.muscle_group, equipment: saved.equipment });
    closeForm();
    await pick(saved);
  }

  return <div className="exercise-library-shell">
    <section className="exercise-library-top">
      {!browseOnly && <div className="exercise-library-heading"><span>База упражнений</span><h2>Выберите упражнение</h2></div>}
      <label className={`exercise-library-search${browseOnly ? ' exercise-search training-search' : ''}`}><SearchIcon /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} />{query && <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}>×</button>}</label>
      <div className="exercise-library-filter-row">
        <label className="exercise-library-filter"><span>Группа мышц</span><select value={muscleGroup} onChange={(event) => setMuscleGroup(event.target.value)}>{EXERCISE_MUSCLE_GROUPS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="exercise-library-filter"><span>Оборудование</span><select value={equipment} onChange={(event) => setEquipment(event.target.value)}>{EXERCISE_EQUIPMENT.map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
    </section>

    <button className={`exercise-library-create${formOpen ? ' active' : ''}`} type="button" onClick={() => {setEditingExercise(null);setFormOpen((value) => !value);}}>
      <span className="exercise-library-create-icon"><PlusIcon /></span>
      <span className="exercise-library-create-copy"><strong>Создать своё упражнение</strong><small>Добавьте упражнение, которого нет в общей базе</small></span>
      <span className="exercise-library-create-arrow">›</span>
    </button>

    {formOpen && <CustomExerciseForm key={editingExercise?.id ?? 'new'} exercise={editingExercise} initialChoice={lastChoice} onCancel={closeForm} onSaved={handleSaved} />}

    {loading && <div className="exercise-library-state"><div className="exercise-list-spinner" aria-hidden="true" /><span>Загружаем упражнения…</span></div>}
    {!loading && error && <div className="exercise-library-state error"><span>{error}</span><button type="button" onClick={reload}>Повторить</button></div>}
    {!loading && !error && <div className="exercise-library-sections">
      {!browseOnly && <LibrarySection title="Недавние упражнения" items={visible.recent} selectedIds={selectedIds} multi={multi} onPick={pick} onInfo={setInfoExercise} />}
      {!browseOnly && <LibrarySection title="Мои упражнения" items={visible.mine} selectedIds={selectedIds} multi={multi} onPick={pick} onInfo={setInfoExercise} />}
      <LibrarySection title="Все упражнения" items={visible.all} selectedIds={selectedIds} multi={multi} hideHeading={browseOnly} onPick={pick} onInfo={setInfoExercise} />
    </div>}
    {infoExercise && <ExerciseInfoModal exercise={infoExercise} onClose={() => setInfoExercise(null)} onEdit={editExercise} />}
  </div>;
}
