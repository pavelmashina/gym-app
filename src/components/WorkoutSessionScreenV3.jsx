import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  abandonWorkout,
  addPerformedSet,
  completeWorkout,
  deletePerformedSet,
  getExerciseHistorySummary,
  getWorkoutEntry,
  listWorkoutExerciseCatalog,
  loadWorkoutSession,
  replaceSessionExercise,
  startWorkout,
  updateExerciseNote,
  updatePerformedSet,
} from '../lib/workoutSessions.js';
import { getExerciseDetails, reorderSessionExercises } from '../lib/workoutSessionExperience.js';
import '../workout-session.css';
import '../workout-session-active-v2.css';
import '../workout-session-active-v3.css';

const KG_PER_LB = 0.45359237;
const WEIGHT_UNIT_STORAGE_KEY = 'gym-exercise-weight-units-v2';
const REST_SECONDS_STORAGE_KEY = 'gym-exercise-rest-seconds-v1';
const DEFAULT_REST_SECONDS = 90;
const REST_PRESETS = [30, 60, 90, 120];

function formatDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(`${value}T12:00:00`));
}
function formatHistoryDate(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
}
function formatTime(seconds) {
  const safe = Math.max(0, Math.floor(seconds || 0));
  return [Math.floor(safe / 3600), Math.floor((safe % 3600) / 60), safe % 60].map((v) => String(v).padStart(2, '0')).join(':');
}
function formatRest(seconds) {
  const safe = Math.max(0, Math.ceil(seconds || 0));
  return `${String(Math.floor(safe / 60)).padStart(2, '0')}:${String(safe % 60).padStart(2, '0')}`;
}
function plannedSetLabel(set) { return set.plannedReps ? `${set.plannedReps} повт.` : 'Повторы не заданы'; }
function toDisplayWeight(weightKg, unit) {
  if (weightKg === '' || weightKg === null || weightKg === undefined) return '';
  const value = Number(weightKg);
  if (!Number.isFinite(value)) return '';
  return String(Math.round((unit === 'lb' ? value / KG_PER_LB : value) * 100) / 100);
}
function fromDisplayWeight(value, unit) {
  if (value === '') return '';
  const parsed = Number(String(value).replace(',', '.'));
  if (!Number.isFinite(parsed)) return '';
  return String(Math.round((unit === 'lb' ? parsed * KG_PER_LB : parsed) * 100) / 100);
}
function formatWeight(weightKg, unit = 'kg') {
  const display = toDisplayWeight(weightKg, unit);
  return display === '' ? '—' : `${display} ${unit === 'lb' ? 'lb' : 'кг'}`;
}
function workingTonnage(sets) {
  return (sets ?? []).filter((set) => set.completed && set.setType === 'working')
    .reduce((sum, set) => sum + Number(set.weight || 0) * Number(set.reps || 0), 0);
}

function BackIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m15 5-7 7 7 7" /></svg>; }
function CheckIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m5 12 4 4L19 6" /></svg>; }
function TrashIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5" /></svg>; }
function InfoIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="9" /><path d="M12 10v6M12 7.2v.2" /></svg>; }
function ChevronIcon() { return <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m4 2 4 4-4 4" /></svg>; }
function MoreIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>; }
function GripIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="7" r="1.3"/><circle cx="16" cy="7" r="1.3"/><circle cx="8" cy="12" r="1.3"/><circle cx="16" cy="12" r="1.3"/><circle cx="8" cy="17" r="1.3"/><circle cx="16" cy="17" r="1.3"/></svg>; }

function readStoredObject(key) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}
function exerciseStorageKey(exercise) { return String(exercise.linkedExerciseId || exercise.exerciseId || exercise.id); }
function buildDisplaySets(sets) {
  let working = 0;
  let warmup = 0;
  return (sets ?? []).map((set) => set.setType === 'warmup'
    ? { ...set, displayLabel: `Р${++warmup}`, warmup: true }
    : { ...set, displayLabel: String(++working), warmup: false });
}

