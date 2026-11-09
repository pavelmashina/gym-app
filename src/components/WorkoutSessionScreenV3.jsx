import ResultSetV2 from './ResultSetV2.jsx';
import ExerciseConfigurationEditor from './ExerciseConfigurationEditor.jsx';
import { configurationKey, parseConfigurationKey } from '../lib/exerciseConfiguration.js';
import { StandaloneExerciseEditor } from './StandaloneExerciseEditor.jsx';
import {assertResultsSaved,flushPendingSetEdits,registerSetFlusher} from '../lib/resultDraftGuard.js';
import {clearSetDraft,readSetDraft,writeSetDraft} from '../lib/setDraftJournal.js';
import { formatResultV2 } from '../lib/exerciseResultsV2.js';
import ExerciseTechnique from './ExerciseTechnique.jsx';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  addPerformedSet,
  completeWorkout,
  deletePerformedSet,
  deleteSessionExercise,
  finishActiveWorkout,
  getExerciseHistorySummary,
  getWorkoutEntry,
  getWorkoutSessionState,
  loadWorkoutSession,
  reorderPerformedSets,
  startWorkout,
  updateExerciseNote,
  updatePerformedSet,
} from '../lib/workoutSessions.js';
import { getExerciseDetails, reorderSessionExercises } from '../lib/workoutSessionExperience.js';
import { applySetOrder, isWarmupSet, labelSets, moveSet, orderSets, renumberSets, sameSetOrder } from '../lib/setOrder.js';
import '../workout-session.css';
import '../workout-session-active-v2.css';
import '../workout-session-active-v3.css';
import '../workout-exercise-card.css';
import '../workout-set-order.css';
import { CompletedWorkoutEditor } from './CompletedWorkoutEditor.jsx';
import { formatExerciseCount } from '../lib/formatRussianCount.js';
import {
  clearRestTimer,
  clockSkewMs,
  createRestTimer,
  extendRestTimer,
  msUntilNextSecond,
  readRestAutostart,
  readRestTimer,
  restRemainingSeconds,
  shouldAlertRestEnd,
  workoutElapsedSeconds,
  writeRestAutostart,
  writeRestTimer,
} from '../lib/workoutTimers.js';

const KG_PER_LB = 0.45359237;
const WEIGHT_UNIT_STORAGE_KEY = 'gym-exercise-weight-units-v2';
const REST_SECONDS_STORAGE_KEY = 'gym-exercise-rest-seconds-v1';
const EXECUTION_SETTINGS_STORAGE_PREFIX = 'gym-exercise-execution-settings-v1:';
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
function plannedSetLabel(set, prescription = '') {
  const source = String(prescription || '').trim();
  // A numeric target loses important context in “12 на каждую ногу” or mixed prescriptions.
  if (source && (/(?:кажд|ног|рук|сторон|поочерёд|поочеред|секунд|минут|отказ)/i.test(source) || !set.plannedReps)) return source;
  return set.plannedReps ? `${set.plannedReps} повт.` : 'Повторы не заданы';
}
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
function InfoIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M12 10v6M12 7.2v.2" /></svg>; }
// A clock turning back: the button opens past results, not information about the exercise.
function HistoryIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1L3.5 8.5" /><path d="M3.5 3.5v5h5" /><path d="M12 7.5V12l3 2" /></svg>; }
function ChevronIcon() { return <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m4 2 4 4-4 4" /></svg>; }
function MoreIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>; }
function GripIcon() { return <svg viewBox="0 0 24 24" fill="currentColor"><circle cx="8" cy="7" r="1.3"/><circle cx="16" cy="7" r="1.3"/><circle cx="8" cy="12" r="1.3"/><circle cx="16" cy="12" r="1.3"/><circle cx="8" cy="17" r="1.3"/><circle cx="16" cy="17" r="1.3"/></svg>; }

function readStoredObject(key) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch { return {}; }
}
function exerciseStorageKey(exercise) { return String(exercise.id); }
// Both kinds of set rows share one order: warm-ups on top, then working sets (src/lib/setOrder.js).
function buildDisplaySets(sets, draggedOrder) {
  return labelSets(draggedOrder ? applySetOrder(sets, draggedOrder) : orderSets(sets));
}
// Holding the set number this long picks the row up; a swipe that starts on the number moves nothing.
const SET_HOLD_MS = 250;
const SET_HOLD_SLOP_PX = 8;

function PlannedWorkout({ workout, onStart, starting, error }) {
  return <><main className="workout-session-content"><section className="workout-session-hero"><span>{formatDate(workout.scheduledDate)}</span><h1>{workout.name}</h1><p>{formatExerciseCount(workout.exercises.length)} · тренировка ещё не начата</p></section><section className="workout-plan-list">{workout.exercises.map((exercise, index) => <article className="workout-plan-card" key={exercise.id}><div className="workout-plan-number">{index + 1}</div><div className="workout-plan-main"><span>{exercise.muscleGroup || 'Упражнение'}</span><h2>{exercise.name}</h2><div className="workout-plan-sets">{exercise.sets.map((set) => <span key={set.id}>Подход {set.setNumber} · {plannedSetLabel(set, exercise.prescription)}</span>)}</div></div></article>)}</section>{error && <div className="workout-session-error">{error}</div>}</main><footer className="workout-session-footer"><button type="button" onClick={onStart} disabled={starting}>{starting ? 'Начинаем…' : 'Начать тренировку'}</button></footer></>;
}

function HistoryModal({ data, exerciseName, unit, onClose }) {
  let working = 0; let warmup = 0;
  return <div className="workout-modal-shell" role="dialog" aria-modal="true"><button className="workout-modal-scrim" type="button" aria-label="Закрыть" onClick={onClose} /><section className="workout-modal-card history-modal"><div className="workout-modal-head"><div><span>История упражнения</span><h3>{exerciseName}</h3></div><button type="button" onClick={onClose}>×</button></div>{data?.best && <div className="history-best-card"><span>Лучший подход</span><strong>{formatWeight(data.best.set.weight, unit)} × {data.best.set.reps}</strong><small>{formatHistoryDate(data.best.date)}</small></div>}<div className="history-section-title">Предыдущий результат</div>{!data?.previous ? <p className="history-empty">Это упражнение ещё не выполнялось в завершённой тренировке.</p> : <><div className="history-date">{formatHistoryDate(data.previous.date)}</div><div className="history-table"><div className="history-row head"><span>Подход</span><span>Вес</span><span>Повторы</span></div>{data.previous.sets.map((set) => { const label = set.setType === 'warmup' ? `Р${++warmup}` : String(++working); return <div className="history-row" key={set.id}><span className={set.setType === 'warmup' ? 'history-warmup-label' : ''}>{label}</span><strong>{set.resultV2 ? formatResultV2(set.resultV2) : formatWeight(set.weight, unit)}</strong><strong>{set.resultV2 ? '' : set.reps || '—'}</strong></div>; })}</div></>}</section></div>;
}

