import { useEffect, useMemo, useState } from 'react';
import { getProgram } from '../lib/programs.js';
import { supabase } from '../lib/supabase.js';
import '../program-detail.css';

const WEEKLY_DAYS = { weekly_mwf: [1, 3, 5], weekly_tts: [2, 4, 6] };
function BackIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m15 5-7 7 7 7" /></svg>; }
function PencilIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M4.5 19.5 5.8 14 15.9 3.9a2.1 2.1 0 0 1 3 0l1.2 1.2a2.1 2.1 0 0 1 0 3L10 18.2l-5.5 1.3Z" /><path d="m14.7 5.1 4.2 4.2" /></svg>; }
function CalendarIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><rect x="3.5" y="5.5" width="17" height="15" rx="3" /><path d="M8 3.5v4M16 3.5v4M3.5 10h17" /></svg>; }
function formatCount(count, forms) { const a = count % 100; const b = count % 10; if (a >= 11 && a <= 14) return `${count} ${forms[2]}`; if (b === 1) return `${count} ${forms[0]}`; if (b >= 2 && b <= 4) return `${count} ${forms[1]}`; return `${count} ${forms[2]}`; }
function formatDate(value) { return value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${value}T12:00:00`)) : ''; }
function localToday() { const date = new Date(); return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 10); }
function isAllowedStartDate(value, mode) { if (!value) return false; const allowed = WEEKLY_DAYS[mode]; return !allowed || allowed.includes(new Date(`${value}T12:00:00`).getDay()); }
function startDateHint(mode) { if (mode === 'weekly_mwf') return 'Выберите понедельник, среду или пятницу.'; if (mode === 'weekly_tts') return 'Выберите вторник, четверг или субботу.'; return ''; }
function participationLabel(participation) { if (!participation) return 'Не начата'; if (participation.status === 'paused') return 'На паузе'; if (participation.status === 'completed') return 'Завершена'; if (participation.status === 'abandoned') return 'Остановлена'; if (participation.startDate > localToday()) return `Старт ${formatDate(participation.startDate)}`; return 'Активна'; }

async function attachScheduledSnapshot(program) {
  if (!program?.participation || !program.scheduledWorkouts.length) return program;
  const ids = program.scheduledWorkouts.map((item) => item.id);
  const { data: rows, error } = await supabase.from('scheduled_workout_exercises').select('id, scheduled_workout_id, exercise_id, exercise_name_snapshot, prescription_snapshot, position').in('scheduled_workout_id', ids).order('position', { ascending: true });
  if (error) throw new Error('Не удалось загрузить сохранённый состав тренировок.');
  const exerciseIds = [...new Set((rows ?? []).map((row) => row.exercise_id).filter(Boolean))];
  let canonical = [];
  if (exerciseIds.length) {
    const response = await supabase.from('exercises').select('id, name, muscle_group').in('id', exerciseIds);
    if (response.error) throw new Error('Не удалось загрузить данные упражнений программы.');
    canonical = response.data ?? [];
  }
  const byId = new Map(canonical.map((item) => [item.id, item]));
  const byWorkout = new Map();
  (rows ?? []).forEach((row) => {
    const source = row.exercise_id ? byId.get(row.exercise_id) : null;
    const list = byWorkout.get(row.scheduled_workout_id) ?? [];
    list.push({ id: row.exercise_id ?? row.id, name: row.exercise_name_snapshot || source?.name || 'Упражнение', prescription: row.prescription_snapshot ?? '', muscle_group: source?.muscle_group ?? '' });
    byWorkout.set(row.scheduled_workout_id, list);
  });
  return { ...program, scheduledWorkouts: program.scheduledWorkouts.map((item) => ({ ...item, exercises: byWorkout.get(item.id) ?? [] })) };
}

export function ProgramDetailScreen({ programId, onBack, onEdit, onStart }) {
  const [program, setProgram] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editingStartDate, setEditingStartDate] = useState(false);
  const [startDateDraft, setStartDateDraft] = useState('');
  const [startDateSaving, setStartDateSaving] = useState(false);
  const [startDateError, setStartDateError] = useState('');

  async function reloadProgram() {
    const hydrated = await attachScheduledSnapshot(await getProgram(programId));
    setProgram(hydrated); setStartDateDraft(hydrated.participation?.startDate ?? ''); return hydrated;
  }

  useEffect(() => {
    let active = true;
    setLoading(true); setError('');
    getProgram(programId).then(attachScheduledSnapshot).then((data) => { if (active) { setProgram(data); setStartDateDraft(data.participation?.startDate ?? ''); } }).catch((requestError) => { if (active) setError(requestError?.message || 'Не удалось открыть программу.'); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [programId]);

  const templateWorkouts = useMemo(() => program ? program.programWeeks.flatMap((group) => group.workouts.map((workout) => ({ sourceGroup: group.number, workout }))) : [], [program]);
  if (loading) return <div className="phone program-detail-phone"><div className="program-detail-state"><div className="exercise-list-spinner" /><span>Загружаем программу…</span></div></div>;
  if (error || !program) return <div className="phone program-detail-phone"><header className="program-detail-header"><button type="button" onClick={onBack}><BackIcon /></button><strong>Программа</strong><span /></header><div className="program-detail-state error">{error || 'Программа не найдена.'}</div></div>;

  const isCycle = program.structureMode === 'cycle';
  const participation = program.participation;
  const liveParticipation = Boolean(participation && ['active', 'paused'].includes(participation.status));
  const canStart = !participation || ['completed', 'abandoned'].includes(participation.status);
  const canEditProgram = !(liveParticipation && !isCycle);
  const canEditStartDate = Boolean(liveParticipation && program.scheduledWorkouts.length && program.scheduledWorkouts.every((item) => item.status === 'scheduled'));
  const totalTemplateWorkouts = templateWorkouts.length;
  const totalPlannedWorkouts = isCycle ? totalTemplateWorkouts * program.cycleRepeatCount : totalTemplateWorkouts;
  const totalExercises = templateWorkouts.reduce((sum, item) => sum + item.workout.exercises.length, 0);
  const dateAllowed = isAllowedStartDate(startDateDraft, program.scheduleMode);
  const dateChanged = startDateDraft && startDateDraft !== participation?.startDate;

  async function saveStartDate() {
    if (!canEditStartDate || startDateSaving || !dateChanged) return;
    if (startDateDraft < localToday()) { setStartDateError('Дата начала не может быть в прошлом.'); return; }
    if (!dateAllowed) { setStartDateError(startDateHint(program.scheduleMode)); return; }
    setStartDateSaving(true); setStartDateError('');
    try {
      const { error: changeError } = await supabase.rpc('change_program_start_date', { p_user_program_id: participation.id, p_start_date: startDateDraft });
      if (changeError) throw changeError;
      await reloadProgram(); setEditingStartDate(false);
    } catch (changeError) {
      if (changeError?.message?.includes('already started') || changeError?.message?.includes('workout history')) setStartDateError('Программа уже фактически началась. Дату начала больше нельзя изменить.');
      else setStartDateError('Не удалось изменить дату начала.');
    } finally { setStartDateSaving(false); }
  }

  const preview = participation ? program.scheduledWorkouts : templateWorkouts.map((item, index) => ({ id: item.workout.id, sequenceNumber: index + 1, cycleNumber: isCycle ? 1 : null, weekNumber: item.sourceGroup, workoutName: item.workout.name, scheduledDate: null, exercises: item.workout.exercises }));

  return <div className="phone program-detail-phone">
    <header className="program-detail-header"><button type="button" aria-label="Назад" onClick={onBack}><BackIcon /></button><strong>Моя программа</strong><span /></header>
    <main className="program-detail-content">
      {program.coverUrl && <div className="program-detail-cover"><img src={program.coverUrl} alt="" /></div>}
      <section className="program-detail-hero"><span>Тренировочная программа</span><h1>{program.name}</h1>{program.description && <p>{program.description}</p>}{program.categories.length > 0 && <div className="program-detail-tags">{program.categories.map((item) => <span key={item}>{item}</span>)}</div>}</section>

      <section className={`program-detail-start-state${canStart ? ' not-started' : ' joined'}`}><span className="program-detail-status-badge">{participationLabel(participation)}</span>
        {canStart ? <><strong>Начните, когда будете готовы</strong><p>{isCycle ? `В цикле ${totalTemplateWorkouts} тренировок · повторений цикла: ${program.cycleRepeatCount}.` : 'Программа создана в старом формате и сохраняет исходную последовательность тренировок.'}</p></> : <><strong>Вы присоединились к программе</strong><p>Первая тренировка запланирована на {formatDate(participation.startDate)}.</p>{canEditStartDate && !editingStartDate && <button type="button" className="program-detail-inline-action" onClick={() => { setStartDateDraft(participation.startDate); setStartDateError(''); setEditingStartDate(true); }}>Изменить дату начала</button>}{canEditStartDate && editingStartDate && <div className="program-detail-date-editor"><label><span>Новая дата первой тренировки</span><input type="date" min={localToday()} value={startDateDraft} onChange={(event) => { setStartDateDraft(event.target.value); setStartDateError(''); }} /></label>{startDateHint(program.scheduleMode) && <small>{startDateHint(program.scheduleMode)}</small>}{startDateError && <small className="error">{startDateError}</small>}<div><button type="button" onClick={() => setEditingStartDate(false)}>Отмена</button><button type="button" onClick={saveStartDate} disabled={startDateSaving || !dateChanged || !dateAllowed}>{startDateSaving ? 'Сохраняем…' : 'Сохранить'}</button></div></div>}</>}
        {!canEditProgram && <div className="program-detail-compat-note">Редактирование структуры станет доступно после завершения или остановки текущего запуска. История и расписание сохраняются.</div>}
      </section>

      <section className="program-detail-stats">{isCycle ? <><div><span>Циклов</span><strong>{program.cycleRepeatCount}</strong></div><div><span>В цикле</span><strong>{totalTemplateWorkouts}</strong></div><div><span>Всего</span><strong>{totalPlannedWorkouts}</strong></div></> : <><div><span>Этапов</span><strong>{program.programWeeks.length}</strong></div><div><span>Тренировок</span><strong>{totalTemplateWorkouts}</strong></div><div><span>Упражнений</span><strong>{totalExercises}</strong></div></>}</section>
      <section className="program-detail-meta-card"><div><span>Место</span><strong>{program.trainingPlace || 'Нет данных'}</strong></div><div><span>Оборудование</span><strong>{program.equipment || 'Нет данных'}</strong></div><div><span>Уровень</span><strong>{program.level || 'Нет данных'}</strong></div></section>

      <section className="program-detail-section"><div className="program-detail-section-head"><span>{participation ? 'Календарь' : (isCycle ? 'Повторение цикла' : 'Последовательность')}</span><h2>{participation ? 'Запланированные тренировки' : (isCycle ? `${program.cycleRepeatCount} × цикл` : 'Старая структура программы')}</h2></div><div className="program-detail-schedule">{preview.map((item) => <article key={item.id}><div className="program-detail-day">{item.scheduledDate ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(`${item.scheduledDate}T12:00:00`)) : `#${item.sequenceNumber}`}</div><div className="program-detail-workout-copy"><small>{isCycle ? `Цикл ${item.cycleNumber ?? 1}` : `Этап ${item.weekNumber}`}</small><strong>{item.workoutName}</strong><span>{formatCount((item.exercises ?? []).length, ['упражнение','упражнения','упражнений'])}</span></div></article>)}</div></section>

      <section className="program-detail-section"><div className="program-detail-section-head"><span>Структура</span><h2>{isCycle ? 'Один цикл тренировок' : 'Старая структура программы'}</h2></div><div className="program-detail-weeks">{isCycle ? <section><header><strong>Цикл</strong><span>{formatCount(totalTemplateWorkouts, ['тренировка','тренировки','тренировок'])}</span></header>{templateWorkouts.map(({ workout }, index) => <div className="program-detail-week-workout" key={workout.id}><strong>{index + 1}. {workout.name}</strong><span>{workout.exercises.map((exercise) => exercise.name).join(' · ')}</span></div>)}</section> : program.programWeeks.map((group) => <section key={group.id}><header><strong>Этап {group.number}</strong><span>{formatCount(group.workouts.length, ['тренировка','тренировки','тренировок'])}</span></header>{group.workouts.map((workout) => <div className="program-detail-week-workout" key={workout.id}><strong>{workout.name}</strong><span>{workout.exercises.map((exercise) => exercise.name).join(' · ')}</span></div>)}</section>)}</div></section>
    </main>
    <footer className={`program-detail-footer${canStart ? ' two-actions' : ''}`}>{canStart && <button className="program-detail-start-button" type="button" onClick={() => onStart?.(program.id)}><CalendarIcon /><span>{participation ? 'Начать программу заново' : 'Начать программу'}</span></button>}<button className="program-detail-edit-button" type="button" onClick={() => canEditProgram && onEdit?.(program.id)} disabled={!canEditProgram}><PencilIcon /><span>{canEditProgram ? 'Редактировать программу' : 'Редактирование недоступно'}</span></button></footer>
  </div>;
}