function PlannedWorkout({ workout, onStart, starting, error }) {
  return <><main className="workout-session-content"><section className="workout-session-hero"><span>{formatDate(workout.scheduledDate)}</span><h1>{workout.name}</h1><p>{workout.exercises.length} упражнений · тренировка ещё не начата</p></section><section className="workout-plan-list">{workout.exercises.map((exercise, index) => <article className="workout-plan-card" key={exercise.id}><div className="workout-plan-number">{index + 1}</div><div className="workout-plan-main"><span>{exercise.muscleGroup || 'Упражнение'}</span><h2>{exercise.name}</h2><div className="workout-plan-sets">{exercise.sets.map((set) => <span key={set.id}>Подход {set.setNumber} · {plannedSetLabel(set)}</span>)}</div></div></article>)}</section>{error && <div className="workout-session-error">{error}</div>}</main><footer className="workout-session-footer"><button type="button" onClick={onStart} disabled={starting}>{starting ? 'Начинаем…' : 'Начать тренировку'}</button></footer></>;
}

function HistoryModal({ data, exerciseName, unit, onClose }) {
  let working = 0; let warmup = 0;
  return <div className="workout-modal-shell" role="dialog" aria-modal="true"><button className="workout-modal-scrim" type="button" aria-label="Закрыть" onClick={onClose} /><section className="workout-modal-card history-modal"><div className="workout-modal-head"><div><span>История упражнения</span><h3>{exerciseName}</h3></div><button type="button" onClick={onClose}>×</button></div>{data?.best && <div className="history-best-card"><span>Лучший подход</span><strong>{formatWeight(data.best.set.weight, unit)} × {data.best.set.reps}</strong><small>{formatHistoryDate(data.best.date)}</small></div>}<div className="history-section-title">Предыдущий результат</div>{!data?.previous ? <p className="history-empty">Это упражнение ещё не выполнялось в завершённой тренировке.</p> : <><div className="history-date">{formatHistoryDate(data.previous.date)}</div><div className="history-table"><div className="history-row head"><span>Подход</span><span>Вес</span><span>Повторы</span></div>{data.previous.sets.map((set) => { const label = set.setType === 'warmup' ? `Р${++warmup}` : String(++working); return <div className="history-row" key={set.id}><span className={set.setType === 'warmup' ? 'history-warmup-label' : ''}>{label}</span><strong>{formatWeight(set.weight, unit)}</strong><strong>{set.reps || '—'}</strong></div>; })}</div></>}</section></div>;
}

function ReplaceExerciseModal({ exercises, currentExerciseId, onSelect, onClose }) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => { const q = query.trim().toLowerCase(); return exercises.filter((e) => e.id !== currentExerciseId && (!q || e.name.toLowerCase().includes(q) || (e.muscle_group || '').toLowerCase().includes(q))).slice(0, 80); }, [currentExerciseId, exercises, query]);
  return <div className="workout-modal-shell" role="dialog" aria-modal="true"><button className="workout-modal-scrim" type="button" onClick={onClose} /><section className="workout-modal-card replace-modal"><div className="workout-modal-head"><div><span>Текущая тренировка</span><h3>Заменить упражнение</h3></div><button type="button" onClick={onClose}>×</button></div><input className="replace-exercise-search" type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Поиск упражнения" autoFocus /><div className="replace-exercise-list">{filtered.map((exercise) => <button key={exercise.id} type="button" onClick={() => onSelect(exercise)}><strong>{exercise.name}</strong><span>{exercise.muscle_group || 'Без группы'}</span></button>)}</div></section></div>;
}

function ExerciseActionsPopup({ exercise, unit, restSeconds, onUnitChange, onRestChange, onReplace, onReorder, onClose }) {
  return <div className="exercise-actions-shell" role="dialog" aria-modal="true"><button className="exercise-actions-scrim" type="button" onClick={onClose} /><section className="exercise-actions-popup"><div className="exercise-actions-heading"><div><span>Упражнение</span><strong>{exercise.name}</strong></div><button type="button" onClick={onClose}>×</button></div><button className="exercise-action-row" type="button" onClick={onReplace}><span>Заменить упражнение</span><ChevronIcon /></button><button className="exercise-action-row" type="button" onClick={onReorder}><span>Переместить упражнение</span><ChevronIcon /></button><div className="exercise-unit-row"><span>Единица измерения веса</span><div className="exercise-unit-toggle"><button className={unit === 'kg' ? 'active' : ''} type="button" onClick={() => onUnitChange('kg')}>кг</button><button className={unit === 'lb' ? 'active' : ''} type="button" onClick={() => onUnitChange('lb')}>lb</button></div></div><div className="exercise-rest-settings"><span>Отдых после подхода</span><div>{REST_PRESETS.map((seconds) => <button className={restSeconds === seconds ? 'active' : ''} type="button" key={seconds} onClick={() => onRestChange(seconds)}>{seconds < 60 ? `${seconds} с` : `${seconds / 60} мин`}</button>)}</div></div></section></div>;
}

