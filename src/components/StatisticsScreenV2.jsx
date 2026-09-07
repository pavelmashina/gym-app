import { useEffect, useMemo, useState } from 'react';
import { loadStatistics } from '../lib/statistics.js';
import { ActivityCalendar, WorkoutVolumeChart } from './StatisticsInsights.jsx';
import '../section-placeholder.css';
import '../statistics.css';
import '../statistics-hub.css';

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

function ProfileIcon() {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="16" cy="11" r="5" /><path d="M7 27c1.2-5.7 4.2-8.4 9-8.4s7.8 2.7 9 8.4" /></svg>;
}

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>;
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

function TrendChart({ records, field, label, unit }) {
  const points = records
    .filter((item) => Number.isFinite(Number(item[field])) && Number(item[field]) > 0)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((item) => ({ date: item.date, value: Number(item[field]) }));

  if (!points.length) return <p className="statistics-muted">Добавьте данные, чтобы появилась динамика.</p>;

  const width = 320;
  const height = 136;
  const pad = 18;
  const values = points.map((item) => item.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const span = Math.max(max - min, 1);
  const coords = points.map((item, index) => ({
    ...item,
    x: points.length === 1 ? width / 2 : pad + (index / (points.length - 1)) * (width - pad * 2),
    y: height - pad - ((item.value - min) / span) * (height - pad * 2),
  }));
  const polyline = coords.map((item) => `${item.x},${item.y}`).join(' ');
  const latest = points[points.length - 1];

  return (
    <div className="statistics-trend-wrap">
      <div className="statistics-trend-value"><span>{label}</span><strong>{formatWeight(latest.value)} {unit}</strong><small>{formatDate(latest.date, true)}</small></div>
      <svg className="statistics-trend-chart" viewBox={`0 0 ${width} ${height}`} aria-label={`Динамика: ${label}`}>
        <line x1={pad} y1={height - pad} x2={width - pad} y2={height - pad} className="statistics-trend-axis" />
        <polyline points={polyline} fill="none" className="statistics-trend-line" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
        {coords.map((item) => <circle key={`${field}-${item.date}-${item.x}`} cx={item.x} cy={item.y} r="4" className="statistics-trend-dot" />)}
      </svg>
      <div className="statistics-trend-labels"><span>{formatDate(points[0]?.date)}</span><span>{formatDate(points[points.length - 1]?.date)}</span></div>
    </div>
  );
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
  return (
    <section className="statistics-period-shell" aria-label="Фильтр периода">
      <div className="statistics-period-type" role="group">{PERIOD_TYPES.map((item) => <button key={item.key} className={type === item.key ? 'active' : ''} type="button" onClick={() => onTypeChange(item.key)}>{item.label}</button>)}</div>
      <div className="statistics-period-nav">
        <button type="button" aria-label="Предыдущий период" onClick={() => onAnchorChange(shiftPeriod(anchor, type, -1))}>‹</button>
        <button className="statistics-period-label" type="button" onClick={() => onAnchorChange(today)}><strong>{bounds.label}</strong><span>нажмите, чтобы вернуться к текущему периоду</span></button>
        <button type="button" aria-label="Следующий период" onClick={() => onAnchorChange(shiftPeriod(anchor, type, 1))}>›</button>
      </div>
    </section>
  );
}

function MetricsGrid({ metrics }) {
  return <section className="statistics-metric-grid">
    <article><span>Тренировок</span><strong>{metrics.workouts}</strong><small>завершено</small></article>
    <article><span>Время</span><strong>{formatCompactDuration(metrics.duration)}</strong><small>{formatDuration(metrics.duration)}</small></article>
    <article><span>Тоннаж</span><strong>{formatVolume(metrics.volume)}</strong><small>только рабочие</small></article>
    <article><span>Подходов</span><strong>{metrics.workingSets}</strong><small>рабочих</small></article>
  </section>;
}

function FavoritesView({ filtered, metrics, recentWorkouts, exerciseRecords }) {
  if (!filtered.sessions.length) return <EmptyState />;
  return <>
    <MetricsGrid metrics={metrics} />
    <section className="statistics-section">
      <div className="statistics-section-head"><div><span>Динамика</span><h2>Тоннаж тренировок</h2></div><small>кг</small></div>
      <WorkoutVolumeChart workouts={recentWorkouts} />
    </section>
    <ActivityCalendar sessions={filtered.sessions} />
    <section className="statistics-section">
      <div className="statistics-section-head"><div><span>Сила</span><h2>Прогресс по упражнениям</h2></div><small>e1RM</small></div>
      {exerciseRecords.length === 0 ? <p className="statistics-muted">Нужны рабочие подходы с весом и повторами.</p> : <div className="statistics-exercise-list">{exerciseRecords.map((record) => <div className="statistics-exercise-row statistics-exercise-row-static" key={record.key}><div className="statistics-exercise-copy"><strong>{record.name}</strong><span>Лучший: {formatWeight(record.bestSet.weight)} кг × {record.bestSet.reps} · e1RM {Math.round(record.best)} кг</span></div><ExerciseProgress record={record} /><span className="statistics-exercise-chevron"><ChevronIcon /></span></div>)}</div>}
    </section>
  </>;
}

function WorkoutsView({ filtered, metrics, recentWorkouts, exerciseRecords }) {
  if (!filtered.sessions.length) return <EmptyState />;
  const avgDuration = metrics.workouts ? metrics.duration / metrics.workouts : 0;
  const avgVolume = metrics.workouts ? metrics.volume / metrics.workouts : 0;
  const avgSets = metrics.workouts ? metrics.workingSets / metrics.workouts : 0;
  return <>
    <MetricsGrid metrics={metrics} />
    <section className="statistics-section">
      <div className="statistics-section-head"><div><span>Средние показатели</span><h2>Одна тренировка</h2></div><small>{metrics.workouts} шт.</small></div>
      <div className="statistics-average-grid">
        <article><span>Время</span><strong>{formatDuration(avgDuration)}</strong></article>
        <article><span>Тоннаж</span><strong>{formatVolume(avgVolume)}</strong></article>
        <article><span>Подходов</span><strong>{Math.round(avgSets * 10) / 10}</strong></article>
      </div>
    </section>
    <section className="statistics-section">
      <div className="statistics-section-head"><div><span>Динамика</span><h2>Тоннаж по тренировкам</h2></div><small>последние {recentWorkouts.length}</small></div>
      <WorkoutVolumeChart workouts={recentWorkouts} />
    </section>
    <section className="statistics-section">
      <div className="statistics-section-head"><div><span>Упражнения</span><h2>Силовые показатели</h2></div><small>e1RM</small></div>
      {exerciseRecords.length === 0 ? <p className="statistics-muted">Пока недостаточно данных.</p> : <div className="statistics-exercise-list">{exerciseRecords.map((record) => <div className="statistics-exercise-row statistics-exercise-row-static" key={record.key}><div className="statistics-exercise-copy"><strong>{record.name}</strong><span>{formatWeight(record.bestSet.weight)} кг × {record.bestSet.reps} · e1RM {Math.round(record.best)} кг</span></div><ExerciseProgress record={record} /><span /></div>)}</div>}
    </section>
    <section className="statistics-section recent-list-section">
      <div className="statistics-section-head"><div><span>История</span><h2>Тренировки периода</h2></div><small>{filtered.sessions.length}</small></div>
      <div className="statistics-recent-list">{recentWorkouts.map((item) => <article key={item.id}><div><strong>{item.workoutName}</strong><span>{formatDate(item.date, true)} · {formatDuration(item.durationSeconds)}</span></div><b>{formatVolume(item.volume)}</b></article>)}</div>
    </section>
  </>;
}

function MeasurementsView({ measurements, bounds, onSave }) {
  const [draft, setDraft] = useState(() => ({ date: dateKey(new Date()), weight: '', chest: '', waist: '', hips: '', biceps: '' }));
  const filtered = useMemo(() => measurements.filter((item) => inBounds(item.date, bounds)).sort((a, b) => a.date.localeCompare(b.date)), [measurements, bounds]);

  function submit(event) {
    event.preventDefault();
    const hasValue = ['weight', 'chest', 'waist', 'hips', 'biceps'].some((field) => Number(draft[field]) > 0);
    if (!draft.date || !hasValue) return;
    const record = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      date: draft.date,
      weight: draft.weight === '' ? null : Number(draft.weight),
      chest: draft.chest === '' ? null : Number(draft.chest),
      waist: draft.waist === '' ? null : Number(draft.waist),
      hips: draft.hips === '' ? null : Number(draft.hips),
      biceps: draft.biceps === '' ? null : Number(draft.biceps),
    };
    onSave([...measurements, record].sort((a, b) => a.date.localeCompare(b.date)));
    setDraft((current) => ({ ...current, weight: '', chest: '', waist: '', hips: '', biceps: '' }));
  }

  return <>
    <section className="statistics-section statistics-measurement-entry">
      <div className="statistics-section-head"><div><span>Новая запись</span><h2>Добавить замеры</h2></div></div>
      <form className="statistics-measurement-form" onSubmit={submit}>
        <label className="statistics-field wide"><span>Дата</span><input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} /></label>
        <label className="statistics-field"><span>Вес, кг</span><input inputMode="decimal" value={draft.weight} onChange={(e) => setDraft({ ...draft, weight: e.target.value.replace(',', '.') })} placeholder="72.4" /></label>
        <label className="statistics-field"><span>Талия, см</span><input inputMode="decimal" value={draft.waist} onChange={(e) => setDraft({ ...draft, waist: e.target.value.replace(',', '.') })} placeholder="80" /></label>
        <label className="statistics-field"><span>Грудь, см</span><input inputMode="decimal" value={draft.chest} onChange={(e) => setDraft({ ...draft, chest: e.target.value.replace(',', '.') })} placeholder="100" /></label>
        <label className="statistics-field"><span>Бёдра, см</span><input inputMode="decimal" value={draft.hips} onChange={(e) => setDraft({ ...draft, hips: e.target.value.replace(',', '.') })} placeholder="96" /></label>
        <label className="statistics-field wide"><span>Бицепс, см</span><input inputMode="decimal" value={draft.biceps} onChange={(e) => setDraft({ ...draft, biceps: e.target.value.replace(',', '.') })} placeholder="36" /></label>
        <button className="statistics-primary-action wide" type="submit">Сохранить замеры</button>
      </form>
    </section>

    <section className="statistics-section">
      <div className="statistics-section-head"><div><span>Динамика</span><h2>Вес</h2></div><small>кг</small></div>
      <TrendChart records={filtered} field="weight" label="Текущий вес" unit="кг" />
    </section>
    <section className="statistics-section">
      <div className="statistics-section-head"><div><span>Динамика</span><h2>Талия</h2></div><small>см</small></div>
      <TrendChart records={filtered} field="waist" label="Текущая талия" unit="см" />
    </section>

    <section className="statistics-section">
      <div className="statistics-section-head"><div><span>История</span><h2>Замеры периода</h2></div><small>{filtered.length}</small></div>
      {filtered.length === 0 ? <p className="statistics-muted">В выбранном периоде замеров нет.</p> : <div className="statistics-measurement-history">{[...filtered].reverse().map((item) => <article key={item.id}><div><strong>{formatDate(item.date, true)}</strong><span>{item.weight ? `${formatWeight(item.weight)} кг` : 'Вес —'}</span></div><div className="statistics-measurement-values"><span>Талия <b>{item.waist || '—'}</b></span><span>Грудь <b>{item.chest || '—'}</b></span><span>Бёдра <b>{item.hips || '—'}</b></span><span>Бицепс <b>{item.biceps || '—'}</b></span></div><button type="button" onClick={() => onSave(measurements.filter((record) => record.id !== item.id))}>Удалить</button></article>)}</div>}
    </section>
  </>;
}

