import { useEffect, useMemo, useState } from 'react';
import { getProgram } from '../lib/programs.js';
import '../program-detail.css';

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

function participationLabel(participation) {
  if (!participation) return 'Не начата';
  if (participation.status === 'paused') return 'На паузе';
  if (participation.status === 'completed') return 'Завершена';
  if (participation.status === 'abandoned') return 'Остановлена';

  const today = new Date();
  const localToday = new Date(today.getTime() - today.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  if (participation.startDate > localToday) return `Старт ${formatDate(participation.startDate)}`;
  return 'Активна';
}

export function ProgramDetailScreen({ programId, onBack, onEdit, onStart }) {
  const [program, setProgram] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    async function loadProgram() {
      setLoading(true);
      setError('');

      try {
        const data = await getProgram(programId);
        if (active) setProgram(data);
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
      return program.scheduledWorkouts.map((scheduled, index) => {
        const template = templateWorkouts[index];
        return {
          weekNumber: scheduled.weekNumber,
          day: null,
          date: scheduled.scheduledDate,
          workout: {
            id: scheduled.id,
            name: scheduled.workoutName,
            exercises: template?.workout?.exercises ?? [],
            restDaysAfter: template?.workout?.restDaysAfter ?? 0,
          },
        };
      });
    }

    let day = 1;
    return templateWorkouts.map((item, index) => {
      const scheduled = { ...item, day, date: null };
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
                    : `День ${item.day}`}
                </div>
                <div className="program-detail-workout-copy">
                  <small>Неделя {item.weekNumber}</small>
                  <strong>{item.workout.name}</strong>
                  <span>{formatCount(item.workout.exercises.length, ['упражнение', 'упражнения', 'упражнений'])}</span>
                </div>
                {!participation && index < schedule.length - 1 && (
                  <div className="program-detail-rest">{formatRestDays(Number(item.workout.restDaysAfter ?? 1))}</div>
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