function ExerciseInfoScreen({ exercise, details, loading, onClose }) {
  const technique = details?.technique?.trim() || exercise.prescription?.trim() || '';
  const notes = details?.notes?.trim() || '';
  return <div className="exercise-info-screen" role="dialog" aria-modal="true"><header><button type="button" onClick={onClose}><BackIcon /></button><strong>Упражнение</strong><span /></header><main><div className="exercise-info-video"><div className="exercise-video-placeholder"><span>▶</span><strong>Видео упражнения</strong><small>Видео пока не добавлено</small></div></div><section className="exercise-info-hero"><span>{details?.muscle_group || exercise.muscleGroup || 'Упражнение'}</span><h1>{details?.name || exercise.name}</h1></section>{loading ? <div className="exercise-info-loading">Загружаем описание…</div> : <><section className="exercise-info-meta"><div><span>Целевая мышца</span><strong>{details?.target_muscle || 'Нет данных'}</strong></div><div><span>Синергисты</span><strong>{details?.synergists || 'Нет данных'}</strong></div><div><span>Тип</span><strong>{details?.exercise_type || details?.movement_type || 'Нет данных'}</strong></div><div><span>Сложность</span><strong>{details?.difficulty ? `${details.difficulty}/5` : 'Нет данных'}</strong></div></section><section className="exercise-info-copy"><span>Техника выполнения</span>{technique ? <p>{technique}</p> : <div className="exercise-info-placeholder">Подробная техника выполнения для этого упражнения пока не добавлена.</div>}</section><section className="exercise-info-copy"><span>Описание и подсказки</span>{notes ? <p>{notes}</p> : <div className="exercise-info-placeholder">Дополнительное описание пока отсутствует.</div>}</section></>}</main></div>;
}

function ReorderExerciseScreen({ exercises, focusId, saving, onSave, onClose }) {
  const [draft, setDraft] = useState(() => [...exercises]);
  const [draggingId, setDraggingId] = useState(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setDraft([...exercises]), [exercises]);
  function moveOver(targetId) { if (!draggingId || draggingId === targetId) return; setDraft((current) => { const from = current.findIndex((x) => x.id === draggingId); const to = current.findIndex((x) => x.id === targetId); if (from < 0 || to < 0 || from === to) return current; const next = [...current]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; }); }
  function pointerMove(event) { if (!draggingId) return; const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-reorder-id]'); if (target?.dataset?.reorderId) moveOver(target.dataset.reorderId); }
  const changed = draft.some((item, i) => item.id !== exercises[i]?.id);
  return <div className="exercise-reorder-screen" role="dialog" aria-modal="true"><header><button type="button" onClick={onClose} disabled={saving}><BackIcon /></button><strong>Порядок упражнений</strong><span /></header><main><div className="exercise-reorder-intro"><span>Зажмите строку и перетащите</span><p>Новый порядок применится после подтверждения.</p></div><div className="exercise-reorder-list">{draft.map((exercise, index) => <div className={`exercise-reorder-row${draggingId === exercise.id ? ' dragging' : ''}${focusId === exercise.id ? ' focused' : ''}`} data-reorder-id={exercise.id} key={exercise.id} onPointerDown={(event) => { event.currentTarget.setPointerCapture?.(event.pointerId); setDraggingId(exercise.id); }} onPointerMove={pointerMove} onPointerUp={() => setDraggingId(null)} onPointerCancel={() => setDraggingId(null)}><span className="exercise-reorder-number">{index + 1}</span><strong>{exercise.name}</strong><span className="exercise-reorder-grip"><GripIcon /></span></div>)}</div></main><footer><button type="button" disabled={!changed || saving} onClick={() => setConfirming(true)}>{saving ? 'Сохраняем…' : 'Подтвердить порядок'}</button></footer>{confirming && <div className="reorder-scope-shell"><button className="exercise-actions-scrim" type="button" onClick={() => !saving && setConfirming(false)} /><section className="reorder-scope-card"><span>Где изменить порядок?</span><h3>Применить новый порядок упражнений</h3><p>История завершённых тренировок не изменится.</p><button className="primary" type="button" disabled={saving} onClick={() => onSave(draft.map((x) => x.id), 'session')}>Только в этой тренировке</button><button type="button" disabled={saving} onClick={() => onSave(draft.map((x) => x.id), 'program')}>Во всех таких же будущих тренировках программы</button><button className="cancel" type="button" disabled={saving} onClick={() => setConfirming(false)}>Отмена</button></section></div>}</div>;
}

