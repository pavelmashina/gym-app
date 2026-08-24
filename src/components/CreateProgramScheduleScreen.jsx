import { useMemo, useState } from 'react';
import '../create-program-schedule.css';

const PRESETS = [
  {
    id: 'custom',
    label: 'Выбрать самому',
    description: 'Настройте количество полных дней отдыха после каждой тренировки вручную.',
  },
  {
    id: 'weekly_mwf',
    label: '3 раза / нед',
    sublabel: 'Пн · Ср · Пт',
    description: 'Тренировки всегда ставятся на понедельник, среду и пятницу.',
  },
  {
    id: 'weekly_tts',
    label: '3 раза / нед',
    sublabel: 'Вт · Чт · Сб',
    description: 'Тренировки всегда ставятся на вторник, четверг и субботу.',
  },
  {
    id: 'cycle_2_2',
    label: '2 тренировки',
    sublabel: '2 дня отдыха',
    description: 'Две тренировки идут подряд, затем два полных дня отдыха, после чего цикл повторяется.',
  },
];

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

function parseLocalDate(dateString) {
  return new Date(`${dateString}T12:00:00`);
}

function addDays(dateString, days) {
  const date = parseLocalDate(dateString);
  date.setDate(date.getDate() + days);
  return localInputDate(date);
}

function formatCalendarDate(dateString) {
  if (!dateString) return null;
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(parseLocalDate(dateString));
}

function daysUntilNextAllowed(currentWeekday, allowedDays) {
  for (let delta = 1; delta <= 7; delta += 1) {
    const candidate = (currentWeekday + delta) % 7;
    if (allowedDays.includes(candidate)) return delta;
  }
  return 7;
}

function isAllowedStartDate(startDate, scheduleMode) {
  if (!startDate) return true;
  const allowedDays = WEEKLY_DAYS[scheduleMode];
  if (!allowedDays) return true;
  return allowedDays.includes(parseLocalDate(startDate).getDay());
}

function scheduleModeStartHint(scheduleMode) {
  if (scheduleMode === 'weekly_mwf') return 'Первая тренировка должна быть в понедельник, среду или пятницу.';
  if (scheduleMode === 'weekly_tts') return 'Первая тренировка должна быть во вторник, четверг или субботу.';
  return null;
}

