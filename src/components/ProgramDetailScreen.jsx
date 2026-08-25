import { useEffect, useMemo, useState } from 'react';
import { getProgram } from '../lib/programs.js';
import { supabase } from '../lib/supabase.js';
import '../program-detail.css';

const WEEKLY_DAYS = {
  weekly_mwf: [1, 3, 5],
  weekly_tts: [2, 4, 6],
};

const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M4.5 19.5 5.8 14 15.9 3.9a2.1 2.1 0 0 1 3 0l1.2 1.2a2.1 2.1 0 0 1 0 3L10 18.2l-5.5 1.3Z" />
      <path d="m14.7 5.1 4.2 4.2" />
    </svg>
  );
}

function CalendarIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="3.5" y="5.5" width="17" height="15" rx="3" />
      <path d="M8 3.5v4M16 3.5v4M3.5 10h17" />
    </svg>
  );
}

function formatCount(count, forms) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} ${forms[2]}`;
  if (mod10 === 1) return `${count} ${forms[0]}`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} ${forms[1]}`;
  return `${count} ${forms[2]}`;
}

function formatRestDays(count) {
  if (count === 0) return 'следующая тренировка завтра';
  return `${formatCount(count, ['день', 'дня', 'дней'])} отдыха`;
}

function formatDate(dateString) {
  if (!dateString) return '';
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${dateString}T12:00:00`));
}

function localToday() {
  const today = new Date();
  return new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

function isAllowedStartDate(dateString, scheduleMode) {
  if (!dateString) return false;
  const allowed = WEEKLY_DAYS[scheduleMode];
  if (!allowed) return true;
  return allowed.includes(new Date(`${dateString}T12:00:00`).getDay());
}

function startDateHint(scheduleMode) {
  if (scheduleMode === 'weekly_mwf') return 'Выберите понедельник, среду или пятницу.';
  if (scheduleMode === 'weekly_tts') return 'Выберите вторник, четверг или субботу.';
  return '';
}

function daysUntilNextAllowed(currentWeekday, allowedDays) {
  for (let delta = 1; delta <= 7; delta += 1) {
    const candidate = (currentWeekday + delta) % 7;
    if (allowedDays.includes(candidate)) return delta;
  }
  return 7;
}

function participationLabel(participation) {
  if (!participation) return 'Не начата';
  if (participation.status === 'paused') return 'На паузе';
  if (participation.status === 'completed') return 'Завершена';
  if (participation.status === 'abandoned') return 'Остановлена';

  if (participation.startDate > localToday()) return `Старт ${formatDate(participation.startDate)}`;
  return 'Активна';
}

async function attachScheduledSnapshot(program) {
  if (!program?.participation || program.scheduledWorkouts.length === 0) return program;

  const scheduledWorkoutIds = program.scheduledWorkouts.map((workout) => workout.id);
  const { data: scheduledExercises, error: exercisesError } = await supabase
    .from('scheduled_workout_exercises')
    .select('id, scheduled_workout_id, exercise_id, position')
    .in('scheduled_workout_id', scheduledWorkoutIds)
    .order('position', { ascending: true });

  if (exercisesError) {
    console.error('Unable to load scheduled workout exercises:', exercisesError);
    throw new Error('Не удалось загрузить сохранённый состав тренировок.');
  }

  const rows = scheduledExercises ?? [];
  const scheduledExerciseIds = rows.map((row) => row.id);
  const exerciseIds = [...new Set(rows.map((row) => row.exercise_id))];

  let sets = [];
  if (scheduledExerciseIds.length > 0) {
    const response = await supabase
      .from('scheduled_sets')
      .select('id, scheduled_workout_exercise_id, set_number, planned_reps')
      .in('scheduled_workout_exercise_id', scheduledExerciseIds)
      .order('set_number', { ascending: true });

    if (response.error) {
      console.error('Unable to load scheduled sets:', response.error);
      throw new Error('Не удалось загрузить сохранённые подходы программы.');
    }
    sets = response.data ?? [];
  }

  let exercises = [];
  if (exerciseIds.length > 0) {
    const response = await supabase
      .from('exercises')
      .select('id, name, muscle_group, movement_type, difficulty')
      .in('id', exerciseIds);

    if (response.error) {
      console.error('Unable to load scheduled exercise names:', response.error);
      throw new Error('Не удалось загрузить данные упражнений программы.');
    }
    exercises = response.data ?? [];
  }

  const exerciseById = new Map(exercises.map((exercise) => [exercise.id, exercise]));
  const setsByScheduledExercise = new Map();
  sets.forEach((set) => {
    const list = setsByScheduledExercise.get(set.scheduled_workout_exercise_id) ?? [];
    list.push({ id: set.id, reps: set.planned_reps ?? '' });
    setsByScheduledExercise.set(set.scheduled_workout_exercise_id, list);
  });

  const exercisesByWorkout = new Map();
  rows.forEach((row) => {
    const exercise = exerciseById.get(row.exercise_id) ?? {};
    const list = exercisesByWorkout.get(row.scheduled_workout_id) ?? [];
    list.push({
      id: row.exercise_id,
      name: exercise.name ?? 'Упражнение',
      muscle_group: exercise.muscle_group ?? '',
      movement_type: exercise.movement_type ?? '',
      difficulty: exercise.difficulty ?? null,
      sets: setsByScheduledExercise.get(row.id) ?? [],
    });
    exercisesByWorkout.set(row.scheduled_workout_id, list);
  });

  return {
    ...program,
    scheduledWorkouts: program.scheduledWorkouts.map((workout) => ({
      ...workout,
      exercises: exercisesByWorkout.get(workout.id) ?? [],
    })),
  };
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
    const data = await getProgram(programId);
    const hydratedProgram = await attachScheduledSnapshot(data);
    setProgram(hydratedProgram);
    setStartDateDraft(hydratedProgram.participation?.startDate ?? '');
    return hydratedProgram;
  }

  useEffect(() => {
    let active = true;

    async function loadProgram() {
      setLoading(true);
      setError('');

      try {
        const data = await getProgram(programId);
        const hydratedProgram = await attachScheduledSnapshot(data);
        if (active) {
          setProgram(hydratedProgram);
          setStartDateDraft(hydratedProgram.participation?.startDate ?? '');
        }
      } catch (requestError) {
        if (!active) return;
        console.error('Unable to open program details:', requestError);
        setError(requestError?.message || 'Не удалось открыть программу.');
      } finally {
        if (active) setLoading(false);
      }
    }

    loadProgram();
    return () => {
      active = false;
    };
  }, [programId]);

  const templateWorkouts = useMemo(() => {
    if (!program) return [];
    return program.programWeeks.flatMap((week) => week.workouts.map((workout) => ({
      weekNumber: week.number,
      workout,
    })));
  }, [program]);

  const schedule = useMemo(() => {
    if (!program) return [];

    if (program.participation && program.scheduledWorkouts.length > 0) {
      return program.scheduledWorkouts.map((scheduled) => ({
        weekNumber: scheduled.weekNumber,
        day: null,
        date: scheduled.scheduledDate,
        weekday: null,
        workout: {
          id: scheduled.id,
          name: scheduled.workoutName,
          exercises: scheduled.exercises ?? [],
          restDaysAfter: 0,
        },
      }));
    }

    const allowedDays = WEEKLY_DAYS[program.scheduleMode];
    if (allowedDays) {
      let day = 1;
      let weekday = allowedDays[0];

      return templateWorkouts.map((item, index) => {
        const scheduled = { ...item, day, date: null, weekday };
        if (index < templateWorkouts.length - 1) {
          const delta = daysUntilNextAllowed(weekday, allowedDays);
          day += delta;
          weekday = (weekday + delta) % 7;
        }
        return scheduled;
      });
    }

    let day = 1;
    return templateWorkouts.map((item, index) => {
      const scheduled = { ...item, day, date: null, weekday: null };
      if (index < templateWorkouts.length - 1) {
        day += 1 + Number(item.workout.restDaysAfter ?? 1);
      }
      return scheduled;
    });
  }, [program, templateWorkouts]);

  if (loading) {
    return (
      <div className="phone program-detail-phone">
        <div className="program-detail-state">
          <div className="exercise-list-spinner" aria-hidden="true" />
          <span>Загружаем программу…</span>
        </div>
      </div>
    );
  }

  if (error || !program) {
    return (
      <div className="phone program-detail-phone">
        <header className="program-detail-header">
          <button type="button" aria-label="Назад" onClick={onBack}><BackIcon /></button>
          <strong>Программа</strong>
          <span />
        </header>
        <div className="program-detail-state error">{error || 'Программа не найдена.'}</div>
      </div>
    );
  }

  const totalWorkouts = templateWorkouts.length;
  const totalExercises = program.programWeeks.reduce(
    (sum, week) => sum + week.workouts.reduce((weekSum, workout) => weekSum + workout.exercises.length, 0),
    0,
  );
  const participation = program.participation;
  const canStart = !participation || ['completed', 'abandoned'].includes(participation.status);
  const canEditStartDate = Boolean(
    participation
    && ['active', 'paused'].includes(participation.status)
    && program.scheduledWorkouts.length > 0
    && program.scheduledWorkouts.every((workout) => workout.status === 'scheduled'),
  );
  const weeklyMode = Boolean(WEEKLY_DAYS[program.scheduleMode]);
  const dateAllowed = isAllowedStartDate(startDateDraft, program.scheduleMode);
  const dateChanged = startDateDraft && startDateDraft !== participation?.startDate;

  async function saveStartDate() {
    if (!canEditStartDate || startDateSaving || !dateChanged) return;
    if (startDateDraft < localToday()) {
      setStartDateError('Дата начала не может быть в прошлом.');
      return;
    }
    if (!dateAllowed) {
      setStartDateError(startDateHint(program.scheduleMode));
      return;
    }

    setStartDateSaving(true);
    setStartDateError('');
    try {
      const { error: changeError } = await supabase.rpc('change_program_start_date', {
        p_user_program_id: participation.id,
        p_start_date: startDateDraft,
      });
      if (changeError) throw changeError;
      await reloadProgram();
      setEditingStartDate(false);
    } catch (changeError) {
      console.error('Unable to change program start date:', changeError);
      if (changeError?.message?.includes('already started') || changeError?.message?.includes('workout history')) {
        setStartDateError('Программа уже фактически началась. Дату начала больше нельзя изменить.');
      } else if (changeError?.message?.includes('Monday, Wednesday or Friday')) {
        setStartDateError('Выберите понедельник, среду или пятницу.');
      } else if (changeError?.message?.includes('Tuesday, Thursday or Saturday')) {
        setStartDateError('Выберите вторник, четверг или субботу.');
      } else {
        setStartDateError('Не удалось изменить дату начала. Попробуйте ещё раз.');
      }
    } finally {
      setStartDateSaving(false);
    }
  }

  return (
    <div className="phone program-detail-phone">
      <header className="program-detail-header">
        <button type="button" aria-label="Назад к моим программам" onClick={onBack}><BackIcon /></button>
        <strong>Моя программа</strong>
        <span />
      </header>

      <main className="program-detail-content">
        {program.coverUrl && (
          <div className="program-detail-cover">
            <img src={program.coverUrl} alt="" />
          </div>
        )}

        <section className="program-detail-hero">
          <span>Тренировочная программа</span>
          <h1>{program.name}</h1>
          {program.description && <p>{program.description}</p>}
          {program.categories.length > 0 && (
            <div className="program-detail-tags">
              {program.categories.map((category) => <span key={category}>{category}</span>)}
            </div>
          )}
        </section>

        <section className={`program-detail-start-state${canStart ? ' not-started' : ' joined'}`}>
          <span className="program-detail-status-badge">{participationLabel(participation)}</span>
          {canStart ? (
            <>
              <strong>Начните, когда будете готовы</strong>
              <p>Программа уже сохранена. Дату первой тренировки и присоединения можно выбрать позже — расписание создастся только после подтверждения даты.</p>
            </>
          ) : (
            <>
              <strong>Вы присоединились к программе</strong>
              <p>Первая тренировка запланирована на {formatDate(participation.startDate)}. Ниже показан ваш персональный календарь.</p>

              {canEditStartDate && !editingStartDate && (
                <button
                  type="button"
                  onClick={() => {
                    setStartDateDraft(participation.startDate);
                    setStartDateError('');
                    setEditingStartDate(true);
                  }}
                  style={{
                    marginTop: '10px',
                    minHeight: '42px',
                    padding: '0 14px',
                    border: '1px solid var(--line)',
                    borderRadius: '13px',
                    background: 'var(--surface)',
                    color: 'var(--ink)',
                    font: 'inherit',
                    fontSize: '11px',
                    fontWeight: 800,
                  }}
                >
                  Изменить дату начала
                </button>
              )}

              {canEditStartDate && editingStartDate && (
                <div
                  style={{
                    marginTop: '12px',
                    padding: '12px',
                    borderRadius: '14px',
                    background: 'var(--surface)',
                    display: 'grid',
                    gap: '9px',
                  }}
                >
                  <label style={{ display: 'grid', gap: '6px' }}>
                    <span style={{ fontSize: '9px', fontWeight: 800, color: 'var(--muted)', textTransform: 'uppercase' }}>
                      Новая дата первой тренировки
                    </span>
                    <input
                      type="date"
                      min={localToday()}
                      value={startDateDraft}
                      onChange={(event) => {
                        setStartDateDraft(event.target.value);
                        setStartDateError('');
                      }}
                      disabled={startDateSaving}
                      style={{
                        width: '100%',
                        minHeight: '46px',
                        padding: '0 11px',
                        border: '1px solid var(--line)',
                        borderRadius: '12px',
                        background: '#fafaf8',
                        color: 'var(--ink)',
                        font: 'inherit',
                        fontSize: '12px',
                        fontWeight: 760,
                      }}
                    />
                  </label>
                  {startDateHint(program.scheduleMode) && (
                    <span style={{ fontSize: '9px', lineHeight: 1.4, color: dateAllowed ? 'var(--muted)' : '#9a3434' }}>
                      {startDateHint(program.scheduleMode)}
                    </span>
                  )}
                  {startDateError && (
                    <span style={{ fontSize: '9px', lineHeight: 1.4, color: '#9a3434' }}>{startDateError}</span>
                  )}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                    <button
                      type="button"
                      onClick={() => {
                        setEditingStartDate(false);
                        setStartDateDraft(participation.startDate);
                        setStartDateError('');
                      }}
                      disabled={startDateSaving}
                      style={{
                        minHeight: '42px',
                        border: '1px solid var(--line)',
                        borderRadius: '12px',
                        background: 'transparent',
                        color: 'var(--ink)',
                        font: 'inherit',
                        fontSize: '10px',
                        fontWeight: 800,
                      }}
                    >
                      Отмена
                    </button>
                    <button
                      type="button"
                      onClick={saveStartDate}
                      disabled={startDateSaving || !dateChanged || !dateAllowed}
                      style={{
                        minHeight: '42px',
                        border: 0,
                        borderRadius: '12px',
                        background: startDateSaving || !dateChanged || !dateAllowed ? '#d7d7d2' : 'var(--ink)',
                        color: startDateSaving || !dateChanged || !dateAllowed ? '#999992' : '#fff',
                        font: 'inherit',
                        fontSize: '10px',
                        fontWeight: 820,
                      }}
                    >
                      {startDateSaving ? 'Сохраняем…' : 'Сохранить'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </section>

        <section className="program-detail-stats">
          <div><span>Недель</span><strong>{program.weekCount}</strong></div>
          <div><span>Тренировок</span><strong>{totalWorkouts}</strong></div>
          <div><span>Упражнений</span><strong>{totalExercises}</strong></div>
        </section>

        {(program.trainingPlace || program.equipment || program.level) && (
          <section className="program-detail-meta-card">
            {program.trainingPlace && <div><span>Место</span><strong>{program.trainingPlace}</strong></div>}
            {program.equipment && <div><span>Оборудование</span><strong>{program.equipment}</strong></div>}
            {program.level && <div><span>Уровень</span><strong>{program.level}</strong></div>}
          </section>
        )}

        <section className="program-detail-section">
          <div className="program-detail-section-head">
            <span>{participation ? 'Календарь' : 'Ритм'}</span>
            <h2>{participation ? 'Запланированные тренировки' : 'Последовательность тренировок'}</h2>
          </div>

          <div className="program-detail-schedule">
            {schedule.map((item, index) => (
              <article key={item.workout.id}>
                <div className="program-detail-day">
                  {item.date
                    ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(`${item.date}T12:00:00`))
                    : (item.weekday !== null ? WEEKDAY_SHORT[item.weekday] : `День ${item.day}`)}
                </div>
                <div className="program-detail-workout-copy">
                  <small>Неделя {item.weekNumber}</small>
                  <strong>{item.workout.name}</strong>
                  <span>{formatCount(item.workout.exercises.length, ['упражнение', 'упражнения', 'упражнений'])}</span>
                </div>
                {!participation && index < schedule.length - 1 && (
                  <div className="program-detail-rest">
                    {weeklyMode
                      ? `Следующая — ${WEEKDAY_SHORT[schedule[index + 1].weekday]}`
                      : formatRestDays(Number(item.workout.restDaysAfter ?? 1))}
                  </div>
                )}
              </article>
            ))}
          </div>
        </section>

        <section className="program-detail-section">
          <div className="program-detail-section-head">
            <span>Структура</span>
            <h2>Недели и упражнения</h2>
          </div>

          <div className="program-detail-weeks">
            {program.programWeeks.map((week) => (
              <section key={week.id}>
                <header>
                  <strong>Неделя {week.number}</strong>
                  <span>{formatCount(week.workouts.length, ['тренировка', 'тренировки', 'тренировок'])}</span>
                </header>
                {week.workouts.map((workout) => (
                  <div className="program-detail-week-workout" key={workout.id}>
                    <strong>{workout.name}</strong>
                    <span>{workout.exercises.map((exercise) => exercise.name).join(' · ')}</span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        </section>
      </main>

      <footer className={`program-detail-footer${canStart ? ' two-actions' : ''}`}>
        {canStart && (
          <button className="program-detail-start-button" type="button" onClick={() => onStart?.(program.id)}>
            <CalendarIcon />
            <span>{participation ? 'Начать программу заново' : 'Начать программу'}</span>
          </button>
        )}
        <button className="program-detail-edit-button" type="button" onClick={() => onEdit?.(program.id)}>
          <PencilIcon />
          <span>Редактировать программу</span>
        </button>
      </footer>
    </div>
  );
}
