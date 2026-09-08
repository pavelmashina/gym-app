import { useEffect, useMemo, useState } from 'react';
import { loadStatistics } from '../lib/statistics.js';
import { ActivityCalendar, WorkoutVolumeChart } from './StatisticsInsights.jsx';
import { ScaledTrendChart } from './StatisticsTrendChart.jsx';
import '../section-placeholder.css';
import '../statistics.css';
import '../statistics-hub.css';
import '../statistics-hub-v2.css';

const SECTION_TABS = [
  { key: 'favorites', label: 'Избранное' },
  { key: 'workouts', label: 'Тренировки' },
  { key: 'measurements', label: 'Замеры' },
  { key: 'photos', label: 'Фото' },
];

const PERIOD_TYPES = [
  { key: 'year', label: 'Год' },
  { key: 'month', label: 'Месяц' },
  { key: 'week', label: 'Неделя' },
];

const MEASUREMENTS_KEY = 'gym-statistics-measurements-v1';
const PHOTOS_KEY = 'gym-statistics-photos-v1';
const FAVORITES_KEY = 'gym-statistics-favorites-v1';
const ALL_TIME_BOUNDS = { start: new Date(1970, 0, 1, 12), end: new Date(2999, 11, 31, 12) };

const MEASUREMENT_FIELDS = [
  { key: 'weight', label: 'Вес', unit: 'кг' },
  { key: 'waist', label: 'Талия', unit: 'см' },
  { key: 'chest', label: 'Грудь', unit: 'см' },
  { key: 'glutes', label: 'Ягодицы', unit: 'см' },
  { key: 'thighs', label: 'Бёдра', unit: 'см' },
  { key: 'arm', label: 'Рука', unit: 'см' },
  { key: 'shoulders', label: 'Плечи', unit: 'см' },
  { key: 'neck', label: 'Шея', unit: 'см' },
  { key: 'calf', label: 'Икра', unit: 'см' },
  { key: 'forearm', label: 'Предплечье', unit: 'см' },
];

const PHOTO_ANGLES = [
  { key: 'front', label: 'Анфас' },
  { key: 'back', label: 'Сзади' },
  { key: 'side', label: 'Сбоку' },
];

const FAVORITE_OPTIONS = [
  { id: 'workouts.count', group: 'Тренировки', label: 'Количество тренировок' },
  { id: 'workouts.duration', group: 'Тренировки', label: 'Общее время' },
  { id: 'workouts.volume', group: 'Тренировки', label: 'Тоннаж' },
  { id: 'workouts.sets', group: 'Тренировки', label: 'Рабочие подходы' },
  { id: 'workouts.avgDuration', group: 'Тренировки', label: 'Среднее время тренировки' },
  { id: 'workouts.avgVolume', group: 'Тренировки', label: 'Средний тоннаж тренировки' },
  { id: 'workouts.avgSets', group: 'Тренировки', label: 'Среднее количество подходов' },
  { id: 'workouts.volumeChart', group: 'Тренировки', label: 'График тоннажа' },
  { id: 'workouts.strength', group: 'Тренировки', label: 'Силовые показатели' },
  ...MEASUREMENT_FIELDS.map((field) => ({ id: `measurements.${field.key}`, group: 'Замеры', label: field.label })),
];

function ProfileIcon() {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="16" cy="11" r="5" /><path d="M7 27c1.2-5.7 4.2-8.4 9-8.4s7.8 2.7 9 8.4" /></svg>;
}

