import { useEffect, useMemo, useState } from 'react';
import {
  EXERCISE_EQUIPMENT,
  EXERCISE_MUSCLE_GROUPS,
  createCustomExercise,
  filterExerciseList,
  listExerciseLibrary,
  markExerciseRecent,
} from '../lib/exerciseLibrary.js';
import '../exercise-library-picker.css';

function SearchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>; }
function InfoIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 10v6M12 7.2v.2"/></svg>; }
function ChevronIcon({ open = false }) { return <svg className={open ? 'open' : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m8 10 4 4 4-4" /></svg>; }

function isDirectVideo(url) {
  return /\.(mp4|webm|mov)(?:$|[?#])/i.test(String(url || '')) || String(url || '').includes('/storage/v1/object/sign/exercise-videos/');
}

function ExerciseInfoModal({ exercise, onClose }) {
  const video = exercise.resolvedVideoUrl || exercise.video_url || null;
  const description = exercise.description || exercise.technique || exercise.notes || '';
  return <div className="exercise-library-info-shell" role="dialog" aria-modal="true" aria-label={`Информация: ${exercise.name}`}>
    <button className="exercise-library-info-scrim" type="button" aria-label="Закрыть" onClick={onClose} />
    <section className="exercise-library-info-card">
      <header><div><span>Упражнение</span><h3>{exercise.name}</h3></div><button type="button" onClick={onClose}>×</button></header>
      {video && <div className="exercise-library-info-video">
        {isDirectVideo(video) ? <video controls playsInline preload="metadata" src={video} /> : <a href={video} target="_blank" rel="noreferrer"><span>▶</span><strong>Открыть видео</strong><small>Видео откроется в новой вкладке</small></a>}
      </div>}
      <div className="exercise-library-info-tags"><span>{exercise.display_muscle_group || exercise.muscle_group}</span>{exercise.equipment && <span>{exercise.equipment}</span>}{exercise.isMine && <span>Моё упражнение</span>}</div>
      <section className="exercise-library-info-description"><span>Описание</span>{description ? <p>{description}</p> : <div>Описание пока не добавлено.</div>}</section>
    </section>
  </div>;
}

function LibraryRow({ exercise, selected, onClick, onInfo, multi }) {
  return <div className={`exercise-library-row-wrap${selected ? ' selected' : ''}`}>
    <button className="exercise-library-row" type="button" onClick={onClick} aria-pressed={multi ? selected : undefined}>
      {multi && <span className="exercise-library-check">{selected ? '✓' : ''}</span>}
      <span className="exercise-library-row-copy"><strong>{exercise.name}</strong><small>{[exercise.display_muscle_group || exercise.muscle_group, exercise.equipment].filter(Boolean).join(' · ')}</small></span>
      {!multi && <span className="exercise-library-row-chevron">›</span>}
    </button>
    <button className="exercise-library-row-info" type="button" aria-label={`Информация об упражнении ${exercise.name}`} onClick={() => onInfo(exercise)}><InfoIcon /></button>
  </div>;
}

function LibrarySection({ title, items, selectedIds, multi, onPick, onInfo }) {
  const [open, setOpen] = useState(true);
  return <section className="exercise-library-section">
    <button className="exercise-library-section-head" type="button" onClick={() => setOpen((value) => !value)}>
      <span className="exercise-library-section-title"><strong>{title}</strong><small>{items.length}</small></span>
      <ChevronIcon open={open} />
    </button>
    {open && <div className="exercise-library-section-list">{items.length ? items.map((exercise) => <LibraryRow key={exercise.id} exercise={exercise} selected={selectedIds.includes(exercise.id)} multi={multi} onClick={() => onPick(exercise)} onInfo={onInfo} />) : <div className="exercise-library-empty">Пока здесь ничего нет</div>}</div>}
  </section>;
}

const EMPTY_DRAFT = { name: '', muscleGroup: 'Грудь', equipment: 'Гантели', description: '', videoUrl: '', videoFile: null };

export function ExerciseLibraryPicker({ selectedIds = [], multi = false, excludeId = null, onChange, onSelect, searchPlaceholder = 'Название упражнения' }) {
  const [library, setLibrary] = useState({ all: [], mine: [], recent: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [muscleGroup, setMuscleGroup] = useState('Все');
  const [equipment, setEquipment] = useState('Все');
  const [createOpen, setCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');
  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [infoExercise, setInfoExercise] = useState(null);

  function reload() {
    setLoading(true);
    setError('');
    listExerciseLibrary().then(setLibrary).catch((requestError) => setError(requestError?.message || 'Не удалось загрузить базу упражнений.')).finally(() => setLoading(false));
  }

  useEffect(reload, []);

  const filterConfig = useMemo(() => ({ query, muscleGroup, equipment }), [query, muscleGroup, equipment]);
  const visible = useMemo(() => {
    const filter = (items) => filterExerciseList(items, filterConfig).filter((exercise) => exercise.id !== excludeId);
    return { recent: filter(library.recent).slice(0, 10), mine: filter(library.mine), all: filter(library.all) };
  }, [library, filterConfig, excludeId]);

  async function pick(exercise) {
    await markExerciseRecent(exercise.id);
    setLibrary((current) => ({ ...current, recent: [exercise, ...current.recent.filter((item) => item.id !== exercise.id)].slice(0, 10) }));
    if (multi) {
      const next = selectedIds.includes(exercise.id) ? selectedIds.filter((id) => id !== exercise.id) : [...selectedIds, exercise.id];
      onChange?.(next, library.all);
    } else onSelect?.(exercise);
  }

  async function createExercise(event) {
    event.preventDefault();
    setCreating(true);
    setCreateError('');
    try {
      const created = await createCustomExercise(draft);
      setLibrary((current) => ({ all: [...current.all, created].sort((a, b) => a.name.localeCompare(b.name, 'ru')), mine: [created, ...current.mine], recent: current.recent }));
      setDraft({ ...EMPTY_DRAFT, muscleGroup: draft.muscleGroup, equipment: draft.equipment });
      setCreateOpen(false);
      await pick(created);
    } catch (requestError) {
      setCreateError(requestError?.message || 'Не удалось создать упражнение.');
    } finally {
      setCreating(false);
    }
  }

  return <div className="exercise-library-shell">
    <section className="exercise-library-top">
      <div className="exercise-library-heading"><span>База упражнений</span><h2>Выберите упражнение</h2></div>
      <label className="exercise-library-search"><SearchIcon /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder={searchPlaceholder} />{query && <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}>×</button>}</label>
      <div className="exercise-library-filter-row">
        <label className="exercise-library-filter"><span>Группа мышц</span><select value={muscleGroup} onChange={(event) => setMuscleGroup(event.target.value)}>{EXERCISE_MUSCLE_GROUPS.map((value) => <option key={value}>{value}</option>)}</select></label>
        <label className="exercise-library-filter"><span>Оборудование</span><select value={equipment} onChange={(event) => setEquipment(event.target.value)}>{EXERCISE_EQUIPMENT.map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
    </section>

    <button className={`exercise-library-create${createOpen ? ' active' : ''}`} type="button" onClick={() => setCreateOpen((value) => !value)}>
      <span className="exercise-library-create-icon"><PlusIcon /></span>
      <span className="exercise-library-create-copy"><strong>Создать своё упражнение</strong><small>Добавьте упражнение, которого нет в общей базе</small></span>
      <span className="exercise-library-create-arrow">›</span>
    </button>

    {createOpen && <form className="exercise-library-create-form" onSubmit={createExercise}>
      <div className="exercise-library-create-form-head"><span>Мои упражнения</span><h3>Новое упражнение</h3></div>
      <label><span>Название</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={100} placeholder="Например, жим гантелей сидя" autoFocus /></label>
      <div className="exercise-library-create-form-grid">
        <label><span>Группа мышц</span><select value={draft.muscleGroup} onChange={(event) => setDraft({ ...draft, muscleGroup: event.target.value })}>{EXERCISE_MUSCLE_GROUPS.filter((value) => value !== 'Все').map((value) => <option key={value}>{value}</option>)}</select></label>
        <label><span>Оборудование</span><select value={draft.equipment} onChange={(event) => setDraft({ ...draft, equipment: event.target.value })}>{EXERCISE_EQUIPMENT.filter((value) => value !== 'Все').map((value) => <option key={value}>{value}</option>)}</select></label>
      </div>
      <label><span>Описание</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={2000} rows="4" placeholder="Техника, положение тела, важные подсказки…" /></label>
      <div className="exercise-library-video-fields">
        <label><span>Ссылка на видео</span><input type="url" value={draft.videoUrl} disabled={Boolean(draft.videoFile)} onChange={(event) => setDraft({ ...draft, videoUrl: event.target.value })} placeholder="https://youtube.com/…" /></label>
        <div className="exercise-library-video-divider"><span>или</span></div>
        <label className="exercise-library-video-upload"><span>Загрузить видео</span><input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={Boolean(draft.videoUrl.trim())} onChange={(event) => setDraft({ ...draft, videoFile: event.target.files?.[0] || null })} /><strong>{draft.videoFile ? draft.videoFile.name : 'MP4, WEBM или MOV · до 100 МБ'}</strong></label>
      </div>
      {createError && <div className="exercise-library-error">{createError}</div>}
      <div className="exercise-library-create-actions"><button type="button" onClick={() => setCreateOpen(false)}>Отмена</button><button className="primary" type="submit" disabled={creating}>{creating ? 'Сохраняем…' : 'Создать'}</button></div>
    </form>}

    {loading && <div className="exercise-library-state"><div className="exercise-list-spinner" aria-hidden="true" /><span>Загружаем упражнения…</span></div>}
    {!loading && error && <div className="exercise-library-state error"><span>{error}</span><button type="button" onClick={reload}>Повторить</button></div>}
    {!loading && !error && <div className="exercise-library-sections">
      <LibrarySection title="Недавние упражнения" items={visible.recent} selectedIds={selectedIds} multi={multi} onPick={pick} onInfo={setInfoExercise} />
      <LibrarySection title="Мои упражнения" items={visible.mine} selectedIds={selectedIds} multi={multi} onPick={pick} onInfo={setInfoExercise} />
      <LibrarySection title="Все упражнения" items={visible.all} selectedIds={selectedIds} multi={multi} onPick={pick} onInfo={setInfoExercise} />
    </div>}
    {infoExercise && <ExerciseInfoModal exercise={infoExercise} onClose={() => setInfoExercise(null)} />}
  </div>;
}
