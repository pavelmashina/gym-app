import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  EXERCISE_EQUIPMENT,
  exerciseMuscleGroupFilterOptions,
  exerciseMovementFilterOptions,
  filterExerciseList,
  listExerciseLibrary,
  listMyExercises,
} from '../lib/exerciseLibrary.js';
import { CustomExerciseForm } from './CustomExerciseForm.jsx';
import { DeleteExerciseDialog } from './MyExercisesPanel.jsx';
import { ExerciseDetailsContent } from './ExerciseDetailsContent.jsx';
import { ExerciseMuscleTagLine } from './ExerciseMuscleTagLine.jsx';
import { appPoint } from '../lib/portraitLock.js';
import '../exercise-library-picker.css';
import '../training-exercise-browser.css';

function BackIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>;
}
function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
}
function FilterIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
}
function PlusIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}
function InfoIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 10v6M12 7.2v.2" /></svg>;
}
function ExercisePage({ title, onBack, children, editor = false }) {
  const [touchStart, setTouchStart] = useState(null);
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onBack(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack]);
  // A real top-level screen, not a fixed child of the scrollable .phone.
  // The portal escapes ancestor clipping, transforms and image stacking contexts.
  return createPortal(<div role="dialog" aria-modal="true" aria-label={title}
    className={`training-exercise-page${editor ? ' training-exercise-editor-page' : ''}`}
    onTouchStart={event => {
      const start = event.touches.length === 1 ? appPoint(event.touches[0]) : null;
      if (start && start.x < 38) setTouchStart(start);
    }}
    onTouchEnd={event => {
      if (!touchStart || event.changedTouches.length !== 1) return;
      const end = appPoint(event.changedTouches[0]);
      const dx = end.x - touchStart.x;
      const dy = end.y - touchStart.y;
      setTouchStart(null);
      if (dx > 90 && Math.abs(dy) < dx * 0.65) onBack();
    }}
    onTouchCancel={() => setTouchStart(null)}>
    <header className="training-exercise-page-header">
      <button type="button" aria-label="Назад к упражнениям" onClick={onBack}><BackIcon /></button>
      <strong>{title}</strong>
      <span aria-hidden="true" />
    </header>
    <main className="training-exercise-page-content">{children}</main>
  </div>, document.body);
}

function ExerciseDetails({ exercise, onBack, onEdit, onDelete }) {
  return <ExercisePage title="Информация" onBack={onBack}>
    <ExerciseDetailsContent exercise={exercise} />
    {exercise.isMine && <div className="training-exercise-detail-actions">
      <button type="button" onClick={() => onEdit(exercise)}>Редактировать упражнение</button>
      <button className="danger" type="button" onClick={() => onDelete(exercise)}>Удалить упражнение</button>
    </div>}
  </ExercisePage>;
}