function StatisticsBottomNav() {
  return (
    <nav className="bottom-nav placeholder-bottom-nav" aria-label="Основная навигация">
      <button className="nav-item" data-screen="training" type="button"><svg viewBox="0 0 32 32" fill="none" strokeWidth="1.8"><path d="m8 20 12-12M7 16l9 9M5 19l8 8M19 5l8 8M16 7l9 9" /><path d="m4 21 7 7M21 4l7 7" /></svg><span>Тренировки</span></button>
      <button className="nav-item placeholder-active" data-screen="statistics" type="button"><svg viewBox="0 0 32 32" fill="none" strokeWidth="1.7"><rect x="5" y="16" width="4" height="10" rx="1" /><rect x="14" y="7" width="4" height="19" rx="1" /><rect x="23" y="12" width="4" height="14" rx="1" /></svg><span>Статистика</span></button>
      <button className="nav-item home" data-screen="home" type="button"><span className="home-circle"><svg viewBox="0 0 32 32" fill="none"><path d="m5 15 11-10 11 10v12H19v-8h-6v8H5V15Z" /></svg></span><span>Главная</span></button>
      <button className="nav-item" data-screen="nutrition" type="button"><svg viewBox="0 0 32 32" fill="none" strokeWidth="1.6"><path d="M9 5v9M6 5v6c0 2 1.2 3 3 3s3-1 3-3V5M9 14v13M21 5v22M21 5c4 3 4 9 0 12" /></svg><span>Питание</span></button>
      <button className="nav-item" data-screen="sportpit" type="button"><svg viewBox="0 0 32 32" fill="none" strokeWidth="1.5"><path d="M10 7h12l2 5-2 13H10L8 12l2-5Z" /><path d="M12 7V4h8v3M11 15h10M15 12v6M12 15h6" /></svg><span>СпортПит</span></button>
    </nav>
  );
}

function formatDuration(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.round((total % 3600) / 60);
  if (hours > 0) return `${hours} ч ${minutes} мин`;
  return `${minutes} мин`;
}

function formatCompactDuration(seconds) {
  const total = Math.max(0, Number(seconds || 0));
  const hours = total / 3600;
  return hours >= 10 ? `${Math.round(hours)} ч` : `${Math.round(hours * 10) / 10} ч`;
}

function formatVolume(value) {
  const number = Math.round(Number(value || 0));
  if (number >= 1_000_000) return `${Math.round(number / 100_000) / 10} млн кг`;
  if (number >= 1_000) return `${Math.round(number / 100) / 10} тыс. кг`;
  return `${number.toLocaleString('ru-RU')} кг`;
}

function formatDate(value, withYear = false) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', withYear ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
}

