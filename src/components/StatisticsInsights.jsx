import { useMemo } from 'react';
import '../statistics-insights.css';

function dateFromKey(value) {
  if (!value) return null;
  const [year, month, day] = String(value).slice(0, 10).split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatShortDate(value) {
  const date = dateFromKey(value);
  return date ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(date) : '—';
}

function formatCompact(value) {
  const number = Math.round(Number(value || 0));
  if (Math.abs(number) >= 1_000_000) return `${Math.round(number / 100_000) / 10} млн`;
  if (Math.abs(number) >= 1_000) return `${Math.round(number / 100) / 10} тыс.`;
  return number.toLocaleString('ru-RU');
}

function calculateMetrics(dataset) {
  const workingSets = dataset.sets.filter((set) => set.setType === 'working');
  return {
    workouts: dataset.sessions.length,
    duration: dataset.sessions.reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0),
    volume: workingSets.reduce((sum, set) => sum + Number(set.volume || 0), 0),
    workingSets: workingSets.length,
  };
}

function filterWindow(data, start, end) {
  const sessions = data.sessions.filter((session) => {
    const date = dateFromKey(session.date);
    return date && date >= start && date <= end;
  });
  const ids = new Set(sessions.map((session) => session.id));
  return {
    sessions,
    exercises: data.exercises.filter((exercise) => ids.has(exercise.sessionId)),
    sets: data.sets.filter((set) => ids.has(set.sessionId)),
  };
}

function changePercent(current, previous) {
  if (previous === 0) return current === 0 ? null : Infinity;
  return ((current - previous) / Math.abs(previous)) * 100;
}

function changeCopy(current, previous, formatter = (value) => String(value)) {
  const change = changePercent(current, previous);
  if (change === null) return { tone: 'neutral', text: 'без изменений' };
  if (change === Infinity) return { tone: 'up', text: `новое: ${formatter(current)}` };
  const rounded = Math.round(Math.abs(change));
  if (rounded === 0) return { tone: 'neutral', text: 'без изменений' };
  return { tone: change > 0 ? 'up' : 'down', text: `${change > 0 ? '+' : '−'}${rounded}%` };
}

