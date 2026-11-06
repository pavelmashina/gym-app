import { useEffect, useState } from 'react';
import {assertResultsSaved,flushPendingSetEdits} from '../lib/resultDraftGuard.js';
import { describeRequestError, withDeadline } from '../lib/requestResilience.js';
import { finishActiveWorkout, replaceSessionExercise } from '../lib/workoutSessions.js';
import { isStaleSessionError, localDateKey, needsWorkoutDateMove } from '../lib/workoutLifecycle.js';
import { rescheduleScheduledWorkoutScoped } from '../lib/scheduledWorkoutControls.js';
import { supabase } from '../lib/supabase.js';
import { ExerciseLibraryPicker } from './ExerciseLibraryPicker.jsx';
import { WorkoutSessionScreen as WorkoutSessionScreenV3 } from './WorkoutSessionScreenV3.jsx';
import '../exercise-library-picker.css';
import '../workout-exercise-info-media.css';
import '../workout-session-lifecycle.css';

function BackIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>; }
function formatDate(value) { return value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : ''; }

const LIFECYCLE_DEADLINE_MS = 30_000;
const ACTION_DEADLINE_MS = 20_000;

function runWorkoutRpc(name, scheduledWorkoutId) {
  return withDeadline(Promise.resolve(supabase.rpc(name, { p_scheduled_workout_id: scheduledWorkoutId })), ACTION_DEADLINE_MS).catch((error) => ({ error }));
}