function formatWeight(value) {
  return Math.round(Number(value || 0) * 10) / 10;
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromKey(value) {
  const [year, month, day] = String(value || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return new Date();
  return new Date(year, month - 1, day, 12, 0, 0);
}

function startOfWeek(date) {
  const result = new Date(date);
  const day = result.getDay() === 0 ? 6 : result.getDay() - 1;
  result.setDate(result.getDate() - day);
  return result;
}

function periodBounds(type, anchorKey) {
  const anchor = dateFromKey(anchorKey);
  let start;
  let end;
  let label;
  if (type === 'year') {
    start = new Date(anchor.getFullYear(), 0, 1, 12);
    end = new Date(anchor.getFullYear(), 11, 31, 12);
    label = String(anchor.getFullYear());
  } else if (type === 'week') {
    start = startOfWeek(anchor);
    end = new Date(start);
    end.setDate(end.getDate() + 6);
    const formatter = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' });
    label = `${formatter.format(start)} — ${formatter.format(end)} ${end.getFullYear()}`;
  } else {
    start = new Date(anchor.getFullYear(), anchor.getMonth(), 1, 12);
    end = new Date(anchor.getFullYear(), anchor.getMonth() + 1, 0, 12);
    label = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(anchor);
  }
  return { start, end, label };
}

function shiftPeriod(anchorKey, type, delta) {
  const next = dateFromKey(anchorKey);
  if (type === 'year') next.setFullYear(next.getFullYear() + delta);
  else if (type === 'week') next.setDate(next.getDate() + delta * 7);
  else next.setMonth(next.getMonth() + delta);
  return dateKey(next);
}

function inBounds(value, bounds) {
  if (!value) return false;
  const date = dateFromKey(value);
  return date >= bounds.start && date <= bounds.end;
}

function filterDataset(data, bounds) {
  if (!data) return { sessions: [], exercises: [], sets: [] };
  const sessions = data.sessions.filter((item) => inBounds(item.date, bounds));
  const ids = new Set(sessions.map((item) => item.id));
  return {
    sessions,
    exercises: data.exercises.filter((item) => ids.has(item.sessionId)),
    sets: data.sets.filter((item) => ids.has(item.sessionId)),
  };
}

function readLocalArray(key) {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(key) || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveLocalArray(key, value) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

function readMeasurements() {
  return readLocalArray(MEASUREMENTS_KEY).map((item) => ({ ...item, thighs: item.thighs ?? item.hips ?? null, arm: item.arm ?? item.biceps ?? null }));
}

function readPhotos() {
  return readLocalArray(PHOTOS_KEY).map((item) => ({ ...item, angle: item.angle || 'front' }));
}

function FavoriteButton({ id, favorites, onToggle, label = 'показатель' }) {
  const active = favorites.includes(id);
  return <button className={`statistics-favorite-button${active ? ' active' : ''}`} type="button" aria-label={`${active ? 'Убрать' : 'Добавить'} ${label} ${active ? 'из избранного' : 'в избранное'}`} onClick={() => onToggle(id)}>{active ? '♥' : '♡'}</button>;
}

function ExerciseProgress({ record }) {
  const points = record.points.slice(-8);
  const max = Math.max(...points.map((item) => item.value), 1);
  const min = Math.min(...points.map((item) => item.value), 0);
  const span = Math.max(max - min, 1);
  const width = 180;
  const height = 52;
  const coords = points.map((item, index) => {
    const x = points.length === 1 ? width / 2 : (index / (points.length - 1)) * width;
    const y = height - 5 - ((item.value - min) / span) * (height - 10);
    return `${x},${y}`;
  }).join(' ');
  return <svg className="statistics-mini-line" viewBox={`0 0 ${width} ${height}`} aria-hidden="true"><polyline points={coords} fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>;
}

function LoadingCard() {
  return <section className="statistics-state-card"><div className="statistics-spinner" /><strong>Собираем статистику…</strong><span>Считаем только завершённые тренировки.</span></section>;
}

function EmptyState() {
  return <section className="statistics-state-card"><div className="statistics-empty-mark">↗</div><strong>В этом периоде пока нет тренировок</strong><span>Выберите другой период или завершите тренировку — показатели появятся автоматически.</span></section>;
}

async function resizePhoto(file) {
  const source = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = source;
  });
  const maxSide = 900;
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  const context = canvas.getContext('2d');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', .72);
}

function PeriodControls({ type, anchor, onTypeChange, onAnchorChange }) {
  const bounds = useMemo(() => periodBounds(type, anchor), [type, anchor]);
  const today = dateKey(new Date());
  return <section className="statistics-period-shell" aria-label="Фильтр периода"><div className="statistics-period-type" role="group">{PERIOD_TYPES.map((item) => <button key={item.key} className={type === item.key ? 'active' : ''} type="button" onClick={() => onTypeChange(item.key)}>{item.label}</button>)}</div><div className="statistics-period-nav"><button type="button" aria-label="Предыдущий период" onClick={() => onAnchorChange(shiftPeriod(anchor, type, -1))}>‹</button><button className="statistics-period-label" type="button" onClick={() => onAnchorChange(today)}><strong>{bounds.label}</strong><span>нажмите, чтобы вернуться к текущему периоду</span></button><button type="button" aria-label="Следующий период" onClick={() => onAnchorChange(shiftPeriod(anchor, type, 1))}>›</button></div></section>;
}

function MetricCard({ id, label, value, caption, favorites, onToggle }) {
  return <article className="statistics-favoritable-card"><div className="statistics-card-label"><span>{label}</span><FavoriteButton id={id} favorites={favorites} onToggle={onToggle} label={label} /></div><strong>{value}</strong><small>{caption}</small></article>;
}

function MetricsGrid({ metrics, favorites, onToggle }) {
  return <section className="statistics-metric-grid"><MetricCard id="workouts.count" label="Тренировок" value={metrics.workouts} caption="завершено" favorites={favorites} onToggle={onToggle} /><MetricCard id="workouts.duration" label="Время" value={formatCompactDuration(metrics.duration)} caption={formatDuration(metrics.duration)} favorites={favorites} onToggle={onToggle} /><MetricCard id="workouts.volume" label="Тоннаж" value={formatVolume(metrics.volume)} caption="только рабочие" favorites={favorites} onToggle={onToggle} /><MetricCard id="workouts.sets" label="Подходов" value={metrics.workingSets} caption="рабочих" favorites={favorites} onToggle={onToggle} /></section>;
}

function FavoritesView({ favorites, onToggle, metrics, recentWorkouts, exerciseRecords, measurements, bounds }) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const measurementPeriod = useMemo(() => measurements.filter((item) => inBounds(item.date, bounds)), [measurements, bounds]);
  function renderFavorite(id) {
    if (id === 'workouts.count') return <MetricCard key={id} id={id} label="Тренировок" value={metrics.workouts} caption="завершено" favorites={favorites} onToggle={onToggle} />;
    if (id === 'workouts.duration') return <MetricCard key={id} id={id} label="Время" value={formatCompactDuration(metrics.duration)} caption={formatDuration(metrics.duration)} favorites={favorites} onToggle={onToggle} />;
    if (id === 'workouts.volume') return <MetricCard key={id} id={id} label="Тоннаж" value={formatVolume(metrics.volume)} caption="только рабочие" favorites={favorites} onToggle={onToggle} />;
    if (id === 'workouts.sets') return <MetricCard key={id} id={id} label="Подходов" value={metrics.workingSets} caption="рабочих" favorites={favorites} onToggle={onToggle} />;
    if (id === 'workouts.avgDuration' || id === 'workouts.avgVolume' || id === 'workouts.avgSets') {
      const count = Math.max(metrics.workouts, 1);
      const config = id === 'workouts.avgDuration' ? { label: 'Среднее время', value: formatDuration(metrics.duration / count), caption: 'на тренировку' } : id === 'workouts.avgVolume' ? { label: 'Средний тоннаж', value: formatVolume(metrics.volume / count), caption: 'на тренировку' } : { label: 'Средние подходы', value: Math.round((metrics.workingSets / count) * 10) / 10, caption: 'на тренировку' };
      return <MetricCard key={id} id={id} label={config.label} value={config.value} caption={config.caption} favorites={favorites} onToggle={onToggle} />;
    }
    if (id === 'workouts.volumeChart') return <section className="statistics-section" key={id}><div className="statistics-section-head"><div><span>Динамика</span><h2>Тоннаж по тренировкам</h2></div><div className="statistics-section-head-actions"><small>кг</small><FavoriteButton id={id} favorites={favorites} onToggle={onToggle} label="график тоннажа" /></div></div><WorkoutVolumeChart workouts={recentWorkouts} /></section>;
    if (id === 'workouts.strength') return <section className="statistics-section" key={id}><div className="statistics-section-head"><div><span>Сила</span><h2>Силовые показатели</h2></div><div className="statistics-section-head-actions"><small>e1RM</small><FavoriteButton id={id} favorites={favorites} onToggle={onToggle} label="силовые показатели" /></div></div>{exerciseRecords.length === 0 ? <p className="statistics-muted">Пока недостаточно данных.</p> : <div className="statistics-exercise-list">{exerciseRecords.map((record) => <div className="statistics-exercise-row statistics-exercise-row-static" key={record.key}><div className="statistics-exercise-copy"><strong>{record.name}</strong><span>{formatWeight(record.bestSet.weight)} кг × {record.bestSet.reps} · e1RM {Math.round(record.best)} кг</span></div><ExerciseProgress record={record} /><span /></div>)}</div>}</section>;
    if (id.startsWith('measurements.')) {
      const fieldKey = id.split('.')[1];
      const field = MEASUREMENT_FIELDS.find((item) => item.key === fieldKey);
      if (!field) return null;
      return <section className="statistics-section" key={id}><div className="statistics-section-head"><div><span>Замеры</span><h2>{field.label}</h2></div><div className="statistics-section-head-actions"><small>{field.unit}</small><FavoriteButton id={id} favorites={favorites} onToggle={onToggle} label={field.label} /></div></div><ScaledTrendChart records={measurementPeriod} field={field.key} label={field.label} unit={field.unit} /></section>;
    }
    return null;
  }
  const metricIds = ['workouts.count', 'workouts.duration', 'workouts.volume', 'workouts.sets', 'workouts.avgDuration', 'workouts.avgVolume', 'workouts.avgSets'];
  return <><div className="statistics-favorites-toolbar"><div><span>Ваш дашборд</span><strong>{favorites.length ? `${favorites.length} в избранном` : 'Пока пусто'}</strong></div><button type="button" onClick={() => setPickerOpen((value) => !value)}>{pickerOpen ? 'Готово' : '+ Добавить'}</button></div>{pickerOpen && <section className="statistics-favorite-picker"><div className="statistics-section-head"><div><span>Настройка</span><h2>Добавить показатель</h2></div></div><div className="statistics-favorite-picker-list">{FAVORITE_OPTIONS.map((option) => { const active = favorites.includes(option.id); return <button type="button" className={active ? 'active' : ''} key={option.id} onClick={() => onToggle(option.id)}><div><span>{option.group}</span><strong>{option.label}</strong></div><b>{active ? '♥' : '♡'}</b></button>; })}</div></section>}{favorites.length === 0 ? <section className="statistics-favorites-empty"><div>♡</div><h2>Здесь пока нет показателей</h2><p>Добавьте нужные метрики кнопкой выше или нажимайте ♡ рядом с показателями в других разделах.</p><button type="button" onClick={() => setPickerOpen(true)}>Добавить показатель</button></section> : <><section className="statistics-favorite-metric-grid">{favorites.filter((id) => metricIds.includes(id)).map(renderFavorite)}</section>{favorites.filter((id) => !metricIds.includes(id)).map(renderFavorite)}</>}</>;
}