function ExerciseActionsPopup({ exercise, unit, restSeconds, onUnitChange, onRestChange, onReplace, onReorder, onDelete, onClose }) {
  return <div className="exercise-actions-shell" role="dialog" aria-modal="true"><button className="exercise-actions-scrim" type="button" onClick={onClose} /><section className="exercise-actions-popup"><div className="exercise-actions-heading"><div><span>Упражнение</span><strong>{exercise.name}</strong></div><button type="button" onClick={onClose}>×</button></div><button className="exercise-action-row" type="button" onClick={onReplace}><span>Заменить упражнение</span><ChevronIcon /></button><button className="exercise-action-row" type="button" onClick={onReorder}><span>Переместить упражнение</span><ChevronIcon /></button><button className="exercise-action-row danger" type="button" onClick={onDelete}><span>Удалить упражнение</span><ChevronIcon /></button><div className="exercise-unit-row"><span>Единица измерения веса</span><div className="exercise-unit-toggle"><button className={unit === 'kg' ? 'active' : ''} type="button" onClick={() => onUnitChange('kg')}>кг</button><button className={unit === 'lb' ? 'active' : ''} type="button" onClick={() => onUnitChange('lb')}>lb</button></div></div><div className="exercise-rest-settings"><span>Отдых после подхода</span><div>{REST_PRESETS.map((seconds) => <button className={restSeconds === seconds ? 'active' : ''} type="button" key={seconds} onClick={() => onRestChange(seconds)}>{seconds < 60 ? `${seconds} с` : `${seconds / 60} мин`}</button>)}</div></div></section></div>;
}

function toEmbedVideoUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'youtu.be') return `https://www.youtube.com/embed/${url.pathname.split('/').filter(Boolean)[0] || ''}`;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      if (url.pathname === '/watch') return url.searchParams.get('v') ? `https://www.youtube.com/embed/${url.searchParams.get('v')}` : null;
      const parts = url.pathname.split('/').filter(Boolean);
      if (parts[0] === 'shorts' || parts[0] === 'embed') return parts[1] ? `https://www.youtube.com/embed/${parts[1]}` : null;
    }
    if (host === 'vimeo.com') {
      const id = url.pathname.split('/').filter(Boolean)[0];
      return id ? `https://player.vimeo.com/video/${id}` : null;
    }
  } catch {
    return null;
  }
  return null;
}

function ExerciseInfoScreen({ exercise, details, loading, onClose }) {
  const technique = details?.technique?.trim() || exercise.prescription?.trim() || '';
  const notes = details?.description?.trim() || details?.notes?.trim() || '';
  const videoUrl = details?.resolvedVideoUrl?.trim() || '';
  const embedUrl = details?.video_path ? null : toEmbedVideoUrl(videoUrl);
  return <div className="exercise-info-screen" role="dialog" aria-modal="true"><header><button type="button" data-swipe-back aria-label="Назад" onClick={onClose}><BackIcon /></button><strong>Упражнение</strong><span /></header><main><div className="exercise-info-video">{videoUrl ? (details?.video_path ? <video controls playsInline preload="metadata" src={videoUrl}>Ваш браузер не поддерживает видео.</video> : embedUrl ? <iframe src={embedUrl} title={`Видео упражнения ${details?.name || exercise.name}`} loading="lazy" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen /> : <a className="exercise-video-link" href={videoUrl} target="_blank" rel="noreferrer"><span>▶</span><strong>Открыть видео упражнения</strong><small>Видео откроется в новой вкладке</small></a>) : <div className="exercise-video-placeholder"><span>▶</span><strong>Видео упражнения</strong><small>Видео пока не добавлено</small></div>}</div><section className="exercise-info-hero"><span>{details?.muscle_group || exercise.muscleGroup || 'Упражнение'}</span><h1>{details?.name || exercise.name}</h1></section>{loading ? <div className="exercise-info-loading">Загружаем описание…</div> : <><section className="exercise-info-meta"><div><span>Целевая мышца</span><strong>{details?.target_muscle || 'Нет данных'}</strong></div><div><span>Синергисты</span><strong>{details?.synergists || 'Нет данных'}</strong></div><div><span>Тип</span><strong>{details?.exercise_type || details?.movement_type || 'Нет данных'}</strong></div><div><span>Сложность</span><strong>{details?.difficulty ? `${details.difficulty}/3` : 'Нет данных'}</strong></div></section><section className="exercise-info-copy">{details?.execution_steps?.length ? <ExerciseTechnique exercise={details} /> : <><span>Техника выполнения</span>{technique ? <p>{technique}</p> : <div className="exercise-info-placeholder">Подробная техника выполнения для этого упражнения пока не добавлена.</div>}</>}</section><section className="exercise-info-copy"><span>Описание и подсказки</span>{notes ? <p>{notes}</p> : <div className="exercise-info-placeholder">Дополнительное описание пока отсутствует.</div>}</section></>}</main></div>;
}

function ReorderExerciseScreen({ exercises, standalone, focusId, saving, onSave, onClose }) {
  const [draft, setDraft] = useState(() => [...exercises]);
  const [draggingId, setDraggingId] = useState(null);
  const [confirming, setConfirming] = useState(false);
  useEffect(() => setDraft([...exercises]), [exercises]);
  useEffect(() => {
    if (!draggingId) return undefined;
    function moveOver(targetId) { if (draggingId === targetId) return; setDraft((current) => { const from = current.findIndex((x) => x.id === draggingId); const to = current.findIndex((x) => x.id === targetId); if (from < 0 || to < 0 || from === to) return current; const next = [...current]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; }); }
    function pointerMove(event) { const target = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-reorder-id]'); if (target?.dataset?.reorderId) moveOver(target.dataset.reorderId); }
    function stop() { setDraggingId(null); }
    // On the window: the dragged row moves in the DOM mid-gesture and the finger may leave the list.
    window.addEventListener('pointermove', pointerMove);
    window.addEventListener('pointerup', stop);
    window.addEventListener('pointercancel', stop);
    return () => {
      window.removeEventListener('pointermove', pointerMove);
      window.removeEventListener('pointerup', stop);
      window.removeEventListener('pointercancel', stop);
    };
  }, [draggingId]);
  const changed = draft.some((item, i) => item.id !== exercises[i]?.id);
  return <div className="exercise-reorder-screen" role="dialog" aria-modal="true"><header><button type="button" data-swipe-back aria-label="Назад" onClick={onClose} disabled={saving}><BackIcon /></button><strong>Порядок упражнений</strong><span /></header><main><div className="exercise-reorder-intro"><span>Перетащите за значок справа</span><p>Новый порядок применится после подтверждения.</p></div><div className="exercise-reorder-list">{draft.map((exercise, index) => <div className={`exercise-reorder-row${draggingId === exercise.id ? ' dragging' : ''}${focusId === exercise.id ? ' focused' : ''}`} data-reorder-id={exercise.id} key={exercise.id}><span className="exercise-reorder-number">{index + 1}</span><strong>{exercise.name}</strong><span className="exercise-reorder-grip" onPointerDown={() => setDraggingId(exercise.id)}><GripIcon /></span></div>)}</div></main><footer><button type="button" disabled={!changed || saving} onClick={() => setConfirming(true)}>{saving ? 'Сохраняем…' : 'Подтвердить порядок'}</button></footer>{confirming && <div className="reorder-scope-shell"><button className="exercise-actions-scrim" type="button" onClick={() => !saving && setConfirming(false)} /><section className="reorder-scope-card"><span>Где изменить порядок?</span><h3>Применить новый порядок упражнений</h3><p>История завершённых тренировок не изменится.</p><button className="primary" type="button" disabled={saving} onClick={() => onSave(draft.map((x) => x.id), 'session')}>Только в этой тренировке</button>{!standalone && <button type="button" disabled={saving} onClick={() => onSave(draft.map((x) => x.id), 'program')}>Во всех таких же будущих тренировках программы</button>}<button className="cancel" type="button" disabled={saving} onClick={() => setConfirming(false)}>Отмена</button></section></div>}</div>;
}