function RestCountdown({ timer, now, onSkip, onAdd }) {
  if (!timer) return null;
  const remaining = Math.max(0, Math.ceil((timer.endsAt - now) / 1000));
  const progress = timer.duration > 0 ? Math.max(0, Math.min(1, remaining / timer.duration)) : 0;
  return <section className={`rest-countdown${remaining === 0 ? ' finished' : ''}`} aria-live="polite"><div className="rest-countdown-copy"><span>{remaining === 0 ? 'Отдых закончен' : `Отдых · ${timer.exerciseName}`}</span><strong>{formatRest(remaining)}</strong></div><div className="rest-countdown-track"><span style={{ transform: `scaleX(${progress})` }} /></div><div className="rest-countdown-actions"><button type="button" onClick={() => onAdd(30)}>+30 сек</button><button type="button" onClick={onSkip}>{remaining === 0 ? 'Закрыть' : 'Пропустить'}</button></div></section>;
}

function ExerciseNavigator({ index, exercises, onSelect }) {
  if (exercises.length < 2) return null;
  return <section className="exercise-navigator"><div><span>Упражнение</span><strong>{index + 1} из {exercises.length}</strong></div><div className="exercise-navigator-dots">{exercises.map((exercise, dot) => <button type="button" className={dot === index ? 'active' : ''} aria-label={`Перейти к упражнению ${dot + 1}`} key={exercise.id} onClick={() => onSelect(dot)} />)}</div><div className="exercise-navigator-buttons"><button type="button" disabled={index === 0} onClick={() => onSelect(index - 1)}>←</button><button type="button" disabled={index === exercises.length - 1} onClick={() => onSelect(index + 1)}>→</button></div></section>;
}

