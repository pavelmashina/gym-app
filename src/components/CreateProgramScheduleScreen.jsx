import { useMemo, useState } from 'react';
import '../create-program-schedule.css';

const PRESETS = [
  { id: '1-1', label: 'Через день', trainBlock: 1, restDays: 1 },
  { id: '2-1', label: '2 трен. / 1 отдых', trainBlock: 2, restDays: 1 },
  { id: '2-2', label: '2 трен. / 2 отдыха', trainBlock: 2, restDays: 2 },
  { id: '3-1', label: '3 трен. / 1 отдых', trainBlock: 3, restDays: 1 },
];

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

function MinusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M6 12h12" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 6v12M6 12h12" />
    </svg>
  );
}

function formatDays(count) {
  const mod100 = count % 100;
  const mod10 = count % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${count} дней`;
  if (mod10 === 1) return `${count} день`;
  if (mod10 >= 2 && mod10 <= 4) return `${count} дня`;
  return `${count} дней`;
}

function formatDuration(days) {
  if (days < 7) return formatDays(days);
  const weeks = Math.floor(days / 7);
  const remainder = days % 7;
  if (remainder === 0) return `${weeks} нед.`;
  return `${weeks} нед. ${formatDays(remainder)}`;
}

function flattenWorkouts(programWeeks) {
  return programWeeks.flatMap((week) => week.workouts.map((workout) => ({
    weekId: week.id,
    weekNumber: week.number,
    workoutId: workout.id,
    workout,
  })));
}

function localInputDate(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T12:00:00`);
  date.setDate(date.getDate() + days);
  return localInputDate(date);
}

function formatCalendarDate(dateString) {
  if (!dateString) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(`${dateString}T12:00:00`));
}

