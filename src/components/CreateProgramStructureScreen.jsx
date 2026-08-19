import '../create-program-step2.css';

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M5 7h14M9 7V4h6v3M8 10v7M12 10v7M16 10v7M7 7l1 13h8l1-13" />
    </svg>
  );
}

function formatWorkoutCount(count) {
  if (count === 1) return '1 тренировка';
  if (count >= 2 && count <= 4) return `${count} тренировки`;
  return `${count} тренировок`;
}

export function CreateProgramStructureScreen({
  programName,
  weeks,
  categories,
  workouts,
  onWorkoutsChange,
  onBack,
}) {
  function addWorkout() {
    const nextNumber = workouts.length + 1;
    onWorkoutsChange([
      ...workouts,
      {
        id: crypto.randomUUID(),
        name: `Тренировка ${nextNumber}`,
        exerciseCount: 0,
      },
    ]);
  }

  function renameWorkout(id, value) {
    onWorkoutsChange(workouts.map((workout) => (
      workout.id === id ? { ...workout, name: value } : workout
    )));
  }

  function removeWorkout(id) {
    if (workouts.length <= 1) return;
    onWorkoutsChange(workouts.filter((workout) => workout.id !== id));
  }

  return (
    <div className="phone create-program-phone create-program-step2-phone">
      <header className="create-program-header">
        <button className="create-program-back" type="button" aria-label="Назад к основной информации" onClick={onBack}>
          <BackIcon />
        </button>
        <strong>Создать программу</strong>
        <span className="create-program-header-spacer" />
      </header>

      <main className="create-program-content create-program-step2-content">
        <section className="create-program-intro create-program-step2-intro">
          <span>Шаг 2</span>
          <h1>Тренировки</h1>
          <p>Создайте тренировки, которые будут входить в программу. Упражнения добавим внутри каждой тренировки.</p>
        </section>

        <section className="program-step2-summary" aria-label="Параметры создаваемой программы">
          <div>
            <span>Программа</span>
            <strong>{programName}</strong>
          </div>
          <div className="program-step2-summary-meta">
            <span>{weeks} нед.</span>
            <span>{formatWorkoutCount(workouts.length)}</span>
          </div>
          {categories.length > 0 && (
            <div className="program-step2-categories">
              {categories.map((category) => <span key={category}>{category}</span>)}
            </div>
          )}
        </section>

        <section className="program-step2-section">
          <div className="program-step2-section-head">
            <div>
              <span>Структура программы</span>
              <h2>Тренировки</h2>
            </div>
            <small>{formatWorkoutCount(workouts.length)}</small>
          </div>

          <div className="program-workout-list">
            {workouts.map((workout, index) => (
              <article className="program-workout-card" key={workout.id}>
                <div className="program-workout-number" aria-hidden="true">{index + 1}</div>
                <div className="program-workout-copy">
                  <input
                    type="text"
                    value={workout.name}
                    onChange={(event) => renameWorkout(workout.id, event.target.value)}
                    placeholder={`Тренировка ${index + 1}`}
                    maxLength={80}
                    aria-label={`Название тренировки ${index + 1}`}
                  />
                  <span>
                    {workout.exerciseCount > 0
                      ? `${workout.exerciseCount} упражнений`
                      : 'Упражнения не добавлены'}
                  </span>
                </div>
                <button
                  className="program-workout-open"
                  type="button"
                  aria-label={`Открыть тренировку ${index + 1}`}
                >
                  <ChevronIcon />
                </button>
                {workouts.length > 1 && (
                  <button
                    className="program-workout-remove"
                    type="button"
                    aria-label={`Удалить тренировку ${index + 1}`}
                    onClick={() => removeWorkout(workout.id)}
                  >
                    <TrashIcon />
                  </button>
                )}
              </article>
            ))}
          </div>

          <button className="program-add-workout" type="button" onClick={addWorkout}>
            <span><PlusIcon /></span>
            <strong>Добавить тренировку</strong>
          </button>
        </section>
      </main>

      <footer className="create-program-footer">
        <button
          className="create-program-next"
          type="button"
          disabled={workouts.some((workout) => !workout.name.trim())}
        >
          Далее
        </button>
      </footer>
    </div>
  );
}