function ActiveWorkout({ entry, onEntryChange, onFinish, onAbandon, finishing, abandoning, error }) {
  const { workout, session } = entry;
  const [now, setNow] = useState(() => Date.now());
  const [savingSetId, setSavingSetId] = useState(null);
  const [localError, setLocalError] = useState('');
  const [history, setHistory] = useState(null);
  const [historyLoadingId, setHistoryLoadingId] = useState(null);
  const [replaceTarget, setReplaceTarget] = useState(null);
  const [catalog, setCatalog] = useState([]);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const [actionTarget, setActionTarget] = useState(null);
  const [reorderState, setReorderState] = useState(null);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [exerciseInfo, setExerciseInfo] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [weightUnits, setWeightUnits] = useState(() => readStoredObject(WEIGHT_UNIT_STORAGE_KEY));
  const [restSettings, setRestSettings] = useState(() => readStoredObject(REST_SECONDS_STORAGE_KEY));
  const [restTimer, setRestTimer] = useState(null);
  const [activeExerciseIndex, setActiveExerciseIndex] = useState(0);
  const notifiedTimerId = useRef(null);
  const cardRefs = useRef(new Map());

  useEffect(() => { const timer = window.setInterval(() => setNow(Date.now()), 500); return () => window.clearInterval(timer); }, []);
  const elapsed = useMemo(() => session.activeDurationSeconds + Math.max(0, Math.floor((now - new Date(session.startedAt).getTime()) / 1000)), [now, session.activeDurationSeconds, session.startedAt]);

  useEffect(() => {
    if (!restTimer || now < restTimer.endsAt || notifiedTimerId.current === restTimer.id) return;
    notifiedTimerId.current = restTimer.id;
    if (navigator.vibrate) navigator.vibrate([160, 80, 160]);
  }, [now, restTimer]);

  useEffect(() => {
    const nodes = workout.exercises.map((exercise) => cardRefs.current.get(exercise.id)).filter(Boolean);
    if (!nodes.length || !window.IntersectionObserver) return undefined;
    const observer = new IntersectionObserver((entries) => {
      const visible = entries.filter((item) => item.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (!visible) return;
      const index = Number(visible.target.dataset.exerciseIndex);
      if (Number.isInteger(index)) setActiveExerciseIndex(index);
    }, { threshold: [0.25, 0.5, 0.75], rootMargin: '-150px 0px -45% 0px' });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [workout.exercises]);

  function getUnit(exercise) { return weightUnits[exerciseStorageKey(exercise)] === 'lb' ? 'lb' : 'kg'; }
  function setUnit(exercise, unit) { const key = exerciseStorageKey(exercise); setWeightUnits((current) => { const next = { ...current, [key]: unit }; localStorage.setItem(WEIGHT_UNIT_STORAGE_KEY, JSON.stringify(next)); return next; }); }
  function getRestSeconds(exercise) { const value = Number(restSettings[exerciseStorageKey(exercise)]); return REST_PRESETS.includes(value) ? value : DEFAULT_REST_SECONDS; }
  function setRestSeconds(exercise, seconds) { const key = exerciseStorageKey(exercise); setRestSettings((current) => { const next = { ...current, [key]: seconds }; localStorage.setItem(REST_SECONDS_STORAGE_KEY, JSON.stringify(next)); return next; }); }
  function patchSet(exerciseId, setId, patch) { onEntryChange((current) => ({ ...current, workout: { ...current.workout, exercises: current.workout.exercises.map((exercise) => exercise.id !== exerciseId ? exercise : { ...exercise, sets: exercise.sets.map((set) => set.id === setId ? { ...set, ...patch } : set) }) } })); }
  async function saveSet(set) { setSavingSetId(set.id); setLocalError(''); try { await updatePerformedSet(set.id, set); } catch (e) { setLocalError(e.message); } finally { setSavingSetId(null); } }
  function startRest(exercise) { const duration = getRestSeconds(exercise); setRestTimer({ id: crypto.randomUUID(), exerciseId: exercise.id, exerciseName: exercise.name, duration, endsAt: Date.now() + duration * 1000 }); notifiedTimerId.current = null; }
  async function toggleComplete(exercise, set) { if (!set.completed && (!set.reps || Number(set.reps) <= 0)) { setLocalError('Укажите количество повторений перед завершением подхода.'); return; } const next = { ...set, completed: !set.completed }; patchSet(exercise.id, set.id, { completed: next.completed }); await saveSet(next); if (next.completed) startRest(exercise); }
  async function addSet(exercise, setType) { const nextNumber = Math.max(0, ...exercise.sets.map((set) => set.setNumber)) + 1; setLocalError(''); try { const created = await addPerformedSet(exercise.id, nextNumber, setType); onEntryChange((current) => ({ ...current, workout: { ...current.workout, exercises: current.workout.exercises.map((item) => item.id === exercise.id ? { ...item, sets: [...item.sets, created] } : item) } })); } catch (e) { setLocalError(e.message); } }
  async function removeSet(exercise, set) { setLocalError(''); try { await deletePerformedSet(set.id); onEntryChange((current) => ({ ...current, workout: { ...current.workout, exercises: current.workout.exercises.map((item) => item.id === exercise.id ? { ...item, sets: item.sets.filter((candidate) => candidate.id !== set.id) } : item) } })); } catch (e) { setLocalError(e.message); } }
  async function saveNote(exercise) { try { await updateExerciseNote(exercise.id, exercise.note ?? ''); } catch (e) { setLocalError(e.message); } }
  async function openHistory(exercise) { setHistoryLoadingId(exercise.id); setLocalError(''); try { setHistory({ exerciseName: exercise.name, unit: getUnit(exercise), data: await getExerciseHistorySummary(exercise.exerciseId, session.id) }); } catch (e) { setLocalError(e.message); } finally { setHistoryLoadingId(null); } }
  async function openReplacement(exercise) { setActionTarget(null); setReplaceTarget(exercise); if (catalog.length) return; setCatalogLoading(true); try { setCatalog(await listWorkoutExerciseCatalog()); } catch (e) { setLocalError(e.message); setReplaceTarget(null); } finally { setCatalogLoading(false); } }
  async function chooseReplacement(exercise) { if (!replaceTarget) return; try { await replaceSessionExercise(replaceTarget.id, exercise.id); setReplaceTarget(null); onEntryChange(await loadWorkoutSession(session.id)); } catch (e) { setLocalError(e.message); } }
  async function openInfo(exercise) { setExerciseInfo({ exercise, details: null }); setInfoLoading(true); try { setExerciseInfo({ exercise, details: await getExerciseDetails(exercise.linkedExerciseId) }); } catch (e) { setLocalError(e.message); } finally { setInfoLoading(false); } }
  async function saveReorder(ids, scope) { setReorderSaving(true); try { await reorderSessionExercises(session.id, ids, scope); onEntryChange(await loadWorkoutSession(session.id)); setReorderState(null); } catch (e) { setLocalError(e.message); } finally { setReorderSaving(false); } }
  function goToExercise(index) { const safe = Math.max(0, Math.min(workout.exercises.length - 1, index)); setActiveExerciseIndex(safe); cardRefs.current.get(workout.exercises[safe]?.id)?.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  function focusReps(setId) { document.querySelector(`[data-reps-set-id="${setId}"]`)?.focus(); }

  return <><main className="workout-session-content active v3"><section className="workout-active-head"><div><span>Тренировка идёт</span><h1>{workout.name}</h1></div><div className="workout-timer">{formatTime(elapsed)}</div></section><ExerciseNavigator index={activeExerciseIndex} exercises={workout.exercises} onSelect={goToExercise} /><section className="workout-execution-list">{workout.exercises.map((exercise, exerciseIndex) => { const unit = getUnit(exercise); const displaySets = buildDisplaySets(exercise.sets); return <Fragment key={exercise.id}>{restTimer?.exerciseId === exercise.id && <RestCountdown timer={restTimer} now={now} onSkip={() => setRestTimer(null)} onAdd={(seconds) => setRestTimer((current) => current ? { ...current, duration: current.duration + seconds, endsAt: current.endsAt + seconds * 1000 } : current)} />}<article className="workout-exercise-card v2 v3" data-exercise-index={exerciseIndex} ref={(node) => { if (node) cardRefs.current.set(exercise.id, node); else cardRefs.current.delete(exercise.id); }}><div className="workout-exercise-title-row v2"><button className="workout-exercise-title-button" type="button" onClick={() => openInfo(exercise)}><span>{exerciseIndex + 1} · {exercise.muscleGroup || 'Упражнение'}</span><span className="workout-exercise-name-link"><strong>{exercise.name}</strong><ChevronIcon /></span></button><button className="exercise-more-button" type="button" onClick={() => setActionTarget(exercise)}><MoreIcon /></button></div><div className="performed-set-head five-columns"><span>Подход</span><span>Вес</span><span>Повт.</span><span /><span /></div><div className="performed-set-list">{displaySets.map((set) => <div className={`performed-set-row five-columns${set.completed ? ' done' : ''}`} key={set.id}><span className={`set-number-label${set.warmup ? ' warmup' : ''}`}>{set.displayLabel}</span><input inputMode="decimal" enterKeyHint="next" placeholder={unit === 'lb' ? 'lb' : 'кг'} value={toDisplayWeight(set.weight, unit)} onFocus={(e) => e.currentTarget.select()} onChange={(e) => patchSet(exercise.id, set.id, { weight: fromDisplayWeight(e.target.value, unit) })} onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); focusReps(set.id); } }} onBlur={() => saveSet(set)} /><input data-reps-set-id={set.id} inputMode="numeric" enterKeyHint="done" placeholder={set.plannedReps ? String(set.plannedReps) : '—'} value={set.reps} onFocus={(e) => e.currentTarget.select()} onChange={(e) => patchSet(exercise.id, set.id, { reps: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }} onBlur={() => saveSet(set)} /><button className="set-complete-button" type="button" onClick={() => toggleComplete(exercise, set)} disabled={savingSetId === set.id}><CheckIcon /></button><button className="set-delete-button" type="button" onClick={() => removeSet(exercise, set)} disabled={savingSetId === set.id}><TrashIcon /></button></div>)}</div><div className="add-set-actions"><button className="add-set-button" type="button" onClick={() => addSet(exercise, 'working')}>+ Рабочий подход</button><button className="add-set-button warmup" type="button" onClick={() => addSet(exercise, 'warmup')}>+ Разминочный</button></div><button className="previous-result-button" type="button" onClick={() => openHistory(exercise)} disabled={historyLoadingId === exercise.id}><span className="previous-result-icon"><InfoIcon /></span><span>{historyLoadingId === exercise.id ? 'Загружаем…' : 'Предыдущий результат'}</span><ChevronIcon /></button><label className="exercise-note-field"><span>Заметка к упражнению</span><textarea rows="2" value={exercise.note ?? ''} placeholder="Техника, ощущения, подсказка на следующий раз…" onChange={(e) => onEntryChange((current) => ({ ...current, workout: { ...current.workout, exercises: current.workout.exercises.map((item) => item.id === exercise.id ? { ...item, note: e.target.value } : item) } }))} onBlur={() => saveNote(exercise)} /></label><div className="exercise-card-next"><span>{exerciseIndex + 1} из {workout.exercises.length}</span>{exerciseIndex < workout.exercises.length - 1 && <button type="button" onClick={() => goToExercise(exerciseIndex + 1)}>Следующее упражнение →</button>}</div></article></Fragment>; })}</section>{(error || localError) && <div className="workout-session-error">{error || localError}</div>}</main><footer className="workout-session-footer workout-session-footer-dual"><button className="workout-abandon-button" type="button" onClick={onAbandon} disabled={finishing || abandoning}>{abandoning ? 'Прерываем…' : 'Прервать тренировку'}</button><button type="button" onClick={onFinish} disabled={finishing || abandoning}>{finishing ? 'Завершаем…' : 'Завершить тренировку'}</button></footer>{actionTarget && <ExerciseActionsPopup exercise={actionTarget} unit={getUnit(actionTarget)} restSeconds={getRestSeconds(actionTarget)} onUnitChange={(unit) => setUnit(actionTarget, unit)} onRestChange={(seconds) => setRestSeconds(actionTarget, seconds)} onReplace={() => openReplacement(actionTarget)} onReorder={() => { setReorderState({ focusId: actionTarget.id }); setActionTarget(null); }} onClose={() => setActionTarget(null)} />}{history && <HistoryModal data={history.data} exerciseName={history.exerciseName} unit={history.unit} onClose={() => setHistory(null)} />}{replaceTarget && !catalogLoading && <ReplaceExerciseModal exercises={catalog} currentExerciseId={replaceTarget.linkedExerciseId} onSelect={chooseReplacement} onClose={() => setReplaceTarget(null)} />}{reorderState && <ReorderExerciseScreen exercises={workout.exercises} focusId={reorderState.focusId} saving={reorderSaving} onSave={saveReorder} onClose={() => !reorderSaving && setReorderState(null)} />}{exerciseInfo && <ExerciseInfoScreen exercise={exerciseInfo.exercise} details={exerciseInfo.details} loading={infoLoading} onClose={() => setExerciseInfo(null)} />}</>;
}