export function PeriodComparison({ data, range, currentMetrics }) {
  const comparison = useMemo(() => {
    const days = range === '30d' ? 30 : range === '90d' ? 90 : null;
    if (!days || !data?.sessions?.length) return null;

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const currentStart = new Date(today);
    currentStart.setDate(currentStart.getDate() - days + 1);
    const previousEnd = new Date(currentStart);
    previousEnd.setDate(previousEnd.getDate() - 1);
    const previousStart = new Date(previousEnd);
    previousStart.setDate(previousStart.getDate() - days + 1);

    const previous = calculateMetrics(filterWindow(data, previousStart, previousEnd));
    return { previous, days };
  }, [data, range]);

  if (!comparison) return null;

  const cards = [
    { label: 'Тренировки', value: currentMetrics.workouts, previous: comparison.previous.workouts, suffix: '', formatter: (v) => v },
    { label: 'Время', value: currentMetrics.duration, previous: comparison.previous.duration, suffix: '', formatter: (v) => `${Math.round(v / 360) / 10} ч` },
    { label: 'Тоннаж', value: currentMetrics.volume, previous: comparison.previous.volume, suffix: ' кг', formatter: formatCompact },
    { label: 'Подходы', value: currentMetrics.workingSets, previous: comparison.previous.workingSets, suffix: '', formatter: (v) => v },
  ];

  return (
    <section className="statistics-section statistics-comparison">
      <div className="statistics-section-head">
        <div><span>Изменение</span><h2>К предыдущему периоду</h2></div>
        <small>{comparison.days} дней</small>
      </div>
      <div className="statistics-comparison-grid">
        {cards.map((card) => {
          const delta = changeCopy(card.value, card.previous, card.formatter);
          return (
            <article key={card.label}>
              <span>{card.label}</span>
              <strong className={delta.tone}>{delta.text}</strong>
              <small>было {card.formatter(card.previous)}{card.suffix}</small>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function ActivityCalendar({ sessions }) {
  const weeks = useMemo(() => {
    const counts = new Map();
    sessions.forEach((session) => counts.set(session.date, (counts.get(session.date) || 0) + 1));

    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const start = new Date(today);
    start.setDate(start.getDate() - 83);
    const startDay = start.getDay() === 0 ? 6 : start.getDay() - 1;
    start.setDate(start.getDate() - startDay);

    const cells = [];
    const cursor = new Date(start);
    while (cursor <= today) {
      const key = dateKey(cursor);
      cells.push({ key, count: counts.get(key) || 0, future: false });
      cursor.setDate(cursor.getDate() + 1);
    }
    while (cells.length % 7 !== 0) {
      cells.push({ key: `future-${cells.length}`, count: 0, future: true });
    }

    const result = [];
    for (let i = 0; i < cells.length; i += 7) result.push(cells.slice(i, i + 7));
    return result;
  }, [sessions]);

  const activeDays = useMemo(() => new Set(sessions.map((session) => session.date)).size, [sessions]);

  return (
    <section className="statistics-section statistics-activity">
      <div className="statistics-section-head">
        <div><span>Регулярность</span><h2>Активность за 12 недель</h2></div>
        <small>{activeDays} активн. дн.</small>
      </div>
      <div className="statistics-activity-body">
        <div className="statistics-activity-weekdays" aria-hidden="true"><span>Пн</span><span>Ср</span><span>Пт</span></div>
        <div className="statistics-activity-grid" aria-label="Календарь завершённых тренировок за 12 недель">
          {weeks.map((week, weekIndex) => (
            <div className="statistics-activity-week" key={weekIndex}>
              {week.map((day) => (
                <span
                  key={day.key}
                  className={`statistics-activity-day level-${Math.min(day.count, 3)}${day.future ? ' future' : ''}`}
                  title={day.future ? '' : `${formatShortDate(day.key)}: ${day.count} тренировок`}
                  aria-label={day.future ? undefined : `${formatShortDate(day.key)}: ${day.count} тренировок`}
                />
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="statistics-activity-legend"><span>меньше</span><i className="level-0" /><i className="level-1" /><i className="level-2" /><i className="level-3" /><span>больше</span></div>
    </section>
  );
}

export function WorkoutVolumeChart({ workouts }) {
  const chartData = useMemo(() => [...workouts].reverse(), [workouts]);
  const max = Math.max(...chartData.map((item) => Number(item.volume || 0)), 1);
  const average = chartData.length ? chartData.reduce((sum, item) => sum + Number(item.volume || 0), 0) / chartData.length : 0;
  const averagePosition = 100 - (average / max) * 100;

  if (!chartData.length) return <p className="statistics-muted">В выбранном периоде тренировок нет.</p>;

  return (
    <div className="statistics-volume-enhanced">
      <div className="statistics-volume-scale"><span>{formatCompact(max)} кг</span><span>{formatCompact(Math.round(max / 2))}</span><span>0</span></div>
      <div className="statistics-volume-plot">
        <span className="statistics-volume-average" style={{ top: `${Math.max(0, Math.min(100, averagePosition))}%` }}><b>ср. {formatCompact(average)} кг</b></span>
        <div className="statistics-volume-gridline top" /><div className="statistics-volume-gridline middle" /><div className="statistics-volume-gridline bottom" />
        <div className="statistics-volume-chart enhanced">
          {chartData.map((item) => (
            <div className="statistics-volume-column" key={item.id} title={`${formatShortDate(item.date)} · ${Math.round(item.volume).toLocaleString('ru-RU')} кг`}>
              <div className="statistics-volume-bar-shell"><span style={{ height: `${Math.max(5, (item.volume / max) * 100)}%` }} /></div>
              <small>{formatShortDate(item.date)}</small>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
