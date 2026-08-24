import { useMemo } from 'react';
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

export function CreateProgramScheduleScreen({
  programName,
  programWeeks,
  onProgramWeeksChange,
  onBack,
  onSave,
  saving,
  saveError,
  isEditing = false,
}) {
  const workouts = useMemo(() => flattenWorkouts(programWeeks), [programWeeks]);

  const schedule = useMemo(() => {
    let day = 1;
    return workouts.map((item, index) => {
      const scheduled = { ...item, day };
      if (index < workouts.length - 1) {
        day += 1 + Number(item.workout.restDaysAfter ?? 1);
      }
      return scheduled;
    });
  }, [workouts]);

  const durationDays = schedule.at(-1)?.day ?? 0;

  function updateRestDays(weekId, workoutId, nextValue) {
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

  return (
    <div className="phone create-program-phone program-schedule-phone">
      <header className="create-program-header">
        <button className="create-program-back" type="button" aria-label="Назад к структуре" onClick={onBack} disabled={saving}>
          <BackIcon />
        </button>
        <strong>{isEditing ? 'Редактировать программу' : 'Создать программу'}</strong>
        <span className="create-program-header-spacer" />
      </header>

      <main className="create-program-content program-schedule-content">
        <section className="create-program-intro program-schedule-intro">
          <span>Шаг 3</span>
          <h1>Ритм тренировок</h1>
          <p>
            Укажите, сколько полных дней отдыха должно пройти после каждой тренировки.
            Если поставить 0, следующая тренировка будет уже на следующий день.
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

        <section className="program-schedule-section">
          <div className="program-schedule-section-head">
            <div>
              <span>Точная настройка</span>
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
                    <span className="program-schedule-day">День {item.day}</span>
                    <div>
                      <small>Неделя {item.weekNumber}</small>
                      <strong>{item.workout.name}</strong>
                    </div>
                  </div>

                  {!isLast ? (
                    <div className="program-schedule-rest">
                      <div>
                        <span>После тренировки</span>
                        <strong>{restDays === 0 ? 'Без дня отдыха' : formatDays(restDays)}</strong>
                      </div>
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
                    </div>
                  ) : (
                    <div className="program-schedule-finish">Финиш программы</div>
                  )}
                </article>
              );
            })}
          </div>
        </section>

        {saveError && (
          <div className="program-schedule-error" role="alert">{saveError}</div>
        )}
      </main>

      <footer className="create-program-footer program-schedule-footer">
        <button className="create-program-next" type="button" onClick={onSave} disabled={saving || workouts.length === 0}>
          {saving ? 'Сохраняем…' : (isEditing ? 'Сохранить изменения' : 'Создать программу')}
        </button>
      </footer>
    </div>
  );
}
