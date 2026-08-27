import { useMemo, useState } from 'react';
import '../create-program-schedule.css';
import '../create-program-cycle-schedule.css';

const PRESETS = [
  { id: 'custom', label: 'Выбрать самому', description: 'Укажите количество полных дней отдыха после каждой тренировки цикла.' },
  { id: 'weekly_mwf', label: '3 раза / нед', sublabel: 'Пн · Ср · Пт', description: 'Тренировки последовательно занимают понедельник, среду и пятницу.' },
  { id: 'weekly_tts', label: '3 раза / нед', sublabel: 'Вт · Чт · Сб', description: 'Тренировки последовательно занимают вторник, четверг и субботу.' },
  { id: 'cycle_2_2', label: '2 тренировки', sublabel: '2 дня отдыха', description: 'Две тренировки подряд, затем два полных дня отдыха; паттерн продолжается между циклами.' },
];
const WEEKLY_DAYS = { weekly_mwf: [1, 3, 5], weekly_tts: [2, 4, 6] };
const WEEKDAY_SHORT = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function BackIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m15 5-7 7 7 7" /></svg>; }
function MinusIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M6 12h12" /></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 6v12M6 12h12" /></svg>; }
function localInputDate(date = new Date()) { const offset = date.getTimezoneOffset() * 60_000; return new Date(date.getTime() - offset).toISOString().slice(0, 10); }
function parseLocalDate(value) { return new Date(`${value}T12:00:00`); }
function addDays(value, days) { const date = parseLocalDate(value); date.setDate(date.getDate() + days); return localInputDate(date); }
function formatDays(count) { const m100 = count % 100; const m10 = count % 10; if (m100 >= 11 && m100 <= 14) return `${count} дней`; if (m10 === 1) return `${count} день`; if (m10 >= 2 && m10 <= 4) return `${count} дня`; return `${count} дней`; }
function formatDuration(days) { if (days < 7) return formatDays(days); const weeks = Math.floor(days / 7); const rest = days % 7; return rest ? `${weeks} нед. ${formatDays(rest)}` : `${weeks} нед.`; }
function formatCalendarDate(value) { return value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(parseLocalDate(value)) : null; }
function daysUntilNextAllowed(weekday, allowed) { for (let delta = 1; delta <= 7; delta += 1) if (allowed.includes((weekday + delta) % 7)) return delta; return 7; }
function isAllowedStartDate(value, mode) { if (!value) return true; const allowed = WEEKLY_DAYS[mode]; return !allowed || allowed.includes(parseLocalDate(value).getDay()); }
function startHint(mode) { if (mode === 'weekly_mwf') return 'Первая тренировка должна быть в понедельник, среду или пятницу.'; if (mode === 'weekly_tts') return 'Первая тренировка должна быть во вторник, четверг или субботу.'; return ''; }

function buildSchedule(workouts, repeatCount, mode, startDate) {
  const result = [];
  let day = 1;
  let currentDate = startDate || null;
  let weekday = startDate ? parseLocalDate(startDate).getDay() : (WEEKLY_DAYS[mode]?.[0] ?? null);
  let sequence = 0;
  const allowed = WEEKLY_DAYS[mode];
  for (let cycleNumber = 1; cycleNumber <= repeatCount; cycleNumber += 1) {
    workouts.forEach((workout, workoutIndex) => {
      sequence += 1;
      result.push({ cycleNumber, workoutIndex, sequence, workout, day, date: currentDate, weekday });
      if (sequence >= workouts.length * repeatCount) return;
      let delta = 1;
      if (allowed) delta = daysUntilNextAllowed(weekday, allowed);
      else if (mode === 'cycle_2_2') delta = sequence % 2 === 1 ? 1 : 3;
      else delta = 1 + Number(workout.restDaysAfter ?? 1);
      day += delta;
      if (currentDate) currentDate = addDays(currentDate, delta);
      if (allowed) weekday = (weekday + delta) % 7;
      else if (currentDate) weekday = parseLocalDate(currentDate).getDay();
    });
  }
  return result;
}

