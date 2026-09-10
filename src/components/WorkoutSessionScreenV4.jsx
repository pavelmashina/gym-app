import { useEffect, useRef, useState } from 'react';
import { replaceSessionExercise } from '../lib/workoutSessions.js';
import { rescheduleScheduledWorkoutScoped } from '../lib/scheduledWorkoutControls.js';
import { supabase } from '../lib/supabase.js';
import { ExerciseLibraryPicker } from './ExerciseLibraryPicker.jsx';
import { WorkoutSessionScreen as WorkoutSessionScreenV3 } from './WorkoutSessionScreenV3.jsx';
import '../exercise-library-picker.css';
import '../workout-exercise-info-media.css';
import '../workout-session-lifecycle.css';

function BackIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>; }
function todayKey() { const date = new Date(); const y = date.getFullYear(); const m = String(date.getMonth() + 1).padStart(2, '0'); const d = String(date.getDate()).padStart(2, '0'); return `${y}-${m}-${d}`; }
function formatDate(value) { return value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : ''; }

export function WorkoutSessionScreen(props) {
  const rootRef = useRef(null);
  const [replacementTarget, setReplacementTarget] = useState(null);
  const [replacementLoading, setReplacementLoading] = useState(false);
  const [replacementError, setReplacementError] = useState('');
  const [pauseConfirmOpen, setPauseConfirmOpen] = useState(false);
  const [pauseLoading, setPauseLoading] = useState(false);
  const [pauseError, setPauseError] = useState('');
  const [lifecycle, setLifecycle] = useState({ loading: true, paused: false, scheduledDate: '', status: '', canShiftTail: true });
  const [resumeLoading, setResumeLoading] = useState(false);
  const [dateMoveOpen, setDateMoveOpen] = useState(false);
  const [dateMoveLoading, setDateMoveLoading] = useState(false);
  const [dateMoveError, setDateMoveError] = useState('');
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let active = true;
    async function loadLifecycle() {
      setLifecycle((current) => ({ ...current, loading: true }));
      const { data: workout, error: workoutError } = await supabase
        .from('scheduled_workouts')
        .select('id, scheduled_date, status, sequence_number, user_program_id')
        .eq('id', props.scheduledWorkoutId)
        .single();
      if (workoutError || !workout) {
        if (active) setLifecycle({ loading: false, paused: false, scheduledDate: '', status: '', canShiftTail: true });
        return;
      }
      const [{ data: sessions }, { data: laterCompleted }] = await Promise.all([
        supabase.from('workout_sessions').select('id, status, paused_at').eq('scheduled_workout_id', props.scheduledWorkoutId).eq('status', 'active').limit(1),
        supabase.from('scheduled_workouts').select('id').eq('user_program_id', workout.user_program_id).gt('sequence_number', workout.sequence_number).eq('status', 'completed').limit(1),
      ]);
      if (!active) return;
      setLifecycle({
        loading: false,
        paused: Boolean(sessions?.[0]?.paused_at),
        scheduledDate: workout.scheduled_date,
        status: workout.status,
        canShiftTail: !(laterCompleted?.length),
      });
    }
    loadLifecycle();
    return () => { active = false; };
  }, [props.scheduledWorkoutId, version]);

  useEffect(() => {
    if (lifecycle.loading || lifecycle.paused) return undefined;
    const renamePauseButton = () => {
      const button = rootRef.current?.querySelector('.workout-abandon-button');
      if (button) {
        button.textContent = 'Поставить на паузу';
        button.setAttribute('aria-label', 'Поставить тренировку на паузу');
      }
    };
    renamePauseButton();
    const observer = new MutationObserver(renamePauseButton);
    if (rootRef.current) observer.observe(rootRef.current, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [lifecycle.loading, lifecycle.paused, version]);

  function openReplacement(exercise) {
    setReplacementError('');
    setReplacementTarget(exercise);
  }

  async function chooseReplacement(exercise) {
    if (!replacementTarget) return;
    setReplacementLoading(true);
    setReplacementError('');
    try {
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

  function captureWorkoutAction(event) {
    const element = event.target instanceof Element ? event.target : null;
    const pauseButton = element?.closest('.workout-abandon-button');
    const backButton = element?.closest('.workout-session-header button');
    const activeWorkoutVisible = Boolean(rootRef.current?.querySelector('.workout-session-content.active'));
    if (!pauseButton && !(backButton && activeWorkoutVisible)) return;
    event.preventDefault();
    event.stopPropagation();
    setPauseError('');
    setPauseConfirmOpen(true);
  }

  async function pauseWorkout() {
    if (pauseLoading) return;
    setPauseLoading(true);
    setPauseError('');
    const { error } = await supabase.rpc('pause_workout', { p_scheduled_workout_id: props.scheduledWorkoutId });
    if (error) {
      setPauseError('Не удалось поставить тренировку на паузу. Попробуйте ещё раз.');
      setPauseLoading(false);
      return;
    }
    setPauseConfirmOpen(false);
    setPauseLoading(false);
    props.onBack?.();
  }

  async function resumeWorkout() {
    if (resumeLoading) return;
    setResumeLoading(true);
    setPauseError('');
    const { error } = await supabase.rpc('resume_workout', { p_scheduled_workout_id: props.scheduledWorkoutId });
    if (error) {
      setPauseError('Не удалось продолжить тренировку. Попробуйте ещё раз.');
      setResumeLoading(false);
      return;
    }
    setResumeLoading(false);
    setVersion((value) => value + 1);
  }

  async function moveToToday(scope) {
    if (dateMoveLoading) return;
    setDateMoveLoading(true);
    setDateMoveError('');
    try {
      await rescheduleScheduledWorkoutScoped(props.scheduledWorkoutId, todayKey(), scope);
      setDateMoveOpen(false);
      setVersion((value) => value + 1);
    } catch (error) {
      setDateMoveError(error?.message || 'Не удалось перенести тренировку на сегодня.');
    } finally {
      setDateMoveLoading(false);
    }
  }

  if (lifecycle.loading) return <div className="phone workout-lifecycle-screen"><div className="workout-lifecycle-loading">Проверяем тренировку…</div></div>;

  if (lifecycle.paused) return <div className="phone workout-lifecycle-screen">
    <header className="workout-lifecycle-header"><button type="button" aria-label="Назад" onClick={props.onBack}><BackIcon /></button><strong>Тренировка</strong><span /></header>
    <main className="workout-lifecycle-content"><section className="workout-lifecycle-card paused"><span>Тренировка на паузе</span><h1>Можно продолжить в любой момент</h1><p>Подходы, веса, повторы, заметки и уже прошедшее время сохранены. Время на паузе в длительность тренировки не попадёт.</p>{pauseError && <div className="workout-lifecycle-error">{pauseError}</div>}<button type="button" onClick={resumeWorkout} disabled={resumeLoading}>{resumeLoading ? 'Продолжаем…' : 'Продолжить тренировку'}</button><button className="secondary" type="button" onClick={props.onBack} disabled={resumeLoading}>Вернуться на главную</button></section></main>
  </div>;

  const today = todayKey();
  const needsDateMove = lifecycle.status === 'scheduled' && lifecycle.scheduledDate && lifecycle.scheduledDate !== today;
  if (needsDateMove) {
    const future = lifecycle.scheduledDate > today;
    return <div className="phone workout-lifecycle-screen">
      <header className="workout-lifecycle-header"><button type="button" aria-label="Назад" onClick={props.onBack}><BackIcon /></button><strong>Тренировка</strong><span /></header>
      <main className="workout-lifecycle-content"><section className="workout-lifecycle-card"><span>{future ? 'Тренировка запланирована на будущее' : 'Пропущенный день'}</span><h1>{future ? `Тренировка — ${formatDate(lifecycle.scheduledDate)}` : `Плановая дата была ${formatDate(lifecycle.scheduledDate)}`}</h1><p>{future ? 'Будущую тренировку нельзя начать раньше даты по расписанию. Если хотите выполнить её сейчас — сначала перенесите её на сегодня.' : 'Чтобы сохранить корректное расписание и статистику, сначала перенесите эту тренировку на сегодня.'}</p>{dateMoveError && <div className="workout-lifecycle-error">{dateMoveError}</div>}<button type="button" onClick={() => setDateMoveOpen(true)}>Перенести на сегодня</button><button className="secondary" type="button" onClick={props.onBack}>Назад</button></section></main>
      {dateMoveOpen && <div className="workout-modal-shell" role="dialog" aria-modal="true" aria-label="Перенести тренировку на сегодня"><button className="workout-modal-scrim" type="button" aria-label="Закрыть" onClick={() => !dateMoveLoading && setDateMoveOpen(false)} /><section className="workout-modal-card workout-date-move-modal"><div className="workout-modal-head"><div><span>Сегодня · {formatDate(today)}</span><h3>Что именно перенести?</h3></div><button type="button" onClick={() => setDateMoveOpen(false)} disabled={dateMoveLoading}>×</button></div><div className="workout-date-move-options"><button type="button" disabled={dateMoveLoading} onClick={() => moveToToday('single')}><strong>Только эту тренировку</strong><span>Остальные тренировки сохранят свои даты.</span></button>{lifecycle.canShiftTail && <button className="primary" type="button" disabled={dateMoveLoading} onClick={() => moveToToday('tail')}><strong>Эту и все оставшиеся</strong><span>Дальнейшее расписание перестроится с сохранением ритма программы.</span></button>}</div>{dateMoveError && <div className="workout-lifecycle-error">{dateMoveError}</div>}</section></div>}
    </div>;
  }

  return <div ref={rootRef} onClickCapture={captureWorkoutAction}>
    <WorkoutSessionScreenV3 key={version} {...props} onRequestReplacement={openReplacement} />

    {pauseConfirmOpen && <div className="workout-modal-shell" role="dialog" aria-modal="true" aria-label="Поставить тренировку на паузу">
      <button className="workout-modal-scrim" type="button" aria-label="Закрыть" onClick={() => !pauseLoading && setPauseConfirmOpen(false)} />
      <section className="workout-modal-card workout-interrupt-confirm">
        <div className="workout-modal-head"><div><span>Текущая тренировка</span><h3>Поставить тренировку на паузу?</h3></div><button type="button" onClick={() => setPauseConfirmOpen(false)} disabled={pauseLoading}>×</button></div>
        <p>Все введённые подходы, веса, повторы, заметки и прошедшее время сохранятся. Вы сможете продолжить тренировку позже с того же места.</p>
        {pauseError && <div className="workout-lifecycle-error">{pauseError}</div>}
        <div className="workout-interrupt-confirm-actions">
          <button type="button" onClick={() => setPauseConfirmOpen(false)} disabled={pauseLoading}>Продолжить сейчас</button>
          <button className="primary" type="button" onClick={pauseWorkout} disabled={pauseLoading}>{pauseLoading ? 'Сохраняем…' : 'Поставить на паузу'}</button>
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