// Ticks stay in these leaf components: re-rendering the whole exercise list every
// second kept the main thread busy, and a touch scroll has to wait for it to start.
function useSecondTick(anchorMs) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    let timer;
    const tick = () => {
      window.clearTimeout(timer);
      const current = Date.now();
      setNow(current);
      // Aligned to the displayed second: a fixed interval drifts onto its boundary,
      // and the display then stalls for a second and skips the next one.
      timer = window.setTimeout(tick, msUntilNextSecond(current, anchorMs));
    };
    // A suspended page runs no timers, so show the real time as soon as it is back.
    const refresh = () => { if (document.visibilityState !== 'hidden') tick(); };
    tick();
    document.addEventListener('visibilitychange', refresh);
    window.addEventListener('pageshow', refresh);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('visibilitychange', refresh);
      window.removeEventListener('pageshow', refresh);
    };
  }, [anchorMs]);
  return now;
}

function WorkoutElapsedTime({ session }) {
  const startedAtMs = new Date(session.startedAt).getTime();
  // A phone clock behind the server would otherwise hold the display until it catches up.
  const skewMs = useMemo(() => clockSkewMs(startedAtMs, Date.now()), [startedAtMs]);
  const now = useSecondTick(startedAtMs - skewMs);
  return <div className="workout-timer" role="timer">{formatTime(workoutElapsedSeconds(session, now, skewMs))}</div>;
}

function RestCountdown({ timer, canTurnOff, onStop, onAdd, onTurnOff }) {
  const now = useSecondTick(timer.endsAt);
  const notifiedEndsAt = useRef(null);
  useEffect(() => {
    if (now < timer.endsAt || notifiedEndsAt.current === timer.endsAt) return;
    notifiedEndsAt.current = timer.endsAt;
    if (shouldAlertRestEnd(timer, now) && navigator.vibrate) navigator.vibrate([160, 80, 160]);
  }, [now, timer]);
  const remaining = restRemainingSeconds(timer, now);
  const progress = timer.duration > 0 ? Math.max(0, Math.min(1, remaining / timer.duration)) : 0;
  const title = remaining === 0 ? 'Отдых закончен' : `Отдых${timer.exerciseName ? ` · ${timer.exerciseName}` : ''}`;
  return <section className={`rest-countdown${remaining === 0 ? ' finished' : ''}`} aria-label="Таймер отдыха"><div className="rest-countdown-copy"><span aria-live="polite">{title}</span><strong role="timer">{formatRest(remaining)}</strong></div><div className="rest-countdown-track"><span style={{ transform: `scaleX(${progress})` }} /></div><div className="rest-countdown-actions"><button type="button" onClick={() => onAdd(30)}>+30 сек</button><button type="button" onClick={onStop}>{remaining === 0 ? 'Закрыть' : 'Остановить'}</button>{canTurnOff && <button type="button" onClick={onTurnOff}>Выключить</button>}</div></section>;
}

// Lives in the footer: visible wherever the list is scrolled, and its appearing does not move the cards under the finger.
function RestTimerDock({ timer, autostart, idleSeconds, onStart, onStop, onAdd, onAutostartChange }) {
  if (timer) return <RestCountdown key={timer.id} timer={timer} canTurnOff={autostart} onStop={onStop} onAdd={onAdd} onTurnOff={() => onAutostartChange(false)} />;
  return <section className="rest-timer-idle" aria-label="Таймер отдыха"><span>{autostart ? `Таймер отдыха · ${formatRest(idleSeconds)}` : 'Таймер отдыха выключен'}</span><div className="rest-timer-idle-actions"><button type="button" onClick={onStart}>Запустить</button><button type="button" onClick={() => onAutostartChange(!autostart)}>{autostart ? 'Выключить' : 'Включить'}</button></div></section>;
}

function LegacySetRow({ set, unit, saving, dragging, handleProps, onPersist, onToggle, onDelete }) {
  const [restored]=useState(()=>readSetDraft(set.id));
  const [weight,setWeight]=useState(()=>toDisplayWeight(restored?restored.weight:set.weight,unit));
  const [reps,setReps]=useState(()=>(restored?restored.reps:set.reps)??'');
  const draftRef=useRef(restored??{weight:set.weight,reps:set.reps});
  const dirtyRef=useRef(Boolean(restored));
  const inFlightRef=useRef(null);
  const timerRef=useRef(null);
  const setRef=useRef(set);
  setRef.current=set;
  // The row has no server id yet, so anything typed into it could not be saved.
  const creating=String(set.id).startsWith('temp:');

  useEffect(()=>{
    // Unsent input is newer than anything arriving through props.
    if(dirtyRef.current)return;
    setWeight(toDisplayWeight(set.weight,unit));
    setReps(set.reps??'');
    draftRef.current={weight:set.weight,reps:set.reps};
  },[set.id,set.weight,set.reps]);

  useEffect(()=>{setWeight(toDisplayWeight(draftRef.current.weight,unit));},[unit]);

  useEffect(()=>{
    const unregister=registerSetFlusher(set.id,()=>{clearTimer();return onPersistDraft();});
    if(dirtyRef.current)onPersistDraft().catch(()=>{});
    return ()=>{unregister();clearTimer();if(dirtyRef.current)onPersistDraft().catch(()=>{});};
  },[set.id]);

  function clearTimer(){
    if(timerRef.current){clearTimeout(timerRef.current);timerRef.current=null;}
  }
  function markSaved(snapshot){
    if(draftRef.current!==snapshot)return;
    dirtyRef.current=false;
    clearSetDraft(set.id);
  }
  function onPersistDraft(){
    if(!dirtyRef.current)return inFlightRef.current?.promise??Promise.resolve();
    const snapshot=draftRef.current;
    if(inFlightRef.current?.snapshot===snapshot)return inFlightRef.current.promise;
    const promise=onPersist({...setRef.current,...snapshot})
      .then(()=>markSaved(snapshot))
      .finally(()=>{if(inFlightRef.current?.snapshot===snapshot)inFlightRef.current=null;});
    inFlightRef.current={snapshot,promise};
    return promise;
  }
  function schedule(next){
    draftRef.current=next;
    dirtyRef.current=true;
    writeSetDraft(set.id,next);
    clearTimer();
    timerRef.current=setTimeout(()=>{timerRef.current=null;onPersistDraft().catch(()=>{});},450);
  }
  function flush(){
    clearTimer();
    onPersistDraft().catch(()=>{});
  }
  function toggle(){
    // A pending autosave carries the old "completed" value and would undo this tap.
    clearTimer();
    const snapshot=draftRef.current;
    onToggle({...setRef.current,...snapshot}).then((saved)=>{if(saved)markSaved(snapshot);else flush();});
  }
  function remove(){
    clearTimer();
    dirtyRef.current=false;
    clearSetDraft(set.id);
    onDelete();
  }
  function changeWeight(value){
    setWeight(value);
    schedule({weight:fromDisplayWeight(value,unit),reps:draftRef.current.reps});
  }
  function changeReps(value){
    setReps(value);
    schedule({weight:draftRef.current.weight,reps:value});
  }

  // The column head names the unit, so an empty weight shows a dash rather than repeating “кг”.
  return <div className={`exercise-set-row${set.completed?' done':''}${set.warmup?' warmup':''}${dragging?' dragging':''}`} data-set-id={set.id}>
    <span className="exercise-set-number" {...handleProps}>{set.displayLabel}</span>
    <input aria-label={`Вес, ${unit==='lb'?'lb':'кг'}`} inputMode="decimal" enterKeyHint="next" placeholder="—" value={weight} disabled={creating} onFocus={e=>e.currentTarget.select()} onChange={e=>changeWeight(e.target.value)} onBlur={flush}/>
    <input aria-label="Повторы" data-reps-set-id={set.id} inputMode="numeric" enterKeyHint="done" placeholder={set.plannedReps?String(set.plannedReps):'—'} value={reps} disabled={creating} onFocus={e=>e.currentTarget.select()} onChange={e=>changeReps(e.target.value)} onKeyDown={e=>{if(e.key==='Enter')e.currentTarget.blur();}} onBlur={flush}/>
    <button className="exercise-set-check" type="button" aria-label={set.completed?'Снять отметку':'Подход выполнен'} onClick={toggle} disabled={saving||creating}><CheckIcon /></button>
    <button className="exercise-set-delete" type="button" aria-label="Удалить подход" onClick={remove} disabled={saving||creating}><TrashIcon /></button>
  </div>;
}