function WorkoutsView({ filtered, metrics, recentWorkouts, exerciseRecords, favorites, onToggle }) {
  if (!filtered.sessions.length) return <EmptyState />;
  const avgDuration = metrics.workouts ? metrics.duration / metrics.workouts : 0;
  const avgVolume = metrics.workouts ? metrics.volume / metrics.workouts : 0;
  const avgSets = metrics.workouts ? metrics.workingSets / metrics.workouts : 0;
  const averages = [{ id: 'workouts.avgDuration', label: 'Время', value: formatDuration(avgDuration) }, { id: 'workouts.avgVolume', label: 'Тоннаж', value: formatVolume(avgVolume) }, { id: 'workouts.avgSets', label: 'Подходов', value: Math.round(avgSets * 10) / 10 }];
  return <><MetricsGrid metrics={metrics} favorites={favorites} onToggle={onToggle} /><section className="statistics-section"><div className="statistics-section-head"><div><span>Средние показатели</span><h2>Одна тренировка</h2></div><small>{metrics.workouts} шт.</small></div><div className="statistics-average-grid">{averages.map((item) => <article key={item.id}><div className="statistics-card-label"><span>{item.label}</span><FavoriteButton id={item.id} favorites={favorites} onToggle={onToggle} label={item.label} /></div><strong>{item.value}</strong></article>)}</div></section><section className="statistics-section"><div className="statistics-section-head"><div><span>Динамика</span><h2>Тоннаж по тренировкам</h2></div><div className="statistics-section-head-actions"><small>последние {recentWorkouts.length}</small><FavoriteButton id="workouts.volumeChart" favorites={favorites} onToggle={onToggle} label="график тоннажа" /></div></div><WorkoutVolumeChart workouts={recentWorkouts} /></section><ActivityCalendar sessions={filtered.sessions} /><section className="statistics-section"><div className="statistics-section-head"><div><span>Упражнения</span><h2>Силовые показатели</h2></div><div className="statistics-section-head-actions"><small>e1RM</small><FavoriteButton id="workouts.strength" favorites={favorites} onToggle={onToggle} label="силовые показатели" /></div></div>{exerciseRecords.length === 0 ? <p className="statistics-muted">Пока недостаточно данных.</p> : <div className="statistics-exercise-list">{exerciseRecords.map((record) => <div className="statistics-exercise-row statistics-exercise-row-static" key={record.key}><div className="statistics-exercise-copy"><strong>{record.name}</strong><span>{formatWeight(record.bestSet.weight)} кг × {record.bestSet.reps} · e1RM {Math.round(record.best)} кг</span></div><ExerciseProgress record={record} /><span /></div>)}</div>}</section><section className="statistics-section recent-list-section"><div className="statistics-section-head"><div><span>История</span><h2>Тренировки периода</h2></div><small>{filtered.sessions.length}</small></div><div className="statistics-recent-list">{recentWorkouts.map((item) => <article key={item.id}><div><strong>{item.workoutName}</strong><span>{formatDate(item.date, true)} · {formatDuration(item.durationSeconds)}</span></div><b>{formatVolume(item.volume)}</b></article>)}</div></section></>;
}

