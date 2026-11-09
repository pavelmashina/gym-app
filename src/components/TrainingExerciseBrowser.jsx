import { useEffect, useMemo, useRef, useState } from 'react';
import {
  EXERCISE_EQUIPMENT,
  exerciseMuscleGroupFilterOptions,
  filterExerciseList,
  listExerciseLibrary,
  listMyExercises,
} from '../lib/exerciseLibrary.js';
import { CustomExerciseForm } from './CustomExerciseForm.jsx';
import { DeleteExerciseDialog } from './MyExercisesPanel.jsx';
import { ExercisePhotoGallery } from './ExercisePhotoGallery.jsx';
import ExerciseTechnique from './ExerciseTechnique.jsx';
import '../exercise-library-picker.css';
import '../training-exercise-browser.css';

function BackIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>;
}
function SearchIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>;
}
function PlusIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>;
}
function InfoIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 10v6M12 7.2v.2" /></svg>;
}
function isDirectVideo(url) {
  return /\.(mp4|webm|mov)(?:$|[?#])/i.test(String(url || ''))
    || String(url || '').includes('/storage/v1/object/sign/exercise-videos/');
}

function ExercisePage({ title, onBack, children, editor = false }) {
  const [touchStart, setTouchStart] = useState(null);
  useEffect(() => {
    const onKey = event => { if (event.key === 'Escape') onBack(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onBack]);
  return <div className={`training-exercise-page${editor ? ' training-exercise-editor-page' : ''}`}
    onTouchStart={event => {
      if (event.touches.length === 1 && event.touches[0].clientX < 38) {
        setTouchStart({ x: event.touches[0].clientX, y: event.touches[0].clientY });
      }
    }}
    onTouchEnd={event => {
      if (!touchStart || event.changedTouches.length !== 1) return;
      const dx = event.changedTouches[0].clientX - touchStart.x;
      const dy = event.changedTouches[0].clientY - touchStart.y;
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
  </div>;
}

const EXTRA_TECHNIQUE_KEYS = ['setup_instructions', 'execution_steps', 'technique_cues', 'common_mistakes', 'safety_notes'];

function ExerciseDescription({ exercise }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef(null);
  const description = exercise.short_description || exercise.description || exercise.technique || exercise.notes || 'Описание пока не добавлено.';
  const hasExtra = Boolean(
    exercise.family_name_ru || exercise.measurement_note
    || EXTRA_TECHNIQUE_KEYS.some(key => Array.isArray(exercise[key]) && exercise[key].length > 0)
  );

  useEffect(() => {
    if (expanded) return undefined;
    const element = textRef.current;
    if (!element) return undefined;
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [description, expanded]);

  return <section className="training-exercise-detail-description">
    <h2>Описание</h2>
    <p ref={textRef} className={expanded ? 'training-exercise-description-text' : 'training-exercise-description-text is-clamped'}>{description}</p>
    {expanded && hasExtra && <div className="training-exercise-extra-technique">
      <ExerciseTechnique exercise={exercise} />
    </div>}
    {(overflows || hasExtra) && <button className="training-exercise-description-toggle" type="button"
      aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Скрыть' : 'Подробнее'}</button>}
  </section>;
}

function ExerciseDetails({ exercise, onBack, onEdit, onDelete }) {
  const photos = exercise.resolvedPhotoUrls?.length ? exercise.resolvedPhotoUrls
    : exercise.resolvedPhotoUrl ? [exercise.resolvedPhotoUrl] : [];
  const video = exercise.resolvedVideoUrl || exercise.video_url || null;
  const animatedImage = /\.(gif|webp)(?:$|[?#])/i.test(String(video || ''));
  return <ExercisePage title="Информация" onBack={onBack}>
    <div className="training-exercise-detail-heading">
      <span>Упражнение</span>
      <h1>{exercise.name}</h1>
    </div>
    {photos.length > 0 && <ExercisePhotoGallery photos={photos} alt={exercise.name} />}
    <div className="training-exercise-detail-tags">
      <span>{exercise.display_muscle_group || exercise.muscle_group}</span>
      {exercise.equipment && <span>{exercise.equipment}</span>}
    </div>
    <div className={'training-exercise-detail-video' + (video ? '' : ' is-empty')}>
      {!video
        ? <div className="training-exercise-video-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg>
            <span>Видео пока нет</span>
          </div>
        : animatedImage ? <img src={video} alt={'Демонстрация упражнения ' + exercise.name} loading="lazy" />
        : isDirectVideo(video) ? <video controls playsInline preload="metadata" src={video} />
        : <a href={video} target="_blank" rel="noreferrer">Открыть видео упражнения</a>}
    </div>
    <ExerciseDescription key={exercise.id} exercise={exercise} />
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
  const visible = useMemo(() => filterExerciseList(source === 'base' ? base : mine, {
    query, muscleGroup, equipment,
  }), [source, base, mine, query, muscleGroup, equipment]);

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
    <div className="exercise-library-shell training-library-browser">
      <section className="exercise-library-top">
        <label className="exercise-library-search exercise-search training-search">
          <SearchIcon />
          <input type="search" value={query} onChange={event => setQuery(event.target.value)}
            placeholder="Найти упражнение" aria-label="Найти упражнение" />
          {query && <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}>×</button>}
        </label>
        <div className="training-exercise-tools-row">
          <label className="exercise-library-filter"><span>Группа мышц</span>
            <select value={muscleGroup} aria-label="Группа мышц" onChange={event => setMuscleGroup(event.target.value)}>
              {muscleGroups.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <label className="exercise-library-filter"><span>Оборудование</span>
            <select value={equipment} aria-label="Оборудование" onChange={event => setEquipment(event.target.value)}>
              {EXERCISE_EQUIPMENT.map(value => <option key={value}>{value}</option>)}
            </select>
          </label>
          <button className="training-create-compact training-exercise-create" type="button"
            onClick={create} aria-label="Создать своё упражнение"><PlusIcon /><span>Создать</span></button>
        </div>
      </section>
      <div className="training-exercise-source-switcher" role="tablist" aria-label="Источник упражнений">
        <button type="button" role="tab" aria-selected={source === 'base'} className={source === 'base' ? 'active' : ''}
          onClick={() => setSource('base')}>База</button>
        <button type="button" role="tab" aria-selected={source === 'mine'} className={source === 'mine' ? 'active' : ''}
          onClick={() => setSource('mine')}>Мои упражнения</button>
      </div>
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
                <small>{[exercise.display_muscle_group || exercise.muscle_group, exercise.equipment].filter(Boolean).join(' · ')}</small>
              </span>
            </button>
            <button className="exercise-library-row-info" type="button"
              aria-label={`Информация об упражнении ${exercise.name}`} onClick={() => openInfo(exercise)}><InfoIcon /></button>
          </div>) : <div className="exercise-library-empty">
            {source === 'mine' && !query && muscleGroup === 'Все' && equipment === 'Все'
              ? 'Пока нет своих упражнений. Нажмите «Создать», чтобы добавить первое.'
              : 'Упражнения не найдены'}
          </div>}
        </div>
      </div>}
    </div>
    {page === 'detail' && selected && <ExerciseDetails exercise={selected} onBack={() => setPage('list')}
      onEdit={edit} onDelete={setDeleting} />}
    {page === 'editor' && <ExercisePage editor title={selected ? 'Редактировать упражнение' : 'Создать упражнение'} onBack={closeEditor}>
      <CustomExerciseForm key={selected?.id ?? 'new'} exercise={selected} onCancel={closeEditor} onSaved={saved} />
    </ExercisePage>}
    {deleting && <DeleteExerciseDialog exercise={deleting} onClose={() => setDeleting(null)} onDeleted={deleted} />}
  </>;
}