export function CreateProgramScheduleScreen({
  programName,
  programWeeks,
  onProgramWeeksChange,
  scheduleMode = 'custom',
  onScheduleModeChange,
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
  const canChangePreset = !launchOnly;
  const canEditIntervals = !launchOnly && scheduleMode === 'custom';
  const showStartChoice = !isEditing || launchOnly;
  const startDateAllowed = isAllowedStartDate(startDate, scheduleMode);
  const selectedPreset = PRESETS.find((preset) => preset.id === scheduleMode) ?? PRESETS[0];

  const schedule = useMemo(() => {
    const allowedDays = WEEKLY_DAYS[scheduleMode];

    if (allowedDays) {
      let day = 1;
      let virtualWeekday = startDate ? parseLocalDate(startDate).getDay() : allowedDays[0];
      let currentDate = startDate || null;

      return workouts.map((item, index) => {
        const scheduled = {
          ...item,
          day,
          date: currentDate,
          weekday: virtualWeekday,
        };

        if (index < workouts.length - 1) {
          const delta = daysUntilNextAllowed(virtualWeekday, allowedDays);
          day += delta;
          virtualWeekday = (virtualWeekday + delta) % 7;
          if (currentDate) currentDate = addDays(currentDate, delta);
        }

        return scheduled;
      });
    }

    let day = 1;
    return workouts.map((item, index) => {
      const scheduled = {
        ...item,
        day,
        date: startDate ? addDays(startDate, day - 1) : null,
        weekday: startDate ? parseLocalDate(addDays(startDate, day - 1)).getDay() : null,
      };
      if (index < workouts.length - 1) {
        day += 1 + Number(item.workout.restDaysAfter ?? 1);
      }
      return scheduled;
    });
  }, [workouts, startDate, scheduleMode]);

  const durationDays = schedule.at(-1)?.day ?? 0;

  function updateRestDays(weekId, workoutId, nextValue) {
    if (!canEditIntervals) return;
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

  function applyTwoOnTwoPattern() {
    let globalIndex = 0;
    const lastIndex = workouts.length - 1;

    onProgramWeeksChange((current) => current.map((week) => ({
      ...week,
      workouts: week.workouts.map((workout) => {
        const isLast = globalIndex === lastIndex;
        const closesTrainingPair = (globalIndex + 1) % 2 === 0;
        const nextRestDays = isLast ? 0 : (closesTrainingPair ? 2 : 0);
        globalIndex += 1;
        return { ...workout, restDaysAfter: nextRestDays };
      }),
    })));
  }

  function selectPreset(presetId) {
    if (!canChangePreset || saving) return;
    onScheduleModeChange?.(presetId);
    if (presetId === 'cycle_2_2') applyTwoOnTwoPattern();
  }

  const headerTitle = launchOnly
    ? 'Начать программу'
    : (isEditing ? 'Редактировать программу' : 'Создать программу');

  const startHint = scheduleModeStartHint(scheduleMode);
  const canStart = Boolean(startDate) && startDateAllowed && workouts.length > 0 && !saving;

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
              : 'Выберите готовый ритм или настройте интервалы самостоятельно. Дату начала можно выбрать сейчас или позже.'}
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

        <section className="program-schedule-section">
          <div className="program-schedule-section-head">
            <div>
              <span>{canChangePreset ? 'Ритм тренировок' : 'Выбранный ритм'}</span>
              <h2>{canChangePreset ? 'Как распределить тренировки' : selectedPreset.label}</h2>
            </div>
          </div>

          {canChangePreset ? (
            <div className="program-schedule-presets">
              {PRESETS.map((preset) => {
                const selected = preset.id === scheduleMode;
                return (
                  <button
                    className={selected ? 'selected' : ''}
                    type="button"
                    key={preset.id}
                    onClick={() => selectPreset(preset.id)}
                    disabled={saving}
                    aria-pressed={selected}
                  >
                    <strong>{preset.label}</strong>
                    {preset.sublabel && <span>{preset.sublabel}</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="program-selected-rhythm">
              <strong>{selectedPreset.label}</strong>
              {selectedPreset.sublabel && <span>{selectedPreset.sublabel}</span>}
            </div>
          )}

          <p className="program-schedule-hint">{selectedPreset.description}</p>
        </section>

        <section className="program-schedule-section">
          <div className="program-schedule-section-head">
            <div>
              <span>{canEditIntervals ? 'Точная настройка' : 'Предпросмотр'}</span>
              <h2>{canEditIntervals ? 'Интервалы между тренировками' : 'Дни тренировок'}</h2>
            </div>
          </div>

          <div className="program-schedule-list">
            {schedule.map((item, index) => {
              const isLast = index === schedule.length - 1;
              const restDays = Number(item.workout.restDaysAfter ?? 1);
              const nextItem = schedule[index + 1];
              const weeklyMode = Boolean(WEEKLY_DAYS[scheduleMode]);

              return (
                <article className="program-schedule-item" key={`${item.weekId}:${item.workoutId}`}>
                  <div className="program-schedule-workout">
                    <span className="program-schedule-day">
                      {item.date
                        ? formatCalendarDate(item.date)
                        : (weeklyMode ? WEEKDAY_SHORT[item.weekday] : `День ${item.day}`)}
                    </span>
                    <div>
                      <small>
                        Неделя {item.weekNumber}
                        {item.date ? ` · ${WEEKDAY_SHORT[item.weekday]}` : (weeklyMode ? ` · день ${item.day}` : '')}
                      </small>
                      <strong>{item.workout.name}</strong>
                    </div>
                  </div>

                  {!isLast ? (
                    <div className="program-schedule-rest">
                      <div>
                        <span>{weeklyMode ? 'Следующая тренировка' : 'После тренировки'}</span>
                        <strong>
                          {weeklyMode
                            ? `${WEEKDAY_SHORT[nextItem.weekday]} · через ${formatDays(nextItem.day - item.day)}`
                            : (restDays === 0 ? 'Без дня отдыха' : formatDays(restDays))}
                        </strong>
                      </div>
                      {canEditIntervals && (
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

              {startHint && (
                <div className={`program-start-weekday-note${startDate && !startDateAllowed ? ' invalid' : ''}`}>
                  {startDate && !startDateAllowed
                    ? `Эта дата не подходит. ${startHint}`
                    : startHint}
                </div>
              )}

              {startDate && startDateAllowed ? (
                <div className="program-start-preview">
                  <span>Первая тренировка</span>
                  <strong>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(parseLocalDate(startDate))}</strong>
                  <small>После присоединения все тренировки появятся в вашем персональном расписании и календаре.</small>
                </div>
              ) : !startDate ? (
                <div className="program-start-later-note">
                  <strong>Можно начать позже</strong>
                  <span>Дата не обязательна. Программа сохранится в «Мои программы» со статусом «Не начата», и вы сможете выбрать дату присоединения позже.</span>
                </div>
              ) : null}
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
            disabled={!canStart}
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
              disabled={!canStart}
            >
              {savingAction === 'start' ? 'Сохраняем и присоединяем…' : 'Сохранить и присоединиться'}
            </button>
          </>
        )}
      </footer>
    </div>
  );
}