function PhotosView({ photos, bounds, onSave }) {
  const [photoDate, setPhotoDate] = useState(dateKey(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const filtered = useMemo(() => photos.filter((item) => inBounds(item.date, bounds)).sort((a, b) => b.date.localeCompare(a.date)), [photos, bounds]);

  async function addPhotos(event) {
    const files = Array.from(event.target.files || []).slice(0, 4);
    event.target.value = '';
    if (!files.length) return;
    setBusy(true);
    setError('');
    try {
      const items = [];
      for (const file of files) {
        if (!file.type.startsWith('image/')) continue;
        const dataUrl = await resizePhoto(file);
        items.push({ id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, date: photoDate, dataUrl });
      }
      const next = [...items, ...photos].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 12);
      onSave(next);
    } catch {
      setError('Не удалось сохранить фото. Попробуйте выбрать файл меньшего размера.');
    } finally {
      setBusy(false);
    }
  }

  return <>
    <section className="statistics-photo-uploader">
      <div><span>Фото прогресса</span><h2>Следите за изменениями тела</h2><p>Добавляйте фото в одинаковом ракурсе и освещении — так динамику проще сравнивать.</p></div>
      <label className="statistics-field"><span>Дата фото</span><input type="date" value={photoDate} onChange={(e) => setPhotoDate(e.target.value)} /></label>
      <label className={`statistics-photo-add${busy ? ' disabled' : ''}`}><input type="file" accept="image/*" multiple disabled={busy} onChange={addPhotos} /><span>{busy ? 'Обрабатываем…' : '+ Добавить фото'}</span></label>
      {error && <p className="statistics-photo-error">{error}</p>}
      <small>В текущей версии фото хранятся локально на этом устройстве.</small>
    </section>

    <section className="statistics-section">
      <div className="statistics-section-head"><div><span>Галерея</span><h2>Фото периода</h2></div><small>{filtered.length}</small></div>
      {filtered.length === 0 ? <div className="statistics-photo-empty"><span>＋</span><strong>Пока нет фотографий</strong><p>Добавьте первое фото прогресса.</p></div> : <div className="statistics-photo-grid">{filtered.map((photo) => <article key={photo.id}><img src={photo.dataUrl} alt={`Фото прогресса ${formatDate(photo.date, true)}`} /><div><strong>{formatDate(photo.date, true)}</strong><button type="button" onClick={() => onSave(photos.filter((item) => item.id !== photo.id))}>Удалить</button></div></article>)}</div>}
    </section>
  </>;
}

export function StatisticsScreen() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [reloadKey, setReloadKey] = useState(0);
  const [tab, setTab] = useState('favorites');
  const [periodType, setPeriodType] = useState('month');
  const [periodAnchor, setPeriodAnchor] = useState(() => dateKey(new Date()));
  const [measurements, setMeasurements] = useState(() => readLocalArray(MEASUREMENTS_KEY));
  const [photos, setPhotos] = useState(() => readLocalArray(PHOTOS_KEY));

  useEffect(() => {
    let active = true;
    setStatus('loading');
    loadStatistics().then((result) => { if (!active) return; setData(result); setStatus('ready'); }).catch(() => { if (!active) return; setStatus('error'); });
    return () => { active = false; };
  }, [reloadKey]);

  const bounds = useMemo(() => periodBounds(periodType, periodAnchor), [periodType, periodAnchor]);
  const filtered = useMemo(() => filterDataset(data, bounds), [data, bounds]);

  const metrics = useMemo(() => {
    const workingSets = filtered.sets.filter((set) => set.setType === 'working');
    return {
      workouts: filtered.sessions.length,
      duration: filtered.sessions.reduce((sum, session) => sum + Number(session.durationSeconds || 0), 0),
      volume: workingSets.reduce((sum, set) => sum + Number(set.volume || 0), 0),
      workingSets: workingSets.length,
    };
  }, [filtered]);

  const recentWorkouts = useMemo(() => {
    const setsBySession = new Map();
    filtered.sets.filter((set) => set.setType === 'working').forEach((set) => setsBySession.set(set.sessionId, [...(setsBySession.get(set.sessionId) || []), set]));
    return [...filtered.sessions]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, 8)
      .map((session) => ({ ...session, volume: (setsBySession.get(session.id) || []).reduce((sum, set) => sum + Number(set.volume || 0), 0) }));
  }, [filtered]);

  const exerciseRecords = useMemo(() => {
    const groups = new Map();
    filtered.sets.filter((set) => set.setType === 'working' && set.estimatedOneRepMax > 0).forEach((set) => {
      const current = groups.get(set.exerciseKey) || { key: set.exerciseKey, name: set.exerciseName, best: 0, bestSet: null, pointsByDate: new Map() };
      if (set.estimatedOneRepMax > current.best) { current.best = set.estimatedOneRepMax; current.bestSet = set; }
      const dateBest = current.pointsByDate.get(set.date) || 0;
      if (set.estimatedOneRepMax > dateBest) current.pointsByDate.set(set.date, set.estimatedOneRepMax);
      groups.set(set.exerciseKey, current);
    });
    return [...groups.values()]
      .map((item) => ({ ...item, points: [...item.pointsByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })) }))
      .sort((a, b) => b.points.length - a.points.length || b.best - a.best)
      .slice(0, 6);
  }, [filtered]);

  function saveMeasurements(next) {
    setMeasurements(next);
    saveLocalArray(MEASUREMENTS_KEY, next);
  }

  function savePhotos(next) {
    try {
      saveLocalArray(PHOTOS_KEY, next);
      setPhotos(next);
    } catch {
      throw new Error('photo-storage-failed');
    }
  }

  const workoutTab = tab === 'favorites' || tab === 'workouts';

  return (
    <div className="phone statistics-phone statistics-hub-phone">
      <header className="statistics-appbar"><div><span>Прогресс и аналитика</span><h1>Статистика</h1></div><button className="profile-btn" type="button" aria-label="Профиль"><ProfileIcon /></button></header>
      <main className="statistics-content statistics-hub-content">
        <div className="statistics-tabs" role="tablist" aria-label="Раздел статистики">{SECTION_TABS.map((item) => <button key={item.key} role="tab" aria-selected={tab === item.key} className={tab === item.key ? 'active' : ''} type="button" onClick={() => setTab(item.key)}>{item.label}</button>)}</div>
        <PeriodControls type={periodType} anchor={periodAnchor} onTypeChange={setPeriodType} onAnchorChange={setPeriodAnchor} />

        {workoutTab && status === 'loading' && <LoadingCard />}
        {workoutTab && status === 'error' && <section className="statistics-state-card error"><strong>Не удалось загрузить статистику</strong><span>Проверьте соединение и попробуйте ещё раз.</span><button type="button" onClick={() => setReloadKey((value) => value + 1)}>Повторить</button></section>}
        {tab === 'favorites' && status === 'ready' && <FavoritesView filtered={filtered} metrics={metrics} recentWorkouts={recentWorkouts} exerciseRecords={exerciseRecords} />}
        {tab === 'workouts' && status === 'ready' && <WorkoutsView filtered={filtered} metrics={metrics} recentWorkouts={recentWorkouts} exerciseRecords={exerciseRecords} />}
        {tab === 'measurements' && <MeasurementsView measurements={measurements} bounds={bounds} onSave={saveMeasurements} />}
        {tab === 'photos' && <PhotosView photos={photos} bounds={bounds} onSave={savePhotos} />}
      </main>
      <StatisticsBottomNav />
    </div>
  );
}