/** The one Training → Exercises screen: shared catalog and saved own exercises. */
export function TrainingExerciseBrowser({ refreshKey = 0 }) {
  const [base, setBase] = useState([]);
  const [mine, setMine] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [source, setSource] = useState('base');
  const [query, setQuery] = useState('');
  const [muscleGroup, setMuscleGroup] = useState('Все');
  const [equipment, setEquipment] = useState('Все');
  const [movementType, setMovementType] = useState('Все');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [page, setPage] = useState('list');
  const [selected, setSelected] = useState(null);
  const [editOrigin, setEditOrigin] = useState('list');
  const [deleting, setDeleting] = useState(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([listExerciseLibrary({ includeLegacy: true }), listMyExercises()])
      .then(([library, own]) => {
        if (!active) return;
        setBase(library.all.filter(item => !item.isMine));
        setMine(own);
      })
      .catch(err => { if (active) setError(err?.message || 'Не удалось загрузить упражнения.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [refreshKey, reloadKey]);

  const muscleGroups = useMemo(() => {
    const options = exerciseMuscleGroupFilterOptions(mine);
    return options.includes(muscleGroup) ? options : [...options, muscleGroup];
  }, [mine, muscleGroup]);
  const sourceExercises = source === 'base' ? base : mine;
  const movementTypes = useMemo(() => exerciseMovementFilterOptions(sourceExercises), [sourceExercises]);
  const hasFilters = muscleGroup !== 'Все' || equipment !== 'Все' || movementType !== 'Все';
  const visible = useMemo(() => filterExerciseList(source === 'base' ? base : mine, {
    query, muscleGroup, equipment, movementType,
  }), [source, base, mine, query, muscleGroup, equipment, movementType]);

  function resetFilterChoices() { setMuscleGroup('Все'); setEquipment('Все'); setMovementType('Все'); }
  function clearFilters() { setQuery(''); resetFilterChoices(); }
  function changeSource(next) { setSource(next); clearFilters(); setFiltersOpen(false); }
  function openInfo(exercise) { setSelected(exercise); setPage('detail'); }
  function create() { setSelected(null); setEditOrigin('list'); setPage('editor'); }
  function edit(exercise) { setSelected(exercise); setEditOrigin('detail'); setPage('editor'); }
  function closeEditor() { setPage(editOrigin === 'detail' ? 'detail' : 'list'); }
  function saved(exercise) {
    setSelected(exercise);
    setMine(current => {
      const existing = current.some(item => item.id === exercise.id);
      return existing ? current.map(item => item.id === exercise.id ? exercise : item) : [exercise, ...current];
    });
    setSource('mine');
    setPage(editOrigin === 'detail' ? 'detail' : 'list');
    setReloadKey(value => value + 1);
  }
  function deleted(id) {
    setMine(current => current.filter(item => item.id !== id));
    setDeleting(null);
    setSelected(null);
    setSource('mine');
    setPage('list');
    setReloadKey(value => value + 1);
  }

  return <>
    <div className="exercise-library-shell training-library-browser" aria-hidden={page !== 'list'}>
      <section className="exercise-library-top">
        <label className="exercise-library-search exercise-search training-search">
          <SearchIcon />
          <input type="search" value={query} onChange={event => setQuery(event.target.value)}
            placeholder="Найти упражнение" aria-label="Найти упражнение" />
          {query && <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}>×</button>}
        </label>
        <div className="training-toolbar-row compact-training-toolbar training-exercise-tools-row">
          <div className="training-tools">
            <button type="button" className={filtersOpen || hasFilters ? 'active' : ''}
              title="Фильтры" aria-label="Фильтры" aria-expanded={filtersOpen}
              aria-controls="training-exercise-filter-panel"
              onClick={() => setFiltersOpen(value => !value)}><FilterIcon /></button>
          </div>
          <button className="training-create-compact training-exercise-create" type="button"
            onClick={create} aria-label="Создать своё упражнение"><PlusIcon /><span>Создать</span></button>
        </div>
        {filtersOpen && <section id="training-exercise-filter-panel" className="catalog-filters training-exercise-filter-panel"
          aria-label="Фильтры упражнений">
          <label className="training-exercise-filter-field">
            <span>Группа мышц</span>
            <select value={muscleGroup} onChange={event => setMuscleGroup(event.target.value)}>
              {muscleGroups.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="training-exercise-filter-field">
            <span>Оборудование</span>
            <select value={equipment} onChange={event => setEquipment(event.target.value)}>
              {EXERCISE_EQUIPMENT.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          <label className="training-exercise-filter-field">
            <span>Тип движения</span>
            <select value={movementType} onChange={event => setMovementType(event.target.value)}>
              {movementTypes.map(value => <option key={value} value={value}>{value}</option>)}
            </select>
          </label>
          {hasFilters && <button className="catalog-filters-reset" type="button"
            onClick={resetFilterChoices}>Сбросить фильтры</button>}
        </section>}
      </section>
      <div className="training-exercise-source-switcher" role="tablist" aria-label="Источник упражнений">
        <button type="button" role="tab" aria-selected={source === 'base'} className={source === 'base' ? 'active' : ''}
          onClick={() => changeSource('base')}>База</button>
        <button type="button" role="tab" aria-selected={source === 'mine'} className={source === 'mine' ? 'active' : ''}
          onClick={() => changeSource('mine')}>Мои упражнения</button>
      </div>
      {!loading && !error && <div className="training-exercise-count" aria-live="polite">
        <span>Показано {visible.length} из {sourceExercises.length} упражнений</span>
        {(query || hasFilters) &&
          <button type="button" onClick={clearFilters}>Сбросить фильтры</button>}
      </div>}
      {loading && <div className="exercise-library-state"><div className="exercise-list-spinner" aria-hidden="true" /><span>Загружаем упражнения…</span></div>}
      {!loading && error && <div className="exercise-library-state error" role="alert"><span>{error}</span>
        <button type="button" onClick={() => setReloadKey(value => value + 1)}>Повторить</button></div>}
      {!loading && !error && <div className="exercise-library-section">
        <div className="exercise-library-section-list">
          {visible.length ? visible.map(exercise => <div className="exercise-library-row-wrap" key={exercise.id}>
            <button className="exercise-library-row" type="button" onClick={() => openInfo(exercise)}>
              {exercise.resolvedPhotoUrl && <span className="exercise-library-row-photo"><img src={exercise.resolvedPhotoUrl} alt="" loading="lazy" /></span>}
              <span className="exercise-library-row-copy">
                <strong>{exercise.name}</strong>
                <ExerciseMuscleTagLine exercise={exercise} />
              </span>
            </button>
            <button className="exercise-library-row-info" type="button"
              aria-label={`Информация об упражнении ${exercise.name}`} onClick={() => openInfo(exercise)}><InfoIcon /></button>
          </div>) : <div className="exercise-library-empty">
            {source === 'mine' && !query && !hasFilters
              ? 'Пока нет своих упражнений. Нажмите «Создать», чтобы добавить первое.'
              : 'Упражнения не найдены'}
          </div>}
        </div>
      </div>}
    </div>
    {page === 'detail' && selected && <ExerciseDetails key={selected.id} exercise={selected} onBack={() => setPage('list')}
      onEdit={edit} onDelete={setDeleting} />}
    {page === 'editor' && <ExercisePage editor title={selected ? 'Редактировать упражнение' : 'Создать упражнение'} onBack={closeEditor}>
      <CustomExerciseForm key={selected?.id ?? 'new'} exercise={selected} hideIntro onCancel={closeEditor} onSaved={saved} />
    </ExercisePage>}
    {deleting && <DeleteExerciseDialog exercise={deleting} onClose={() => setDeleting(null)} onDeleted={deleted} />}
  </>;
}