function CompletedWorkout({ entry, onDone }) {
  const completedSets = entry.workout.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.completed);
  const workingSets = completedSets.filter((set) => set.setType === 'working');
  const warmupSets = completedSets.filter((set) => set.setType === 'warmup');
  const tonnage = workingTonnage(completedSets);
  const completedExerciseCount = entry.workout.exercises.filter((exercise) => exercise.sets.some((set) => set.completed && set.setType === 'working')).length;
  return <><main className="workout-session-content completed workout-completed-expanded"><section className="workout-complete-hero"><div className="workout-complete-mark"><CheckIcon /></div><span>Тренировка завершена</span><h1>{entry.workout.name}</h1><p>{formatDate(entry.workout.scheduledDate)}</p></section><section className="workout-result-grid workout-result-grid-expanded"><div><span>Время</span><strong>{formatTime(entry.session.activeDurationSeconds)}</strong></div><div><span>Тоннаж</span><strong>{Math.round(tonnage).toLocaleString('ru-RU')} кг</strong></div><div><span>Упражнений</span><strong>{completedExerciseCount}/{entry.workout.exercises.length}</strong></div><div><span>Рабочих подходов</span><strong>{workingSets.length}</strong></div><div><span>Разминочных</span><strong>{warmupSets.length}</strong></div></section></main><footer className="workout-session-footer"><button type="button" onClick={onDone}>На главную</button></footer></>;
}
function AbandonedWorkout({ entry, onDone }) {
  const completedSets = entry.workout.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.completed);
  const workingSets = completedSets.filter((set) => set.setType === 'working');
  return <><main className="workout-session-content completed"><section className="workout-complete-hero abandoned"><div className="workout-abandoned-mark">×</div><span>Тренировка прервана</span><h1>{entry.workout.name}</h1><p>Она отмечена как пропущенная. Следующая тренировка программы останется в расписании.</p></section><section className="workout-result-grid"><div><span>Время до остановки</span><strong>{formatTime(entry.session.activeDurationSeconds)}</strong></div><div><span>Выполнено подходов</span><strong>{completedSets.length}</strong></div><div><span>Рабочих</span><strong>{workingSets.length}</strong></div><div><span>Статус</span><strong>Пропущена</strong></div></section><div className="workout-abandoned-note">Выполненные подходы сохранены внутри этой сессии, но не используются как завершённый результат для «Предыдущего результата» и личных рекордов.</div></main><footer className="workout-session-footer"><button type="button" onClick={onDone}>На главную</button></footer></>;
}