function ActiveWorkout({ entry, onEntryChange, onFinish, onPauseRequest, onSessionPaused, onRequestReplacement, finishing, pausing, error }) {
  const { workout, session } = entry;
  const [savingSetId, setSavingSetId] = useState(null);
  const [localError, setLocalError] = useState('');
  const [history, setHistory] = useState(null);
  const [historyLoadingId, setHistoryLoadingId] = useState(null);
  const [actionTarget, setActionTarget] = useState(null);
  const [reorderState, setReorderState] = useState(null);
  const [reorderSaving, setReorderSaving] = useState(false);
  const [exerciseInfo, setExerciseInfo] = useState(null);
  const [infoLoading, setInfoLoading] = useState(false);
  const [weightUnits, setWeightUnits] = useState(() => readStoredObject(WEIGHT_UNIT_STORAGE_KEY));
  const [restSettings, setRestSettings] = useState(() => readStoredObject(REST_SECONDS_STORAGE_KEY));
  const executionSettingsStorageKey = `${EXECUTION_SETTINGS_STORAGE_PREFIX}${session.id}`;
  const [executionSettings, setExecutionSettings] = useState(() => {
    const stored = readStoredObject(executionSettingsStorageKey);
    return Object.fromEntries(workout.exercises.map((exercise) => {
      const saved = exercise.sets.find((set) => set.resultV2)?.resultV2;
      const persisted = stored[exercise.id];
      return [exercise.id, persisted || { configuration: parseConfigurationKey(saved?.configuration_key || 'standard'), equipmentInstanceId: saved?.equipment_instance_id || null }];
    }));
  });
  // The only rest timer there is: every start replaces it, and it outlives a remount or reload of this screen.
  const [restTimer, setRestTimer] = useState(() => readRestTimer(session.id, Date.now()));
  const [restAutostart, setRestAutostart] = useState(readRestAutostart);
  // Issue #60: a set row picked up by its number, with the order it is being dragged through.
  const [setDrag, setSetDrag] = useState(null);
  const setDragRef = useRef(null);
  const setHoldRef = useRef(null);
  const orderSavesRef = useRef(new Set());
  // Highest set number each exercise may still hold on the server, so a new set never takes a number
  // that a reorder in flight has not yet freed.
  const highestSetNumberRef = useRef(new Map());

  useEffect(() => {
    if (restTimer) writeRestTimer(restTimer); else clearRestTimer();
  }, [restTimer]);

  useEffect(() => () => setHoldRef.current?.(), []);

  useEffect(() => {
    if (!setDrag) return undefined;
    const { pointerId } = setDrag;
    function move(event) {
      const current = setDragRef.current;
      if (!current || event.pointerId !== pointerId) return;
      const targetId = document.elementFromPoint(event.clientX, event.clientY)?.closest?.('[data-set-id]')?.dataset.setId;
      const order = targetId ? moveSet(current.order, current.setId, targetId, current.warmupIds) : current.order;
      if (order === current.order) return;
      setDragRef.current = { ...current, order };
      setSetDrag(setDragRef.current);
    }
    function drop(event) {
      const current = setDragRef.current;
      if (!current || event.pointerId !== pointerId) return;
      setDragRef.current = null;
      setSetDrag(null);
      // When the system takes the gesture over, the sets go back where they were.
      if (event.type === 'pointerup') saveSetOrder(current.exerciseId, current.order, current.numbers);
    }
    // On the window: the dragged row moves in the DOM mid-gesture and the finger may leave the list.
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', drop);
    window.addEventListener('pointercancel', drop);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', drop);
      window.removeEventListener('pointercancel', drop);
    };
  }, [setDrag?.pointerId, setDrag?.exerciseId]);

  useEffect(() => {
    const flush = () => { flushPendingSetEdits().catch(() => {}); };
    // The session may have been finished while the app was away, e.g. by the 3-hour
    // auto-completion; finish and pause could never succeed from a stale active screen.
    // A pause or resume from elsewhere, or a pause whose response was lost, moves the clock too.
    const syncWithServer = () => {
      flush();
      if (document.visibilityState === 'hidden') return;
      getWorkoutSessionState(session.id)
        .then(async (state) => {
          if (!state) return;
          if (state.status !== 'active') { onEntryChange(await loadWorkoutSession(session.id)); return; }
          if (state.paused) { onSessionPaused?.(); return; }
          onEntryChange((current) => current.session.startedAt === state.startedAt && current.session.activeDurationSeconds === state.activeDurationSeconds
            ? current
            : { ...current, session: { ...current.session, startedAt: state.startedAt, activeDurationSeconds: state.activeDurationSeconds } });
        })
        .catch(() => {});
    };
    document.addEventListener('visibilitychange', syncWithServer);
    window.addEventListener('online', syncWithServer);
    window.addEventListener('pagehide', flush);
    return () => {
      document.removeEventListener('visibilitychange', syncWithServer);
      window.removeEventListener('online', syncWithServer);
      window.removeEventListener('pagehide', flush);
    };
  }, [session.id]);

  function getExecutionSettings(exercise) {
    return executionSettings[exercise.id] || { configuration: parseConfigurationKey('standard'), equipmentInstanceId: null };
  }
  function patchExecutionSettings(exercise, patch) {
    setExecutionSettings((current) => {
      const next = { ...current, [exercise.id]: { ...(current[exercise.id] || { configuration: parseConfigurationKey('standard'), equipmentInstanceId: null }), ...patch } };
      try { localStorage.setItem(executionSettingsStorageKey, JSON.stringify(next)); } catch {}
      return next;
    });
  }
  function getUnit(exercise) { return weightUnits[exerciseStorageKey(exercise)] === 'lb' ? 'lb' : 'kg'; }
  function setUnit(exercise, unit) { const key = exerciseStorageKey(exercise); setWeightUnits((current) => { const next = { ...current, [key]: unit }; localStorage.setItem(WEIGHT_UNIT_STORAGE_KEY, JSON.stringify(next)); return next; }); }
  function getRestSeconds(exercise) { const value = Number(restSettings[exerciseStorageKey(exercise)]); return REST_PRESETS.includes(value) ? value : DEFAULT_REST_SECONDS; }
  function setRestSeconds(exercise, seconds) { const key = exerciseStorageKey(exercise); setRestSettings((current) => { const next = { ...current, [key]: seconds }; localStorage.setItem(REST_SECONDS_STORAGE_KEY, JSON.stringify(next)); return next; }); }
  function patchSet(exerciseId, setId, patch) { onEntryChange((current) => ({ ...current, workout: { ...current.workout, exercises: current.workout.exercises.map((exercise) => exercise.id !== exerciseId ? exercise : { ...exercise, sets: exercise.sets.map((set) => set.id === setId ? { ...set, ...patch } : set) }) } })); }
  async function saveSet(set) {
    if(String(set.id).startsWith('temp:')) return;
    setLocalError('');
    try { await updatePerformedSet(set.id, set); } catch (e) { setLocalError(e.message); throw e; }
  }
  async function saveV2(exercise, set) {
    applySetToRest(exercise, set);
    try {
      // The stored number may predate a reorder that is still on its way; the order stays the screen's.
      const {setNumber:_storedNumber,...saved}=await updatePerformedSet(set.id, set);
      patchSet(exercise.id, set.id, saved);
    } catch(e) {
      if(set.completed)cancelRestOfSet(set.id);
      throw e;
    }
  }
  function cancelRestOfSet(setId) { setRestTimer((current) => current?.setId === setId ? null : current); }
  function applySetToRest(exercise, set) {
    if (!set.completed) { cancelRestOfSet(set.id); return; }
    if (restAutostart) setRestTimer(createRestTimer({ sessionId: session.id, setId: set.id, exerciseName: exercise.name, seconds: getRestSeconds(exercise), now: Date.now() }));
  }
  function changeRestAutostart(enabled) {
    setRestAutostart(enabled);
    writeRestAutostart(enabled);
    if (!enabled) setRestTimer(null);
  }
  async function toggleComplete(exercise, set) {
    if (!set.completed && (!set.reps || Number(set.reps) <= 0)) { setLocalError('Укажите количество повторений перед завершением подхода.'); return false; }
    const next={...set,completed:!set.completed};
    patchSet(exercise.id,set.id,{weight:next.weight,reps:next.reps,completed:next.completed});
    applySetToRest(exercise,next);
    setSavingSetId(set.id);
    setLocalError('');
    try {
      await updatePerformedSet(set.id,next);
      return true;
    } catch(e) {
      if(next.completed)cancelRestOfSet(set.id);
      patchSet(exercise.id,set.id,{completed:set.completed});
      setLocalError(e.message);
      return false;
    } finally { setSavingSetId(null); }
  }
  function noteSetNumbers(exerciseId, numbers) {
    highestSetNumberRef.current.set(exerciseId, Math.max(highestSetNumberRef.current.get(exerciseId) ?? 0, ...numbers));
  }
  function patchExerciseSets(exerciseId, change) {
    onEntryChange((current) => ({ ...current, workout: { ...current.workout, exercises: current.workout.exercises.map((item) => item.id === exerciseId ? { ...item, sets: change(item.sets) } : item) } }));
  }
  // Stores the shown order of an exercise's sets in one call. `numbers` are the stored numbers it replaces.
  // `quiet`: a background tidy-up after adding a warm-up; the screen already shows the right order, so a failure is not reported.
  async function saveSetOrder(exerciseId, order, numbers, { quiet = false } = {}) {
    const stored = [...numbers.keys()].sort((a, b) => numbers.get(a) - numbers.get(b));
    if (sameSetOrder(order, stored)) return;
    if (quiet && orderSavesRef.current.has(exerciseId)) return;
    noteSetNumbers(exerciseId, numbers.values());
    orderSavesRef.current.add(exerciseId);
    patchExerciseSets(exerciseId, (sets) => renumberSets(sets, order));
    if (!quiet) setLocalError('');
    try {
      await reorderPerformedSets(exerciseId, order);
    } catch (e) {
      patchExerciseSets(exerciseId, (sets) => sets.map((set) => numbers.has(set.id) ? { ...set, setNumber: numbers.get(set.id) } : set).sort((a, b) => a.setNumber - b.setNumber));
      if (!quiet) setLocalError(e.message);
    } finally {
      orderSavesRef.current.delete(exerciseId);
    }
  }
  // Holding the number picks the row up; moving the finger first, or lifting it early, does nothing.
  function holdSetHandle(event, exercise, set) {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    // A set still being created has no id the server knows, and one save of the order runs at a time.
    if (setDragRef.current || orderSavesRef.current.has(exercise.id) || exercise.sets.some((item) => String(item.id).startsWith('temp:'))) return;
    setHoldRef.current?.();
    const { pointerId, clientX, clientY } = event;
    const timer = window.setTimeout(() => {
      release();
      const shown = orderSets(exercise.sets);
      setDragRef.current = {
        exerciseId: exercise.id,
        setId: set.id,
        pointerId,
        order: shown.map((item) => item.id),
        warmupIds: new Set(shown.filter(isWarmupSet).map((item) => item.id)),
        numbers: new Map(exercise.sets.map((item) => [item.id, item.setNumber])),
      };
      setSetDrag(setDragRef.current);
      // A short buzz where the phone can (not iOS); browsers refuse it before the first tap on the page.
      if (navigator.userActivation?.hasBeenActive) navigator.vibrate?.(10);
    }, SET_HOLD_MS);
    const moved = (moveEvent) => { if (moveEvent.pointerId === pointerId && Math.hypot(moveEvent.clientX - clientX, moveEvent.clientY - clientY) > SET_HOLD_SLOP_PX) release(); };
    const lifted = (upEvent) => { if (upEvent.pointerId === pointerId) release(); };
    function release() {
      window.clearTimeout(timer);
      window.removeEventListener('pointermove', moved);
      window.removeEventListener('pointerup', lifted);
      window.removeEventListener('pointercancel', lifted);
      if (setHoldRef.current === release) setHoldRef.current = null;
    }
    window.addEventListener('pointermove', moved);
    window.addEventListener('pointerup', lifted);
    window.addEventListener('pointercancel', lifted);
    setHoldRef.current = release;
  }
  async function addSet(exercise,setType) {
    const nextNumber=Math.max(highestSetNumberRef.current.get(exercise.id)??0,...exercise.sets.map(set=>set.setNumber))+1;
    noteSetNumbers(exercise.id,[nextNumber]);
    const tempId=`temp:${crypto.randomUUID()}`;
    const optimistic={id:tempId,setNumber:nextNumber,setType,plannedReps:null,weight:'',reps:'',completed:false,completedAt:null,resultV2:null};
    setLocalError('');
    onEntryChange(current=>({...current,workout:{...current.workout,exercises:current.workout.exercises.map(item=>item.id===exercise.id?{...item,sets:[...item.sets,optimistic]}:item)}}));
    try {
      const created=await addPerformedSet(exercise.id,nextNumber,setType);
      onEntryChange(current=>({...current,workout:{...current.workout,exercises:current.workout.exercises.map(item=>item.id===exercise.id?{...item,sets:item.sets.map(set=>set.id===tempId?created:set)}:item)}}));
      // A new warm-up is shown under the other warm-ups; store that order too, so the history and the next
      // load agree with the screen. Skipped while another set of this exercise is still being created.
      const sets=[...exercise.sets,created];
      if(setType==='warmup'&&!sets.some(set=>String(set.id).startsWith('temp:'))) {
        void saveSetOrder(exercise.id,orderSets(sets).map(set=>set.id),new Map(sets.map(set=>[set.id,set.setNumber])),{quiet:true});
      }
    } catch(e) {
      onEntryChange(current=>({...current,workout:{...current.workout,exercises:current.workout.exercises.map(item=>item.id===exercise.id?{...item,sets:item.sets.filter(set=>set.id!==tempId)}:item)}}));
      setLocalError(e.message);
    }
  }
  async function removeSet(exercise,set) {
    if(String(set.id).startsWith('temp:'))return;
    setLocalError('');
    onEntryChange(current=>({...current,workout:{...current.workout,exercises:current.workout.exercises.map(item=>item.id===exercise.id?{...item,sets:item.sets.filter(candidate=>candidate.id!==set.id)}:item)}}));
    try { await deletePerformedSet(set.id); }
    catch(e) {
      onEntryChange(current=>({...current,workout:{...current.workout,exercises:current.workout.exercises.map(item=>item.id===exercise.id?{...item,sets:[...item.sets,set].sort((a,b)=>a.setNumber-b.setNumber)}:item)}}));
      setLocalError(e.message);
    }
  }
  async function saveNote(exercise) { try { await updateExerciseNote(exercise.id, exercise.note ?? ''); } catch (e) { setLocalError(e.message); } }
  async function openHistory(exercise) { setHistoryLoadingId(exercise.id); setLocalError(''); try { setHistory({ exerciseName: exercise.name, unit: getUnit(exercise), data: await getExerciseHistorySummary(exercise.exerciseId, session.id) }); } catch (e) { setLocalError(e.message); } finally { setHistoryLoadingId(null); } }
  function openReplacement(exercise) { setActionTarget(null); onRequestReplacement?.(exercise); }
  async function openInfo(exercise) { setExerciseInfo({ exercise, details: null }); setInfoLoading(true); try { setExerciseInfo({ exercise, details: await getExerciseDetails(exercise.linkedExerciseId) }); } catch (e) { setLocalError(e.message); } finally { setInfoLoading(false); } }
  async function removeExercise(exercise) {
    const hasResults = exercise.sets.some((set) => set.completed || set.weight || set.reps || set.resultV2);
    if (hasResults && !window.confirm(`Удалить упражнение «${exercise.name}» и все его подходы из этой тренировки?`)) return;
    setActionTarget(null);
    const snapshot = workout.exercises;
    onEntryChange((current) => ({ ...current, workout: { ...current.workout, exercises: current.workout.exercises.filter((item) => item.id !== exercise.id) } }));
    try {
      await deleteSessionExercise(exercise.id);
    } catch (e) {
      setLocalError(e.message);
      onEntryChange((current) => ({ ...current, workout: { ...current.workout, exercises: snapshot } }));
    }
  }

  async function saveReorder(ids, scope) { setReorderSaving(true); try { await reorderSessionExercises(session.id, ids, scope); onEntryChange(await loadWorkoutSession(session.id)); setReorderState(null); } catch (e) { setLocalError(e.message); } finally { setReorderSaving(false); } }
  function focusReps(setId) { document.querySelector(`[data-reps-set-id="${setId}"]`)?.focus(); }
  // A manual start has no set to go by: use the exercise the user has reached.
  const restExercise = workout.exercises.find((exercise) => exercise.sets.some((set) => !set.completed)) ?? workout.exercises[workout.exercises.length - 1];
  const idleRestSeconds = restExercise ? getRestSeconds(restExercise) : DEFAULT_REST_SECONDS;

  return <><main className="workout-session-content active v3"><section className="workout-active-head"><div><span>Тренировка идёт</span><h1>{workout.name}</h1></div><WorkoutElapsedTime session={session} /></section>{workout.standalone && <StandaloneExerciseEditor sessionId={session.id} exercises={workout.exercises} onEntryChange={onEntryChange} />}<section className="workout-execution-list">{workout.exercises.map((exercise, exerciseIndex) => { const unit = getUnit(exercise); const drag = setDrag?.exerciseId === exercise.id ? setDrag : null; const displaySets = buildDisplaySets(exercise.sets, drag?.order); const execution = getExecutionSettings(exercise); return <article className="workout-exercise-card v3" key={exercise.id}><div className="exercise-card-head"><button className="exercise-card-title" type="button" onClick={() => openInfo(exercise)}><span className="exercise-card-eyebrow">{exerciseIndex + 1} · {exercise.muscleGroup || 'Упражнение'}</span><span className="exercise-card-name">{exercise.name}<InfoIcon /></span></button><button className="exercise-card-more" type="button" aria-label="Действия с упражнением" onClick={() => setActionTarget(exercise)}><MoreIcon /></button></div>{import.meta.env.VITE_EXERCISE_RESULTS_V2 === 'true' && exercise.metricContract && <div className="exercise-execution-settings"><ExerciseConfigurationEditor exerciseId={exercise.metricContract.exercise_id} equipmentInstanceId={execution.equipmentInstanceId} value={execution.configuration} onChange={(configuration) => patchExecutionSettings(exercise, { configuration })} onEquipmentChange={(equipmentInstanceId) => patchExecutionSettings(exercise, { equipmentInstanceId })} /></div>}{exercise.prescription && <p className="workout-exercise-prescription">{exercise.prescription}</p>}<div className="exercise-set-head" aria-hidden="true"><span /><span>{unit === 'lb' ? 'lb' : 'кг'}</span><span>Повт.</span></div><div className={`exercise-set-list${drag ? ' reordering' : ''}`}>{displaySets.map((set) => { const handleProps = { onPointerDown: (event) => holdSetHandle(event, exercise, set), onContextMenu: (event) => event.preventDefault() }; const dragging = drag?.setId === set.id; return (set.resultV2 || (import.meta.env.VITE_EXERCISE_RESULTS_V2 === 'true' && exercise.metricContract && !set.completed && set.weight === '')) ? <ResultSetV2 key={set.id} set={set} contract={exercise.metricContract} configurationKeyValue={configurationKey(execution.configuration)} equipmentInstanceId={execution.equipmentInstanceId} dragging={dragging} handleProps={handleProps} onSave={next => saveV2(exercise,next)} onDelete={() => removeSet(exercise,set)} /> : <LegacySetRow key={set.id} set={set} unit={unit} saving={savingSetId===set.id} dragging={dragging} handleProps={handleProps} onPersist={saveSet} onToggle={next=>toggleComplete(exercise,next)} onDelete={()=>removeSet(exercise,set)} />; })}</div><div className="exercise-card-actions"><button className="exercise-card-add" type="button" onClick={() => addSet(exercise, 'working')}>+ Подход</button><button className="exercise-card-add" type="button" onClick={() => addSet(exercise, 'warmup')}>+ Разминка</button><button className="exercise-card-history" type="button" onClick={() => openHistory(exercise)} disabled={historyLoadingId === exercise.id}><HistoryIcon />{historyLoadingId === exercise.id ? 'Загрузка…' : 'История'}</button></div><label className="exercise-card-note-field"><span>Заметка</span><textarea className="exercise-card-note" rows="1" value={exercise.note ?? ''} placeholder="…" onChange={(e) => onEntryChange((current) => ({ ...current, workout: { ...current.workout, exercises: current.workout.exercises.map((item) => item.id === exercise.id ? { ...item, note: e.target.value } : item) } }))} onBlur={() => saveNote(exercise)} /></label></article>; })}</section></main><footer className="workout-session-footer workout-session-footer-dual">{(error || localError) && <div className="workout-session-error workout-footer-error" role="alert">{error || localError}</div>}<RestTimerDock timer={restTimer} autostart={restAutostart} idleSeconds={idleRestSeconds} onStart={() => setRestTimer(createRestTimer({ sessionId: session.id, exerciseName: restExercise?.name ?? '', seconds: idleRestSeconds, now: Date.now() }))} onStop={() => setRestTimer(null)} onAdd={(seconds) => setRestTimer((current) => current && extendRestTimer(current, seconds, Date.now()))} onAutostartChange={changeRestAutostart} /><button className="workout-pause-button" type="button" onClick={onPauseRequest} disabled={finishing || pausing}>{pausing ? 'Сохраняем…' : 'Поставить на паузу'}</button><button type="button" onClick={onFinish} disabled={finishing || pausing}>{finishing ? 'Завершаем…' : 'Завершить тренировку'}</button></footer>{actionTarget && <ExerciseActionsPopup exercise={actionTarget} unit={getUnit(actionTarget)} restSeconds={getRestSeconds(actionTarget)} onUnitChange={(unit) => setUnit(actionTarget, unit)} onRestChange={(seconds) => setRestSeconds(actionTarget, seconds)} onReplace={() => openReplacement(actionTarget)} onReorder={() => { setReorderState({ focusId: actionTarget.id }); setActionTarget(null); }} onDelete={() => removeExercise(actionTarget)} onClose={() => setActionTarget(null)} />}{history && <HistoryModal data={history.data} exerciseName={history.exerciseName} unit={history.unit} onClose={() => setHistory(null)} />}{reorderState && <ReorderExerciseScreen standalone={workout.standalone} exercises={workout.exercises} focusId={reorderState.focusId} saving={reorderSaving} onSave={saveReorder} onClose={() => !reorderSaving && setReorderState(null)} />}{exerciseInfo && <ExerciseInfoScreen exercise={exerciseInfo.exercise} details={exerciseInfo.details} loading={infoLoading} onClose={() => setExerciseInfo(null)} />}</>;
}