export function CreateProgramCycleScheduleScreen({
  programName,
  programWeeks,
  onProgramWeeksChange,
  scheduleMode = 'custom',
  onScheduleModeChange,
  cycleRepeatCount = 1,
  onCycleRepeatCountChange,
  cycleRepeatLocked = false,
  onBack,
  onAction,
  saving,
  savingAction,
  saveError,
  isEditing = false,
  launchOnly = false,
}) {
  const [startDate, setStartDate] = useState('');
  const workouts = programWeeks[0]?.workouts ?? [];
  const repeatCount = Math.max(1, Math.min(52, Number(cycleRepeatCount) || 1));
  const expanded = useMemo(() => buildSchedule(workouts, repeatCount, scheduleMode, startDate), [workouts, repeatCount, scheduleMode, startDate]);
  const firstCycle = expanded.filter((item) => item.cycleNumber === 1);
  const totalWorkouts = workouts.length * repeatCount;
  const durationDays = expanded.at(-1)?.day ?? 0;
  const selectedPreset = PRESETS.find((item) => item.id === scheduleMode) ?? PRESETS[0];
  const canEditIntervals = scheduleMode === 'custom';
  const startDateAllowed = isAllowedStartDate(startDate, scheduleMode);
  const canStart = Boolean(startDate) && startDateAllowed && workouts.length > 0 && !saving;
  const showStartChoice = !isEditing || launchOnly;

  function updateRestDays(workoutId, value) {
    const normalized = Math.max(0, Math.min(30, Number(value) || 0));
    onProgramWeeksChange((current) => current.map((cycle, index) => index ? cycle : ({ ...cycle, workouts: cycle.workouts.map((workout) => workout.id === workoutId ? { ...workout, restDaysAfter: normalized } : workout) })));
  }
  function selectPreset(id) { if (!saving) onScheduleModeChange?.(id); }
  function changeRepeats(delta) { if (!cycleRepeatLocked) onCycleRepeatCountChange?.(Math.max(1, Math.min(52, repeatCount + delta))); }

  return <div className="phone create-program-phone program-schedule-phone cycle-schedule-phone">
    <header className="create-program-header"><button className="create-program-back" type="button" onClick={onBack} disabled={saving}><BackIcon /></button><strong>{launchOnly ? 'Начать программу' : (isEditing ? 'Редактировать программу' : 'Создать программу')}</strong><span /></header>
    <main className="create-program-content program-schedule-content">
      <section className="create-program-intro program-schedule-intro"><span>Шаг 3</span><h1>Ритм и повторение цикла</h1><p>Сначала задайте интервалы между тренировками, затем выберите, сколько раз повторить весь цикл.</p></section>
      <section className="program-schedule-summary"><div><span>Программа</span><strong>{programName}</strong></div><div className="program-schedule-summary-grid"><div><span>В одном цикле</span><strong>{workouts.length} трен.</strong></div><div><span>Всего</span><strong>{totalWorkouts} трен.</strong></div></div></section>

      <section className="program-schedule-section"><div className="program-schedule-section-head"><div><span>Ритм тренировок</span><h2>Как распределить тренировки</h2></div></div><div className="program-schedule-presets">{PRESETS.map((preset) => <button className={preset.id === scheduleMode ? 'selected' : ''} type="button" key={preset.id} onClick={() => selectPreset(preset.id)} disabled={saving}><strong>{preset.label}</strong>{preset.sublabel && <span>{preset.sublabel}</span>}</button>)}</div><p className="program-schedule-hint">{selectedPreset.description}</p></section>

      <section className="program-schedule-section"><div className="program-schedule-section-head"><div><span>{canEditIntervals ? 'Точная настройка' : 'Предпросмотр'}</span><h2>{canEditIntervals ? 'Интервалы внутри цикла' : 'Первый цикл'}</h2></div></div><div className="program-schedule-list">
        {firstCycle.map((item, index) => {
          const restDays = Number(item.workout.restDaysAfter ?? 1);
          const next = expanded[item.sequence] ?? null;
          const weekly = Boolean(WEEKLY_DAYS[scheduleMode]);
          const last = index === firstCycle.length - 1;
          return <article className="program-schedule-item" key={item.workout.id}><div className="program-schedule-workout"><span className="program-schedule-day">{item.date ? formatCalendarDate(item.date) : (weekly ? WEEKDAY_SHORT[item.weekday] : `День ${item.day}`)}</span><div><small>Цикл 1 · тренировка {index + 1}</small><strong>{item.workout.name}</strong></div></div>
            {canEditIntervals ? <div className="program-schedule-rest"><div><span>{last ? 'После последней тренировки цикла' : 'После тренировки'}</span><strong>{restDays === 0 ? 'Без полного дня отдыха' : formatDays(restDays)}{last && repeatCount > 1 ? ' · до нового цикла' : ''}</strong></div><div className="program-schedule-stepper"><button type="button" onClick={() => updateRestDays(item.workout.id, restDays - 1)} disabled={saving || restDays <= 0}><MinusIcon /></button><output>{restDays}</output><button type="button" onClick={() => updateRestDays(item.workout.id, restDays + 1)} disabled={saving || restDays >= 30}><PlusIcon /></button></div></div> : next ? <div className="program-schedule-rest"><div><span>{last ? 'Дальше' : 'Следующая тренировка'}</span><strong>{next.date ? `${formatCalendarDate(next.date)} · ${WEEKDAY_SHORT[next.weekday]}` : `через ${formatDays(next.day - item.day)}`}</strong></div></div> : <div className="program-schedule-finish">Финиш программы</div>}
          </article>;
        })}
      </div></section>

      <section className={`program-schedule-section cycle-repeat-section${cycleRepeatLocked ? ' locked' : ''}`}><div className="program-schedule-section-head"><div><span>Повторение</span><h2>Сколько раз повторить цикл</h2></div></div><div className="cycle-repeat-card"><div><strong>{repeatCount}</strong><span>{repeatCount === 1 ? 'цикл' : (repeatCount < 5 ? 'цикла' : 'циклов')}</span></div><div className="cycle-repeat-stepper"><button type="button" onClick={() => changeRepeats(-1)} disabled={saving || cycleRepeatLocked || repeatCount <= 1}><MinusIcon /></button><button type="button" onClick={() => changeRepeats(1)} disabled={saving || cycleRepeatLocked || repeatCount >= 52}><PlusIcon /></button></div></div>
        {cycleRepeatLocked ? <div className="cycle-repeat-lock-note"><strong>Количество циклов зафиксировано</strong><span>Программа уже присоединена. Менять её размер задним числом нельзя, чтобы не перестраивать созданное расписание.</span></div> : <div className="cycle-week-hint"><strong>Рекомендация, не правило</strong><span>Обычно удобнее, если один цикл примерно равен одной неделе. Но цикл может занимать любое число дней.</span></div>}
        <div className="cycle-duration-summary"><span>Итого</span><strong>{totalWorkouts} тренировок{durationDays ? ` · примерно ${formatDuration(durationDays)}` : ''}</strong></div>
      </section>

      {showStartChoice && <section className="program-schedule-section program-start-section"><div className="program-schedule-section-head"><div><span>Запуск программы</span><h2>Дата первой тренировки</h2></div></div><div className="program-start-card"><label className="program-start-date-field"><span>Дата начала</span><input type="date" min={localInputDate()} value={startDate} onChange={(event) => setStartDate(event.target.value)} disabled={saving} /></label>{startHint(scheduleMode) && <div className={`program-start-weekday-note${startDate && !startDateAllowed ? ' invalid' : ''}`}>{startDate && !startDateAllowed ? `Эта дата не подходит. ${startHint(scheduleMode)}` : startHint(scheduleMode)}</div>}{startDate && startDateAllowed ? <div className="program-start-preview"><span>Первая тренировка</span><strong>{new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', weekday: 'long' }).format(parseLocalDate(startDate))}</strong><small>В календарь будет добавлено {totalWorkouts} тренировок.</small></div> : !startDate ? <div className="program-start-later-note"><strong>Можно начать позже</strong><span>Программа сохранится в «Мои программы», а дату присоединения можно выбрать позже.</span></div> : null}</div></section>}
      {saveError && <div className="program-schedule-error" role="alert">{saveError}</div>}
    </main>
    <footer className={`create-program-footer program-schedule-footer${!isEditing && !launchOnly ? ' dual' : ''}`}>
      {launchOnly ? <button className="create-program-next" type="button" onClick={() => onAction('start', startDate)} disabled={!canStart}>{savingAction === 'start' ? 'Присоединяем…' : 'Присоединиться к программе'}</button> : isEditing ? <button className="create-program-next" type="button" onClick={() => onAction('save')} disabled={saving || !workouts.length}>{savingAction === 'save' ? 'Сохраняем…' : 'Сохранить изменения'}</button> : <><button className="program-save-later" type="button" onClick={() => onAction('later')} disabled={saving || !workouts.length}>{savingAction === 'later' ? 'Сохраняем…' : 'Сохранить и начать позже'}</button><button className="create-program-next" type="button" onClick={() => onAction('start', startDate)} disabled={!canStart}>{savingAction === 'start' ? 'Сохраняем и присоединяем…' : 'Сохранить и присоединиться'}</button></>}
    </footer>
  </div>;
}