export function WorkoutSessionScreen({ scheduledWorkoutId, onBack, onCompleted }) {
  const [entry, setEntry] = useState(null); const [loading, setLoading] = useState(true); const [starting, setStarting] = useState(false); const [finishing, setFinishing] = useState(false); const [abandoning, setAbandoning] = useState(false); const [error, setError] = useState('');
  useEffect(() => { let active = true; setLoading(true); setError(''); getWorkoutEntry(scheduledWorkoutId).then((result) => { if (active) setEntry(result); }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [scheduledWorkoutId]);
  async function handleStart() { setStarting(true); setError(''); try { setEntry(await startWorkout(scheduledWorkoutId)); } catch (e) { setError(e.message); } finally { setStarting(false); } }
  async function handleFinish() { if (!entry?.session?.id) return; setFinishing(true); setError(''); try { setEntry(await completeWorkout(entry.session.id)); } catch (e) { setError(e.message); } finally { setFinishing(false); } }
  async function handleAbandon() { if (!entry?.session?.id || !window.confirm('Прервать тренировку? Она будет отмечена как пропущенная, а выполненные подходы не попадут в завершённую историю.')) return; setAbandoning(true); setError(''); try { setEntry(await abandonWorkout(entry.session.id)); } catch (e) { setError(e.message); } finally { setAbandoning(false); } }
  return <div className="phone workout-session-phone"><header className="workout-session-header"><button type="button" aria-label="Назад" onClick={onBack}><BackIcon /></button><strong>Тренировка</strong><span /></header>{loading && <div className="workout-session-loading">Загружаем тренировку…</div>}{!loading && !entry && <div className="workout-session-error standalone">{error || 'Тренировка не найдена.'}</div>}{!loading && entry?.mode === 'planned' && <PlannedWorkout workout={entry.workout} onStart={handleStart} starting={starting} error={error} />}{!loading && entry?.mode === 'active' && <ActiveWorkout entry={entry} onEntryChange={setEntry} onFinish={handleFinish} onAbandon={handleAbandon} finishing={finishing} abandoning={abandoning} error={error} />}{!loading && entry?.mode === 'completed' && <CompletedWorkout entry={entry} onDone={onCompleted} />}{!loading && entry?.mode === 'abandoned' && <AbandonedWorkout entry={entry} onDone={onCompleted} />}</div>;
}