export function WorkoutSessionScreen(props) {
  const [replacementTarget, setReplacementTarget] = useState(null);
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacementError, setReplacementError] = useState('');
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [pauseError, setPauseError] = useState('');
  const [pauseFailed, setPauseFailed] = useState(false);
  const [lifecycle, setLifecycle] = useState({ loading: true, error: '', paused: false, hasActiveSession: false, scheduledDate: '', status: '', canShiftTail: true });
  const [resumeLoading, setResumeLoading] = useState(false);
  const [finishLoading, setFinishLoading] = useState(false);
  const [finishedEntry, setFinishedEntry] = useState(null);
  const [dateMoveOpen, setDateMoveOpen] = useState(false);
  const [dateMoveLoading, setDateMoveLoading] = useState(false);
  const [dateMoveError, setDateMoveError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadLifecycle() {
      const { data: workout, error: workoutError } = await supabase
        .from('scheduled_workouts')
        .select('id, scheduled_date, status, sequence_number, user_program_id')
        .eq('id', props.scheduledWorkoutId)
        .single();
      if (workoutError || !workout) throw workoutError ?? new Error('Scheduled workout not found');
      const [{ data: sessions, error: sessionsError }, { data: laterCompleted }] = await Promise.all([
        supabase.from('workout_sessions').select('id, status, paused_at').eq('scheduled_workout_id', props.scheduledWorkoutId).eq('status', 'active').limit(1),
        workout.user_program_id ? supabase.from('scheduled_workouts').select('id').eq('user_program_id', workout.user_program_id).gt('sequence_number', workout.sequence_number).eq('status', 'completed').limit(1) : Promise.resolve({ data: [] }),
      ]);
      if (sessionsError) throw sessionsError;
      return {
        loading: false,
        error: '',
        paused: Boolean(sessions?.[0]?.paused_at),
        hasActiveSession: Boolean(sessions?.[0]),
        scheduledDate: workout.scheduled_date,
        status: workout.status,
        standalone: !workout.user_program_id,
        canShiftTail: !(laterCompleted?.length),
      };
    }
    setLifecycle((current) => ({ ...current, loading: true, error: '' }));
    withDeadline(loadLifecycle(), LIFECYCLE_DEADLINE_MS)
      .then((next) => { if (active) setLifecycle(next); })
      .catch((error) => { if (active) setLifecycle((current) => ({ ...current, loading: false, error: describeRequestError(error, 'Не удалось проверить тренировку.') })); });
    return () => { active = false; };
  }, [props.scheduledWorkoutId, version]);


  function openReplacement(exercise) {
    setReplacementError('');
    setReplacementTarget(exercise);
  }

  async function chooseReplacement(exercise) {
    if (!replacementTarget) return;
    setReplacementLoading(true);
    setReplacementError('');
    try {
      assertResultsSaved();
      await flushPendingSetEdits();
      await replaceSessionExercise(replacementTarget.id, exercise.id);
      setReplacementTarget(null);
      setVersion((value) => value + 1);
    } catch (error) {
      setReplacementError(error?.message || 'Не удалось заменить упражнение.');
    } finally {
      setReplacementLoading(false);
    }
  }

  function closeReplacement() {
    if (replacementLoading) return;
    setReplacementTarget(null);
    setReplacementError('');
  }


  async function pauseWorkout() {
    if (pauseLoading) return;
    setPauseFailed(false);
    try {assertResultsSaved();} catch(e) {setPauseError(e.message);return;}
    setPauseLoading(true);
    setPauseError('');
    // Unsaved rows stay in the on-device journal, so a failed save must not block pausing.
    await flushPendingSetEdits().catch(() => {});
    const { error } = await runWorkoutRpc('pause_workout', props.scheduledWorkoutId);
    setPauseLoading(false);
    if (error && isStaleSessionError(error)) {
      setPauseConfirmOpen(false);
      setVersion((value) => value + 1);
      return;
    }
    if (error) {
      setPauseError(`${describeRequestError(error, 'Не удалось поставить тренировку на паузу.')} Можно выйти и без паузы: тренировка останется активной, вернуться к ней можно с главного экрана.`);
      setPauseFailed(true);
      return;
    }
    setPauseConfirmOpen(false);
    props.onBack?.();
  }

  async function resumeWorkout() {
    if (resumeLoading) return;
    setResumeLoading(true);
    setPauseError('');
    const { error } = await runWorkoutRpc('resume_workout', props.scheduledWorkoutId);
    setResumeLoading(false);
    if (error && !isStaleSessionError(error)) {
      setPauseError(describeRequestError(error, 'Не удалось продолжить тренировку.'));
      return;
    }
    setVersion((value) => value + 1);
  }

  async function finishFromRecovery() {
    if (finishLoading || !window.confirm('Завершить тренировку? Записанные подходы попадут в результат.')) return;
    setFinishLoading(true);
    setPauseError('');
    try {
      // Shown directly: the failed check that led here may still be failing.
      setFinishedEntry(await finishActiveWorkout(props.scheduledWorkoutId));
    } catch (error) {
      setPauseError(error?.message || 'Не удалось завершить тренировку.');
    } finally {
      setFinishLoading(false);
    }
  }

  async function moveToToday(scope) {
    if (dateMoveLoading) return;
    setDateMoveLoading(true);
    setDateMoveError('');
    try {
      await withDeadline(rescheduleScheduledWorkoutScoped(props.scheduledWorkoutId, localDateKey(), scope), ACTION_DEADLINE_MS);
      setDateMoveOpen(false);
      setVersion((value) => value + 1);
    } catch (error) {
      setDateMoveError(error?.message || 'Не удалось перенести тренировку на сегодня.');
    } finally {
      setDateMoveLoading(false);
    }
  }

  if (finishedEntry) return <WorkoutSessionScreenV3 key="finished" {...props} initialEntry={finishedEntry} onExit={props.onBack} />;

  const header = <header className="workout-lifecycle-header"><button type="button" aria-label="Назад" onClick={props.onBack}><BackIcon /></button><strong>Тренировка</strong><span /></header>;

  if (lifecycle.loading) return <div className="phone workout-lifecycle-screen">{header}<div className="workout-lifecycle-loading">Проверяем тренировку…</div></div>;

  if (lifecycle.error) return <div className="phone workout-lifecycle-screen">
    {header}
    <main className="workout-lifecycle-content"><section className="workout-lifecycle-card"><span>Тренировка</span><h1>Не удалось открыть тренировку</h1><p>Записанные подходы не потеряются.</p><div className="workout-lifecycle-error" role="alert">{pauseError || lifecycle.error}</div><button type="button" onClick={() => { setPauseError(''); setVersion((value) => value + 1); }} disabled={finishLoading}>Повторить</button>{props.initialEntry?.mode === 'active' && <button className="secondary" type="button" onClick={finishFromRecovery} disabled={finishLoading}>{finishLoading ? 'Завершаем…' : 'Завершить тренировку'}</button>}<button className="secondary" type="button" onClick={props.onBack} disabled={finishLoading}>Вернуться на главную</button></section></main>
  </div>;

  if (lifecycle.paused) return <div className="phone workout-lifecycle-screen">
    {header}
    <main className="workout-lifecycle-content"><section className="workout-lifecycle-card paused"><span>Тренировка на паузе</span><h1>Можно продолжить в любой момент</h1><p>Подходы, веса, повторы, заметки и уже прошедшее время сохранены. Время на паузе в длительность тренировки не попадёт.</p>{pauseError && <div className="workout-lifecycle-error" role="alert">{pauseError}</div>}<button type="button" onClick={resumeWorkout} disabled={resumeLoading || finishLoading}>{resumeLoading ? 'Продолжаем…' : 'Продолжить тренировку'}</button><button className="secondary" type="button" onClick={finishFromRecovery} disabled={resumeLoading || finishLoading}>{finishLoading ? 'Завершаем…' : 'Завершить тренировку'}</button><button className="secondary" type="button" onClick={props.onBack} disabled={resumeLoading || finishLoading}>Вернуться на главную</button></section></main>
  </div>;

  const today = localDateKey();
  if (needsWorkoutDateMove(lifecycle, today)) {
    const future = lifecycle.scheduledDate > today;
    return <div className="phone workout-lifecycle-screen">
      {header}
      <main className="workout-lifecycle-content"><section className="workout-lifecycle-card"><span>{future ? 'Тренировка запланирована на будущее' : 'Пропущенный день'}</span><h1>{future ? `Тренировка — ${formatDate(lifecycle.scheduledDate)}` : `Плановая дата была ${formatDate(lifecycle.scheduledDate)}`}</h1><p>{future ? 'Будущую тренировку нельзя начать раньше даты по расписанию. Если хотите выполнить её сейчас — сначала перенесите её на сегодня.' : 'Чтобы сохранить корректное расписание и статистику, сначала перенесите эту тренировку на сегодня.'}</p>{dateMoveError && <div className="workout-lifecycle-error">{dateMoveError}</div>}<button type="button" onClick={() => setDateMoveOpen(true)}>Перенести на сегодня</button><button className="secondary" type="button" onClick={props.onBack}>Назад</button></section></main>
      {dateMoveOpen && <div className="workout-modal-shell" role="dialog" aria-modal="true" aria-label="Перенести тренировку на сегодня"><button className="workout-modal-scrim" type="button" aria-label="Закрыть" onClick={() => !dateMoveLoading && setDateMoveOpen(false)} /><section className="workout-modal-card workout-date-move-modal"><div className="workout-modal-head"><div><span>Сегодня · {formatDate(today)}</span><h3>Что именно перенести?</h3></div><button type="button" onClick={() => setDateMoveOpen(false)} disabled={dateMoveLoading}>×</button></div><div className="workout-date-move-options"><button type="button" disabled={dateMoveLoading} onClick={() => moveToToday('single')}><strong>Только эту тренировку</strong><span>Остальные тренировки сохранят свои даты.</span></button>{lifecycle.canShiftTail && <button className="primary" type="button" disabled={dateMoveLoading} onClick={() => moveToToday('tail')}><strong>Эту и все оставшиеся</strong><span>Дальнейшее расписание перестроится с сохранением ритма программы.</span></button>}</div>{dateMoveError && <div className="workout-lifecycle-error">{dateMoveError}</div>}</section></div>}
    </div>;
  }

  const requestPause = () => { setPauseError(''); setPauseFailed(false); setPauseConfirmOpen(true); };

  return <div>
    <WorkoutSessionScreenV3 key={version} {...props} initialEntry={version === 0 ? props.initialEntry : undefined} canRecoverFinish={lifecycle.hasActiveSession} onBack={requestPause} onExit={props.onBack} onPauseRequest={requestPause} pausing={pauseLoading} onRequestReplacement={openReplacement} />

    {pauseConfirmOpen && <div className="workout-modal-shell" role="dialog" aria-modal="true" aria-label="Поставить тренировку на паузу">
      <button className="workout-modal-scrim" type="button" aria-label="Закрыть" onClick={() => !pauseLoading && setPauseConfirmOpen(false)} />
      <section className="workout-modal-card workout-interrupt-confirm">
        <div className="workout-modal-head"><div><span>Текущая тренировка</span><h3>Поставить тренировку на паузу?</h3></div><button type="button" onClick={() => setPauseConfirmOpen(false)} disabled={pauseLoading}>×</button></div>
        <p>Все введённые подходы, веса, повторы, заметки и прошедшее время сохранятся. Вы сможете продолжить тренировку позже с того же места.</p>
        {pauseError && <div className="workout-lifecycle-error">{pauseError}</div>}
        <div className="workout-interrupt-confirm-actions">
          <button type="button" onClick={() => setPauseConfirmOpen(false)} disabled={pauseLoading}>Продолжить сейчас</button>
          <button className="primary" type="button" onClick={pauseWorkout} disabled={pauseLoading}>{pauseLoading ? 'Сохраняем…' : 'Поставить на паузу'}</button>
          {pauseFailed && <button type="button" onClick={props.onBack} disabled={pauseLoading}>Выйти без паузы</button>}
        </div>
      </section>
    </div>}

    {replacementTarget && <div className="workout-modal-shell" role="dialog" aria-modal="true" aria-label="Заменить упражнение">
      <button className="workout-modal-scrim" type="button" aria-label="Закрыть" onClick={closeReplacement} />
      <section className="workout-modal-card replace-modal">
        <div className="workout-modal-head"><div><span>Текущая тренировка</span><h3>Заменить упражнение</h3></div><button type="button" onClick={closeReplacement} disabled={replacementLoading}>×</button></div>
        {replacementError && <div className="program-exercise-state error"><span>{replacementError}</span></div>}
        <ExerciseLibraryPicker excludeId={replacementTarget.linkedExerciseId || replacementTarget.exerciseId} onSelect={chooseReplacement} />
        {replacementLoading && <div className="program-exercise-state"><span>Заменяем упражнение…</span></div>}
      </section>
    </div>}
  </div>;
}