function MeasurementsView({ measurements, bounds, onSave, favorites, onToggle }) {
  const emptyDraft = () => ({ date: dateKey(new Date()), ...Object.fromEntries(MEASUREMENT_FIELDS.map((field) => [field.key, ''])) });
  const [draft, setDraft] = useState(emptyDraft);
  const [activeField, setActiveField] = useState('weight');
  const filtered = useMemo(() => measurements.filter((item) => inBounds(item.date, bounds)).sort((a, b) => a.date.localeCompare(b.date)), [measurements, bounds]);
  const activeConfig = MEASUREMENT_FIELDS.find((field) => field.key === activeField) || MEASUREMENT_FIELDS[0];
  function submit(event) {
    event.preventDefault();
    const hasValue = MEASUREMENT_FIELDS.some((field) => Number(draft[field.key]) > 0);
    if (!draft.date || !hasValue) return;
    const record = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, date: draft.date };
    MEASUREMENT_FIELDS.forEach((field) => { record[field.key] = draft[field.key] === '' ? null : Number(draft[field.key]); });
    onSave([...measurements, record].sort((a, b) => a.date.localeCompare(b.date)));
    setDraft((current) => ({ ...emptyDraft(), date: current.date }));
  }
  return <><section className="statistics-section statistics-measurement-entry"><div className="statistics-section-head"><div><span>Новая запись</span><h2>Добавить замеры</h2></div></div><form className="statistics-measurement-form" onSubmit={submit}><label className="statistics-field wide"><span>Дата</span><input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>{MEASUREMENT_FIELDS.map((field) => <label className="statistics-field" key={field.key}><span>{field.label}, {field.unit}</span><input inputMode="decimal" value={draft[field.key]} onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value.replace(',', '.') })} placeholder={field.unit === 'кг' ? '72.4' : '80'} /></label>)}<button className="statistics-primary-action wide" type="submit">Сохранить замеры</button></form></section><section className="statistics-section"><div className="statistics-section-head"><div><span>Динамика</span><h2>{activeConfig.label}</h2></div><div className="statistics-section-head-actions"><small>{activeConfig.unit}</small><FavoriteButton id={`measurements.${activeConfig.key}`} favorites={favorites} onToggle={onToggle} label={activeConfig.label} /></div></div><div className="statistics-measurement-selector">{MEASUREMENT_FIELDS.map((field) => <button type="button" className={activeField === field.key ? 'active' : ''} key={field.key} onClick={() => setActiveField(field.key)}>{field.label}</button>)}</div><ScaledTrendChart records={filtered} field={activeConfig.key} label={activeConfig.label} unit={activeConfig.unit} /></section><section className="statistics-section"><div className="statistics-section-head"><div><span>История</span><h2>Замеры</h2></div><small>{filtered.length}</small></div>{filtered.length === 0 ? <p className="statistics-muted">Замеров пока нет.</p> : <div className="statistics-measurement-history">{[...filtered].reverse().map((item) => <article key={item.id}><div><strong>{formatDate(item.date, true)}</strong><span>{item.weight ? `${formatWeight(item.weight)} кг` : 'Вес —'}</span></div><div className="statistics-measurement-values">{MEASUREMENT_FIELDS.filter((field) => field.key !== 'weight').map((field) => <span key={field.key}>{field.label} <b>{item[field.key] || '—'}</b></span>)}</div><button type="button" onClick={() => onSave(measurements.filter((record) => record.id !== item.id))}>Удалить</button></article>)}</div>}</section></>;
}

