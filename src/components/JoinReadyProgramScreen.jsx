import '../create-program-schedule.css';
import '../create-program-cycle-schedule.css';
import '../join-ready-program.css';
import { formatRussianCount } from '../lib/formatRussianCount.js';
import { TRAINING_WEEKDAYS, normalizeTrainingWeekdays, resizeTrainingWeekdays } from '../lib/readyProgramSchedule.js';

function BackIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>; }
function MinusIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 12h12" /></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 6v12M6 12h14" /></svg>; }
function todayKey() { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; }
function selectedDateIsValid(date, days) { return Boolean(date && days.includes(new Date(`${date}T12:00:00`).getDay() || 7)); }
function Counter({ value, min = 1, max = 52, onChange, disabled, label, forms }) {
  return <div className="ready-program-counter">
    <strong>{value} <span>{formatRussianCount(value, forms).slice(String(value).length).trim()}</span></strong>
    <div className="ready-program-counter-actions">
      <button type="button" aria-label={`Уменьшить ${label}`} disabled={disabled || value <= min} onClick={() => onChange(value - 1)}><MinusIcon /></button>
      <button type="button" aria-label={`Увеличить ${label}`} disabled={disabled || value >= max} onClick={() => onChange(value + 1)}><PlusIcon /></button>
    </div>
  </div>;
}

/** A dedicated join flow, separate from editing a program's workout cycle. */
export function JoinReadyProgramScreen({
  programName,
  programWeeks,
  scheduleMode = 'custom',
  cycleRepeatCount = 1,
  onCycleRepeatCountChange,
  selectedWeekdays = [1, 3, 5],
  onSelectedWeekdaysChange,
  onBack,
  onAction,
  saving = false,
  savingAction = '',
  saveError = '',
  startDate = '',
  onStartDateChange,
}) {
  const workoutCount = programWeeks[0]?.workouts?.length ?? 0;
  const repeats = Math.max(1, Math.min(52, Number(cycleRepeatCount) || 1));
  const days = normalizeTrainingWeekdays(selectedWeekdays);
  const totalWorkouts = workoutCount * repeats;
  const firstDateAllowed = selectedDateIsValid(startDate, days);
  const valid = Boolean(startDate && startDate >= todayKey() && firstDateAllowed && workoutCount > 0 && !saving);
  const toggleDay = day => {
    if (saving) return;
    const next = days.includes(day) ? days.filter(value => value !== day) : [...days, day];
    if (next.length) onSelectedWeekdaysChange?.(normalizeTrainingWeekdays(next));
  };

  return <div className="phone create-program-phone ready-program-join-phone">
    <header className="create-program-header">
      <button className="create-program-back" type="button" aria-label="Назад" onClick={onBack} disabled={saving}><BackIcon /></button>
      <strong>Подключение программы</strong><span />
    </header>
    <main className="create-program-content ready-program-join-content">
      <section className="ready-program-join-card ready-program-join-summary" aria-label="Выбранная программа">
        <span className="ready-program-eyebrow">Программа</span>
        <h1>{programName}</h1>
        <div className="ready-program-summary-stats">
          <div><span>В цикле</span><strong>{formatRussianCount(workoutCount, ['тренировка', 'тренировки', 'тренировок'])}</strong></div>
          <div><span>Всего</span><strong>{formatRussianCount(totalWorkouts, ['тренировка', 'тренировки', 'тренировок'])}</strong></div>
        </div>
      </section>

      <section className="ready-program-join-section" aria-label="Настройка тренировочной недели">
        <h2>Тренировочная неделя</h2>
        <div className="ready-program-join-card ready-program-week-card">
          <div className="ready-program-setting-title"><h3>Тренировок в неделю</h3></div>
          <Counter value={days.length} max={7} label="количество тренировок в неделю"
            forms={['тренировка', 'тренировки', 'тренировок']} disabled={saving}
            onChange={count => onSelectedWeekdaysChange?.(resizeTrainingWeekdays(days, count))} />
          <div className="ready-program-card-divider" />
          <div className="ready-program-setting-title"><h3>Дни тренировок</h3></div>
          <div className="ready-program-weekdays" role="group" aria-label="Выберите дни тренировок">
            {TRAINING_WEEKDAYS.map(({ id, short, full }) =>
              <button type="button" key={id} disabled={saving || (days.length === 1 && days.includes(id))}
                className={days.includes(id) ? 'selected' : ''} aria-pressed={days.includes(id)}
                aria-label={full} onClick={() => toggleDay(id)}>{short}</button>)}
          </div>
        </div>
      </section>

      <section className="ready-program-join-section" aria-label="Длительность программы">
        <h2>Количество циклов</h2>
        <div className="ready-program-join-card">
          <Counter value={repeats} label="количество циклов" forms={['цикл', 'цикла', 'циклов']}
            disabled={saving} onChange={onCycleRepeatCountChange} />
        </div>
      </section>

      <section className="ready-program-join-section" aria-label="Начало программы">
        <h2>Дата первой тренировки</h2>
        <div className="ready-program-join-card ready-program-date-card">
          <label className="ready-program-date-label">
            <span>Дата начала</span>
            <input type="date" min={todayKey()} value={startDate}
              onChange={event => onStartDateChange?.(event.target.value)} disabled={saving} />
          </label>
          {startDate && !firstDateAllowed && <p className="ready-program-date-error">Первая тренировка должна приходиться на один из выбранных дней недели.</p>}
          {startDate && firstDateAllowed && <div className="ready-program-date-preview">
            <span>Первая тренировка</span>
            <strong>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(new Date(`${startDate}T12:00:00`))}</strong>
          </div>}
        </div>
      </section>

      {saveError && <div className="program-schedule-error" role="alert">{saveError}</div>}
    </main>
    <footer className="create-program-footer ready-program-join-footer">
      <button className="create-program-next" type="button" disabled={!valid} onClick={() => onAction('start', startDate)}>
        {savingAction === 'start' ? 'Подключаем…' : 'Подключить программу'}
      </button>
    </footer>
  </div>;
}