function CompletedWorkout({ entry, onDone, onReload }) {
  const [recordExerciseIds, setRecordExerciseIds] = useState(() => new Set());
  const [shareState, setShareState] = useState('idle');
  const tonnage = workingTonnage(entry.workout.exercises.flatMap((exercise) => exercise.sets));

  function e1rm(set) {
    const weight = Number(set?.weight || 0);
    const reps = Number(set?.reps || 0);
    if (weight <= 0 || reps <= 0) return 0;
    return weight * (1 + reps / 30);
  }

  const rows = useMemo(() => entry.workout.exercises.map((exercise) => {
    const working = exercise.sets.filter((set) => set.completed && set.setType === 'working' && Number(set.weight || 0) > 0 && Number(set.reps || 0) > 0);
    const best = working.reduce((current, set) => !current || e1rm(set) > e1rm(current) ? set : current, null);
    return best ? { exercise, best, score: e1rm(best) } : null;
  }).filter(Boolean), [entry.workout.exercises]);

  useEffect(() => {
    let active = true;
    Promise.all(rows.map(async (row) => {
      if (!row.exercise.exerciseId) return null;
      try {
        const history = await getExerciseHistorySummary(row.exercise.exerciseId, entry.session.id);
        const previousBest = history?.best?.set;
        const previousScore = previousBest ? e1rm(previousBest) : 0;
        return row.score > previousScore + 0.0001 ? row.exercise.id : null;
      } catch {
        return null;
      }
    })).then((ids) => {
      if (!active) return;
      setRecordExerciseIds(new Set(ids.filter(Boolean)));
    });
    return () => { active = false; };
  }, [entry.session.id, rows]);

  const completionDay = entry.workout.completedDate || entry.workout.scheduledDate;
  const completedDate = completionDay
    ? new Intl.DateTimeFormat('ru-RU', { weekday: 'short', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${completionDay}T12:00:00`))
    : '';
  const originallyScheduled = entry.workout.scheduledDate && entry.workout.scheduledDate !== completionDay
    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(new Date(`${entry.workout.scheduledDate}T12:00:00`))
    : '';
  const durationSeconds = Number(entry.session.activeDurationSeconds || 0);
  const duration = durationSeconds < 3600
    ? `${String(Math.floor(durationSeconds / 60)).padStart(2, '0')}:${String(durationSeconds % 60).padStart(2, '0')}`
    : formatTime(durationSeconds);

  const shareText = [
    `Вы сделали это! ${entry.workout.name}`,
    completedDate,
    `Время: ${duration}`,
    `Тоннаж: ${Math.round(tonnage).toLocaleString('ru-RU')} кг`,
    ...entry.workout.exercises.flatMap(exercise => exercise.sets.filter(set=>set.completed && set.resultV2).map(set=>`${exercise.name}: ${formatResultV2(set.resultV2)}${set.setType==='warmup'?' (разминка)':''}`)),
    '',
    ...rows.map((row) => `${recordExerciseIds.has(row.exercise.id) ? '🏆 ' : ''}${row.exercise.name}: ${Number(row.best.weight || 0)} кг × ${row.best.reps}`),
  ].filter((line) => line !== undefined).join('\n');

  async function shareResult() {
    setShareState('idle');
    if (navigator.share) {
      try {
        await navigator.share({ title: `Тренировка · ${entry.workout.name}`, text: shareText });
        return;
      } catch (error) {
        if (error?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(shareText);
      setShareState('copied');
      window.setTimeout(() => setShareState('idle'), 1800);
    } catch {
      setShareState('error');
    }
  }

  return <main className="completed-reference-screen">
    <header className="completed-reference-header">
      <h1>Вы сделали это!</h1>
      <button className="completed-reference-done" type="button" onClick={onDone}>Готово</button>
    </header>

    <section className="completed-result-card" aria-label="Итог тренировки">
      <div className="completed-result-card-top"><span>Результат тренировки</span><strong className="completed-result-brand">GYM</strong></div>
      <h2>{entry.workout.name}</h2>
      <p className="completed-result-date">{completedDate}</p>{entry.session.autoCompleted&&<p className="completed-editor-notice">Автоматически завершена через 3 часа</p>}{originallyScheduled && <p className="completed-result-original-date">По плану: {originallyScheduled}</p>}
      <div className="completed-result-meta">
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>{duration}</span>
        <span><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M8 9V7a4 4 0 0 1 8 0v2"/><path d="M6 9h12l2 11H4L6 9Z"/></svg>{Math.round(tonnage).toLocaleString('ru-RU')} кг</span>
      </div>

      <div className="completed-result-table">
        <div className="completed-result-table-head"><span>Упражнение</span><span>Лучший подход</span></div>
        {rows.length ? rows.map((row) => <div className="completed-result-row" key={row.exercise.id}>
          <span className="completed-result-exercise">{row.exercise.name}</span>
          <span className="completed-result-best">{recordExerciseIds.has(row.exercise.id) && <span className="completed-result-trophy" aria-label="Личный рекорд">🏆</span>}<span>{Number(row.best.weight || 0)} кг × {row.best.reps}</span></span>
        </div>) : <div className="completed-result-empty">Нет завершённых рабочих подходов с весом и повторами.</div>}
      </div>
    </section>

    {entry.workout.exercises.some(exercise=>exercise.sets.some(set=>set.completed && set.resultV2)) && <section className="completed-result-card">
      <h3>Результаты по типам нагрузки</h3>
      <p>Эти подходы не смешиваются со старым тоннажем и расчётными силовыми рекордами.</p>
      {entry.workout.exercises.flatMap(exercise=>exercise.sets.filter(set=>set.completed && set.resultV2).map(set=><div className="completed-result-row" key={set.id}><strong>{exercise.name}{set.setType==='warmup'?' · разминка':''}</strong><span>{formatResultV2(set.resultV2)}</span></div>))}
    </section>}
    <CompletedWorkoutEditor key={entry.session.id + entry.workout.completedDate} entry={entry} onReload={onReload}/>
    <section className="completed-share-section">
      <h3>Поделитесь результатами тренировки со своими друзьями</h3>
      <button className="completed-share-button" type="button" onClick={shareResult}>
        <span className="completed-share-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 15V3"/><path d="m7.5 7.5 4.5-4.5 4.5 4.5"/><path d="M5 11v8a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-8"/></svg></span>
        <span>{shareState === 'copied' ? 'Скопировано' : shareState === 'error' ? 'Не удалось скопировать' : 'Поделиться'}</span>
      </button>
    </section>
  </main>;
}

function AbandonedWorkout({ entry, onDone }) {
  const completedSets = entry.workout.exercises.flatMap((exercise) => exercise.sets).filter((set) => set.completed);
  const workingSets = completedSets.filter((set) => set.setType === 'working');
  return <><main className="workout-session-content completed"><section className="workout-complete-hero abandoned"><div className="workout-abandoned-mark">×</div><span>Тренировка прервана</span><h1>{entry.workout.name}</h1><p>Она отмечена как пропущенная. Следующая тренировка программы останется в расписании.</p></section><section className="workout-result-grid"><div><span>Время до остановки</span><strong>{formatTime(entry.session.activeDurationSeconds)}</strong></div><div><span>Выполнено подходов</span><strong>{completedSets.length}</strong></div><div><span>Рабочих</span><strong>{workingSets.length}</strong></div><div><span>Статус</span><strong>Пропущена</strong></div></section><div className="workout-abandoned-note">Выполненные подходы сохранены внутри этой сессии, но не используются как завершённый результат для «Предыдущего результата» и личных рекордов.</div></main><footer className="workout-session-footer"><button type="button" onClick={onDone}>На главную</button></footer></>;
}

export function WorkoutSessionScreen({ scheduledWorkoutId, initialEntry, canRecoverFinish = false, onBack, onExit, onCompleted, onRequestReplacement, onPauseRequest, onSessionPaused, pausing = false }) {
  const [entry, setEntry] = useState(initialEntry ?? null); const [loading, setLoading] = useState(!initialEntry); const [starting, setStarting] = useState(false); const [finishing, setFinishing] = useState(false); const [error, setError] = useState(''); const [reloadKey, setReloadKey] = useState(0);
  const skipFirstLoad = useRef(Boolean(initialEntry));
  const finishPending = useRef(false);
  useEffect(() => { if (skipFirstLoad.current) { skipFirstLoad.current = false; return undefined; } let active = true; setLoading(true); setError(''); getWorkoutEntry(scheduledWorkoutId).then((result) => { if (active) setEntry(result); }).catch((e) => { if (active) setError(e.message); }).finally(() => { if (active) setLoading(false); }); return () => { active = false; }; }, [scheduledWorkoutId, reloadKey]);
  async function handleStart() { if (starting) return; setStarting(true); setError(''); try { setEntry(await startWorkout(scheduledWorkoutId)); } catch (e) { setError(e.message); } finally { setStarting(false); } }
  async function handleFinish() {
    if (finishPending.current || !entry?.session?.id) return;
    finishPending.current = true; setFinishing(true); setError('');
    try {
      assertResultsSaved();
      try { await flushPendingSetEdits(); }
      catch (saveError) {
        // A value the server keeps rejecting must not make the workout impossible to finish.
        if (!window.confirm(`${saveError.message}\n\nЗавершить тренировку без этих изменений?`)) throw saveError;
      }
      setEntry(await completeWorkout(entry.session.id));
    } catch (e) { setError(e.message); } finally { finishPending.current = false; setFinishing(false); }
  }
  async function handleRecoveryFinish() {
    if (finishPending.current || !window.confirm('Завершить тренировку? Записанные подходы попадут в результат.')) return;
    finishPending.current = true; setFinishing(true); setError('');
    try { setEntry(await finishActiveWorkout(scheduledWorkoutId)); } catch (e) { setError(e.message); } finally { finishPending.current = false; setFinishing(false); }
  }
  // Pausing only applies to a running session; every other state must always be able to leave.
  const handleBack = entry?.mode === 'active' ? onBack : (onExit ?? onBack);
  return <div className={`phone workout-session-phone${entry?.mode === 'completed' ? ' completed-reference-mode' : ''}`}>{entry?.mode !== 'completed' && <header className="workout-session-header"><button type="button" aria-label="Назад" onClick={handleBack}><BackIcon /></button><strong>Тренировка</strong><span /></header>}{loading && <div className="workout-session-loading">Загружаем тренировку…</div>}{!loading && !entry && <div className="workout-session-error standalone" role="alert">{error || 'Тренировка не найдена.'}<div className="workout-session-recovery"><button type="button" onClick={() => setReloadKey((value) => value + 1)} disabled={finishing}>Повторить</button>{canRecoverFinish && <button className="secondary" type="button" onClick={handleRecoveryFinish} disabled={finishing}>{finishing ? 'Завершаем…' : 'Завершить тренировку'}</button>}</div></div>}{!loading && entry?.mode === 'planned' && <PlannedWorkout workout={entry.workout} onStart={handleStart} starting={starting} error={error} />}{!loading && entry?.mode === 'active' && <ActiveWorkout entry={entry} onEntryChange={setEntry} onFinish={handleFinish} onPauseRequest={onPauseRequest} onSessionPaused={onSessionPaused} onRequestReplacement={onRequestReplacement} finishing={finishing} pausing={pausing} error={error} />}{!loading && entry?.mode === 'completed' && <CompletedWorkout entry={entry} onDone={onCompleted} onReload={async()=>setEntry(await loadWorkoutSession(entry.session.id))}/>}{!loading && entry?.mode === 'abandoned' && <AbandonedWorkout entry={entry} onDone={onCompleted} />}</div>;
}