function PhotosView({ photos, bounds, onSave }) {
  const [photoDate, setPhotoDate] = useState(dateKey(new Date()));
  const [busyAngle, setBusyAngle] = useState('');
  const [error, setError] = useState('');
  const filtered = useMemo(() => photos.filter((item) => inBounds(item.date, bounds)).sort((a, b) => b.date.localeCompare(a.date)), [photos, bounds]);
  const grouped = useMemo(() => { const groups = new Map(); filtered.forEach((photo) => { const group = groups.get(photo.date) || { date: photo.date, byAngle: {} }; group.byAngle[photo.angle || 'front'] = photo; groups.set(photo.date, group); }); return [...groups.values()].sort((a, b) => b.date.localeCompare(a.date)); }, [filtered]);
  async function addPhoto(angle, file) {
    if (!file || !file.type.startsWith('image/')) return;
    setBusyAngle(angle); setError('');
    try { const dataUrl = await resizePhoto(file); const nextPhoto = { id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: photoDate, angle, dataUrl }; const withoutPrevious = photos.filter((item) => !(item.date === photoDate && (item.angle || 'front') === angle)); const next = [nextPhoto, ...withoutPrevious].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 30); onSave(next); } catch { setError('Не удалось сохранить фото. Попробуйте выбрать файл меньшего размера.'); } finally { setBusyAngle(''); }
  }
  const currentByAngle = Object.fromEntries(PHOTO_ANGLES.map((angle) => [angle.key, photos.find((photo) => photo.date === photoDate && (photo.angle || 'front') === angle.key)]));
  return <><section className="statistics-photo-uploader"><div><span>Фото прогресса</span><h2>Три одинаковых ракурса</h2><p>Для каждого дня сохраняйте три фотографии: анфас, сзади и сбоку. Так сравнение прогресса будет нагляднее.</p></div><label className="statistics-field"><span>Дата фото</span><input type="date" value={photoDate} onChange={(e) => setPhotoDate(e.target.value)} /></label><div className="statistics-photo-angle-entry">{PHOTO_ANGLES.map((angle) => { const photo = currentByAngle[angle.key]; const busy = busyAngle === angle.key; return <article key={angle.key} className={photo ? 'filled' : ''}><div className="statistics-photo-angle-preview">{photo ? <img src={photo.dataUrl} alt={`${angle.label} ${formatDate(photoDate, true)}`} /> : <span>{angle.label.slice(0, 1)}</span>}</div><strong>{angle.label}</strong><label className={busy ? 'disabled' : ''}><input type="file" accept="image/*" disabled={Boolean(busyAngle)} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ''; addPhoto(angle.key, file); }} /><span>{busy ? 'Обработка…' : photo ? 'Заменить' : 'Добавить'}</span></label>{photo && <button type="button" onClick={() => onSave(photos.filter((item) => item.id !== photo.id))}>Удалить</button>}</article>; })}</div>{error && <p className="statistics-photo-error">{error}</p>}</section><section className="statistics-section"><div className="statistics-section-head"><div><span>Сравнение</span><h2>Фото</h2></div><small>{grouped.length} дат</small></div>{grouped.length === 0 ? <div className="statistics-photo-empty"><span>＋</span><strong>Пока нет фотографий</strong><p>Добавьте три фото прогресса.</p></div> : <div className="statistics-photo-date-list">{grouped.map((group) => <article key={group.date}><div className="statistics-photo-date-head"><strong>{formatDate(group.date, true)}</strong><span>{Object.keys(group.byAngle).length}/3 фото</span></div><div className="statistics-photo-triptych">{PHOTO_ANGLES.map((angle) => { const photo = group.byAngle[angle.key]; return <div key={angle.key}>{photo ? <img src={photo.dataUrl} alt={`${angle.label} ${formatDate(group.date, true)}`} /> : <span className="statistics-photo-missing">Нет фото</span>}<small>{angle.label}</small></div>; })}</div></article>)}</div>}</section></>;
}