export function CreateProgramScheduleScreen({
  programName,
  programWeeks,
  onProgramWeeksChange,
  onBack,
  onAction,
  saving,
  savingAction,
  saveError,
  isEditing = false,
  launchOnly = false,
}) {
  const [startDate, setStartDate] = useState('');
  const workouts = useMemo(() => flattenWorkouts(programWeeks), [programWeeks]);
  const canEditRhythm = !launchOnly;
  const showStartChoice = !isEditing || launchOnly;

  const schedule = useMemo(() => {
    let day = 1;
    return workouts.map((item, index) => {
      const scheduled = {
        ...item,
        day,
        date: startDate ? addDays(startDate, day - 1) : null,
      };
      if (index < workouts.length - 1) {
        day += 1 + Number(item.workout.restDaysAfter ?? 1);
      }
      return scheduled;
    });
  }, [workouts, startDate]);

  const durationDays = schedule.at(-1)?.day ?? 0;

  function updateRestDays(weekId, workoutId, nextValue) {
    if (!canEditRhythm) return;
    const normalized = Math.max(0, Math.min(30, Number(nextValue) || 0));
    onProgramWeeksChange((current) => current.map((week) => (
      week.id !== weekId
        ? week
        : {
            ...week,
            workouts: week.workouts.map((workout) => (
              workout.id === workoutId
                ? { ...workout, restDaysAfter: normalized }
                : workout
            )),
          }
    )));
  }

  function applyPreset(trainBlock, restDays) {
    if (!canEditRhythm) return;
    let globalIndex = 0;
    const lastIndex = workouts.length - 1;

    onProgramWeeksChange((current) => current.map((week) => ({
      ...week,
      workouts: week.workouts.map((workout) => {
        const isLast = globalIndex === lastIndex;
        const closesTrainingBlock = (globalIndex + 1) % trainBlock === 0;
        const nextRestDays = isLast ? 0 : (closesTrainingBlock ? restDays : 0);
        globalIndex += 1;
        return { ...workout, restDaysAfter: nextRestDays };
      }),
    })));
  }

  const headerTitle = launchOnly
    ? 'Начать программу'
    : (isEditing ? 'Редактировать программу' : 'Создать программу');

  return (
    <div className="phone create-program-phone program-schedule-phone">
      <header className="create-program-header">
        <button className="create-program-back" type="button" aria-label="Назад" onClick={onBack} disabled={saving}>
          <BackIcon />
        </button>
        <strong>{headerTitle}</strong>
        <span className="create-program-header-spacer" />
      </header>

      <main className="create-program-content program-schedule-content">
        <section className="create-program-intro program-schedule-intro">
          <span>Шаг 3</span>
          <h1>{launchOnly ? 'Дата начала программы' : 'Расписание и запуск'}</h1>
          <p>
            {launchOnly
              ? 'Проверьте ритм программы и выберите дату первой тренировки. После присоединения мы создадим календарь тренировок.'
              : 'Настройте интервалы между тренировками. Дату начала можно выбрать сейчас или присоединиться к программе позже.'}
          </p>
        </section>

        <section className="program-schedule-summary">
          <div>
            <span>Программа</span>
            <strong>{programName}</strong>
          </div>
          <div className="program-schedule-summary-grid">
            <div>
              <span>Тренировок</span>
              <strong>{workouts.length}</strong>
            </div>
            <div>
              <span>Расчётная длительность</span>
              <strong>{formatDuration(durationDays)}</strong>
            </div>
          </div>
        </section>

        {canEditRhythm && (
          <section className="program-schedule-section">
            <div className="program-schedule-section-head">
              <div>
                <span>Быстрая настройка</span>
                <h2>Выберите готовый ритм</h2>
              </div>
            </div>

            <div className="program-schedule-presets">
              {PRESETS.map((preset) => (
                <button
                  type="button"
                  key={preset.id}
                  onClick={() => applyPreset(preset.trainBlock, preset.restDays)}
                  disabled={saving}
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <p className="program-schedule-hint">
              Например, «2 трен. / 2 отдыха»: две тренировки идут в соседние дни, затем два полных дня отдыха.
            </p>
          </section>
        )}

        <section className="program-schedule-section">
          <div className="program-schedule-section-head">
            <div>
              <span>{canEditRhythm ? 'Точная настройка' : 'Ритм программы'}</span>
              <h2>Интервалы между тренировками</h2>
            </div>
          </div>

          <div className="program-schedule-list">
            {schedule.map((item, index) => {
              const isLast = index === schedule.length - 1;
              const restDays = Number(item.workout.restDaysAfter ?? 1);

              return (
                <article className="program-schedule-item" key={`${item.weekId}:${item.workoutId}`}>
                  <div className="program-schedule-workout">
                    <span className="program-schedule-day">
                      {item.date ? formatCalendarDate(item.date) : `День ${item.day}`}
                    </span>
                    <div>
                      <small>Неделя {item.weekNumber}{item.date ? ` · день ${item.day}` : ''}</small>
                      <strong>{item.workout.name}</strong>
                    </div>
                  </div>

                  {!isLast ? (
                    <div className="program-schedule-rest">
                      <div>
                        <span>После тренировки</span>
                        <strong>{restDays === 0 ? 'Без дня отдыха' : formatDays(restDays)}</strong>
                      </div>
                      {canEditRhythm && (
                        <div className="program-schedule-stepper" aria-label={`Дни отдыха после ${item.workout.name}`}>
                          <button
                            type="button"
                            onClick={() => updateRestDays(item.weekId, item.workoutId, restDays - 1)}
                            disabled={saving || restDays <= 0}
                            aria-label="Уменьшить дни отдыха"
                          >
                            <MinusIcon />
                          </button>
                          <output>{restDays}</output>
                          <button
                            type="button"
                            onClick={() => updateRestDays(item.weekId, item.workoutId, restDays + 1)}
                            disabled={saving || restDays >= 30}
                            aria-label="Увеличить дни отдыха"
                          >
                            <PlusIcon />
                          </button>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="program-schedule-finish">Финиш программы</div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {showStartChoice && (
          <section className="program-schedule-section program-start-section">
            <div className="program-schedule-section-head">
              <div>
                <span>Запуск программы</span>
                <h2>Дата первой тренировки</h2>
              </div>
            </div>

            <div className="program-start-card">
              <label className="program-start-date-field">
                <span>Дата начала</span>
                <input
                  type="date"
                  min={localInputDate()}
                  value={startDate}
                  onChange={(event) => setStartDate(event.target.value)}
                  disabled={saving}
                />
              </label>

              {startDate ? (
                <div className="program-start-preview">
                  <span>Первая тренировка</span>
                  <strong>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(`${startDate}T12:00:00`))}</strong>
                  <small>После присоединения все тренировки появятся в вашем персональном расписании.</small>
                </div>
              ) : (
                <div className="program-start-later-note">
                  <strong>Можно начать позже</strong>
                  <span>Дата не обязательна. Программа сохранится в «Мои программы» со статусом «Не начата», и вы сможете выбрать дату присоединения позже.</span>
                </div>
              )}
            </div>
          </section>
        )}

        {saveError && (
          <div className="program-schedule-error" role="alert">{saveError}</div>
        )}
      </main>

      <footer className={`create-program-footer program-schedule-footer${!isEditing && !launchOnly ? ' dual' : ''}`}>
        {launchOnly ? (
          <button
            className="create-program-next"
            type="button"
            onClick={() => onAction('start', startDate)}
            disabled={saving || workouts.length === 0 || !startDate}
          >
            {savingAction === 'start' ? 'Присоединяем…' : 'Присоединиться к программе'}
          </button>
        ) : isEditing ? (
          <button
            className="create-program-next"
            type="button"
            onClick={() => onAction('save')}
            disabled={saving || workouts.length === 0}
          >
            {savingAction === 'save' ? 'Сохраняем…' : 'Сохранить изменения'}
          </button>
        ) : (
          <>
            <button
              className="program-save-later"
              type="button"
              onClick={() => onAction('later')}
              disabled={saving || workouts.length === 0}
            >
              {savingAction === 'later' ? 'Сохраняем…' : 'Сохранить и начать позже'}
            </button>
            <button
              className="create-program-next"
              type="button"
              onClick={() => onAction('start', startDate)}
              disabled={saving || workouts.length === 0 || !startDate}
            >
              {savingAction === 'start' ? 'Сохраняем и присоединяем…' : 'Сохранить и присоединиться'}
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
