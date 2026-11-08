import '../create-program-schedule.css';
import '../create-program-cycle-schedule.css';
import '../join-ready-program.css';
import { formatRussianCount } from '../lib/formatRussianCount.js';

const WEEKLY_DAYS = { weekly_mwf: [1, 3, 5], weekly_tts: [2, 4, 6] };

function BackIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>; }
function MinusIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M6 12h12" /></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M12 6v12M6 12h14" /></svg>; }
function todayKey() { const today = new Date(); return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`; }
function startDateIsAllowed(date, mode) { if (!date) return false; const weekday = new Date(`${date}T12:00:00`).getDay(); return !WEEKLY_DAYS[mode] || WEEKLY_DAYS[mode].includes(weekday); }
function startDateHint(mode) {
  if (mode === 'weekly_mwf') return 'Для этой программы первая тренировка должна быть в понедельник, среду или пятницу.';
  if (mode === 'weekly_tts') return 'Для этой программы первая тренировка должна быть во вторник, четверг или субботу.';
  return '';
}

/** Launching an existing program is separate from creating/editing a training cycle. */
export function JoinReadyProgramScreen({
  programName,
  programWeeks,
  scheduleMode = 'custom',
  cycleRepeatCount = 1,
  onCycleRepeatCountChange,
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
  const totalWorkouts = workoutCount * repeats;
  const allowed = startDateIsAllowed(startDate, scheduleMode);
  const valid = startDate && startDate >= todayKey() && allowed && workoutCount > 0;
  const changeRepeat = (delta) => {
    if (!saving) onCycleRepeatCountChange?.(Math.max(1, Math.min(52, repeats + delta)));
  };

  return <div className="phone create-program-phone program-schedule-phone ready-program-join-phone">
    <header className="create-program-header">
      <button className="create-program-back" type="button" aria-label="Назад" onClick={onBack} disabled={saving}><BackIcon /></button>
      <strong>Присоединение к программе</strong><span />
    </header>
    <main className="create-program-content program-schedule-content">
      <section className="ready-program-join-intro">
        <h1>Присоединиться к программе</h1>
        <p>Выберите, сколько циклов пройти, и дату первой тренировки.</p>
      </section>

      <section className="program-schedule-summary">
        <div><span>Программа</span><strong>{programName}</strong></div>
        <div className="program-schedule-summary-grid">
          <div><span>В одном цикле</span><strong>{formatRussianCount(workoutCount, ['тренировка', 'тренировки', 'тренировок'])}</strong></div>
          <div><span>Всего</span><strong>{formatRussianCount(totalWorkouts, ['тренировка', 'тренировки', 'тренировок'])}</strong></div>
        </div>
      </section>

      <section className="program-schedule-section ready-program-join-cycles">
        <div className="program-schedule-section-head"><h2>Количество циклов</h2></div>
        <div className="cycle-repeat-card">
          <div><strong>{repeats}</strong><span>{formatRussianCount(repeats, ['цикл', 'цикла', 'циклов']).replace(String(repeats), '').trim()}</span></div>
          <div className="cycle-repeat-stepper">
            <button type="button" aria-label="Уменьшить количество циклов" disabled={saving || repeats <= 1} onClick={() => changeRepeat(-1)}><MinusIcon /></button>
            <button type="button" aria-label="Увеличить количество циклов" disabled={saving || repeats >= 52} onClick={() => changeRepeat(1)}><PlusIcon /></button>
          </div>
        </div>
      </section>

      <section className="program-schedule-section program-start-section">
        <div className="program-schedule-section-head"><h2>Дата первой тренировки</h2></div>
        <div className="program-start-card">
          <label className="program-start-date-field">
            <span>Дата начала</span>
            <input type="date" min={todayKey()} value={startDate} onChange={event => onStartDateChange?.(event.target.value)} disabled={saving} />
          </label>
          {startDateHint(scheduleMode) && <div className={`program-start-weekday-note${startDate && !allowed ? ' invalid' : ''}`}>{startDateHint(scheduleMode)}</div>}
          {valid && <div className="program-start-preview">
            <span>Первая тренировка</span>
            <strong>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(new Date(`${startDate}T12:00:00`))}</strong>
            <small>В календарь будет добавлено {formatRussianCount(totalWorkouts, ['тренировка', 'тренировки', 'тренировок'])}.</small>
          </div>}
        </div>
      </section>

      {saveError && <div className="program-schedule-error" role="alert">{saveError}</div>}
    </main>
    <footer className="create-program-footer program-schedule-footer">
      <button className="create-program-next" type="button" disabled={!valid || saving} onClick={() => onAction('start', startDate)}>
        {savingAction === 'start' ? 'Присоединяем…' : 'Присоединиться к программе'}
      </button>
    </footer>
  </div>;
}