export function StatisticsScreen() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState('favorites');
  const [periodType, setPeriodType] = useState('month');
  const [periodAnchor, setPeriodAnchor] = useState(() => dateKey(new Date()));
  const [measurements, setMeasurements] = useState(readMeasurements);
  const [photos, setPhotos] = useState(readPhotos);
  const [favorites, setFavorites] = useState(() => readLocalArray(FAVORITES_KEY));
  useEffect(() => { let active = true; setStatus('loading'); loadStatistics().then((result) => { if (!active) return; setData(result); setStatus('ready'); }).catch(() => { if (!active) return; setStatus('error'); }); return () => { active = false; }; }, [reloadKey]);
  const bounds = useMemo(() => periodBounds(periodType, periodAnchor), [periodType, periodAnchor]);
  const filtered = useMemo(() => filterDataset(data, bounds), [data, bounds]);
  const metrics = useMemo(() => { const workingSets = filtered.sets.filter((set) => set.setType === 'working'); return { workouts: filtered.sessions.length, duration: filtered.sessions.reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0), volume: workingSets.reduce((sum, set) => sum + Number(set.volume || 0), 0), workingSets: workingSets.length }; }, [filtered]);
  const recentWorkouts = useMemo(() => { const setsBySession = new Map(); filtered.sets.filter((set) => set.setType === 'working').forEach((set) => setsBySession.set(set.sessionId, [...(setsBySession.get(set.sessionId) || []), set])); return [...filtered.sessions].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8).map((session) => ({ ...session, volume: (setsBySession.get(session.id) || []).reduce((sum, set) => sum + Number(set.volume || 0), 0) })); }, [filtered]);
  const exerciseRecords = useMemo(() => { const groups = new Map(); filtered.sets.filter((set) => set.setType === 'working' && set.estimatedOneRepMax > 0).forEach((set) => { const current = groups.get(set.exerciseKey) || { key: set.exerciseKey, name: set.exerciseName, best: 0, bestSet: null, pointsByDate: new Map() }; if (set.estimatedOneRepMax > current.best) { current.best = set.estimatedOneRepMax; current.bestSet = set; } const dateBest = current.pointsByDate.get(set.date) || 0; if (set.estimatedOneRepMax > dateBest) current.pointsByDate.set(set.date, set.estimatedOneRepMax); groups.set(set.exerciseKey, current); }); return [...groups.values()].map((item) => ({ ...item, points: [...item.pointsByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })) })).sort((a, b) => b.points.length - a.points.length || b.best - a.best).slice(0, 6); }, [filtered]);
  function saveMeasurements(next) { setMeasurements(next); saveLocalArray(MEASUREMENTS_KEY, next); }
  function savePhotos(next) { saveLocalArray(PHOTOS_KEY, next); setPhotos(next); }
  function toggleFavorite(id) { setFavorites((current) => { const next = current.includes(id) ? current.filter((item) => item !== id) : [...current, id]; saveLocalArray(FAVORITES_KEY, next); return next; }); }
  return <div className="phone statistics-phone statistics-hub-phone"><header className="statistics-appbar"><div><span>Прогресс и аналитика</span><h1>Статистика</h1></div><button className="profile-btn" type="button" aria-label="Профиль"><ProfileIcon /></button></header><main className="statistics-content statistics-hub-content"><div className="statistics-tabs" role="tablist" aria-label="Раздел статистики">{SECTION_TABS.map((item) => <button key={item.key} role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'active' : ''} type="button" onClick={() => setTab(item.key)}>{item.label}</button>)}</div>{(tab === 'favorites' || tab === 'workouts') && <PeriodControls type={periodType} anchor={periodAnchor} onTypeChange={setPeriodType} onAnchorChange={setPeriodAnchor} />}{tab === 'favorites' && <FavoritesView favorites={favorites} onToggle={toggleFavorite} metrics={metrics} recentWorkouts={recentWorkouts} exerciseRecords={exerciseRecords} measurements={measurements} bounds={bounds} />}{tab === 'workouts' && status === 'loading' && <LoadingCard />}{tab === 'workouts' && status === 'error' && <section className="statistics-state-card error"><strong>Не удалось загрузить статистику</strong><span>Проверьте соединение и попробуйте ещё раз.</span><button type="button" onClick={() => setReloadKey((value) => value + 1)}>Повторить</button></section>}{tab === 'workouts' && status === 'ready' && <WorkoutsView filtered={filtered} metrics={metrics} recentWorkouts={recentWorkouts} exerciseRecords={exerciseRecords} favorites={favorites} onToggle={toggleFavorite} />}{tab === 'measurements' && <MeasurementsView measurements={measurements} bounds={ALL_TIME_BOUNDS} onSave={saveMeasurements} favorites={favorites} onToggle={toggleFavorite} />}{tab === 'photos' && <PhotosView photos={photos} bounds={ALL_TIME_BOUNDS} onSave={savePhotos} />}</main><StatisticsBottomNav /></div>;
}
