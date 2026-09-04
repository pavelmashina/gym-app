import { useEffect, useMemo, useState } from 'react';
import { loadStatistics } from '../lib/statistics.js';
import '../section-placeholder.css';
import '../statistics.css';

const RANGE_OPTIONS = [
  { key: '30d', label: '30 дней', days: 30 },
  { key: '90d', label: '90 дней', days: 90 },
  { key: 'all', label: 'Всё время', days: null },
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

function formatDate(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(`${value}T12:00:00`));
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
  return <section className="statistics-state-card"><div className="statistics-empty-mark">↗</div><strong>Пока недостаточно данных</strong><span>Завершите первую тренировку — после этого здесь появятся показатели прогресса.</span></section>;
}

export function StatisticsScreen() {
  const [data, setData] = useState(null);
  const [status, setStatus] = useState('loading');
  const [range, setRange] = useState('90d');
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setStatus('loading');
    loadStatistics().then((result) => { if (!active) return; setData(result); setStatus('ready'); }).catch(() => { if (!active) return; setStatus('error'); });
    return () => { active = false; };
  }, [reloadKey]);

  const filtered = useMemo(() => {
    if (!data) return { sessions: [], exercises: [], sets: [] };
    const option = RANGE_OPTIONS.find((item) => item.key === range);
    if (!option?.days) return data;
    const threshold = new Date();
    threshold.setHours(0, 0, 0, 0);
    threshold.setDate(threshold.getDate() - option.days + 1);
    const inRange = (value) => value && new Date(`${value}T12:00:00`) >= threshold;
    const sessions = data.sessions.filter((item) => inRange(item.date));
    const ids = new Set(sessions.map((item) => item.id));
    return { sessions, exercises: data.exercises.filter((item) => ids.has(item.sessionId)), sets: data.sets.filter((item) => ids.has(item.sessionId)) };
  }, [data, range]);

  const metrics = useMemo(() => {
    const workingSets = filtered.sets.filter((set) => set.setType === 'working');
    return {
      workouts: filtered.sessions.length,
      duration: filtered.sessions.reduce((sum, session) => sum + session.durationSeconds, 0),
      volume: workingSets.reduce((sum, set) => sum + set.volume, 0),
      workingSets: workingSets.length,
    };
  }, [filtered]);

  const recentWorkouts = useMemo(() => {
    const setsBySession = new Map();
    filtered.sets.filter((set) => set.setType === 'working').forEach((set) => setsBySession.set(set.sessionId, [...(setsBySession.get(set.sessionId) || []), set]));
    return [...filtered.sessions].reverse().slice(0, 8).map((session) => ({ ...session, volume: (setsBySession.get(session.id) || []).reduce((sum, set) => sum + set.volume, 0) }));
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
    return [...groups.values()].map((item) => ({ ...item, points: [...item.pointsByDate.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, value]) => ({ date, value })) })).sort((a, b) => b.points.length - a.points.length || b.best - a.best).slice(0, 6);
  }, [filtered]);

  const maxRecentVolume = Math.max(...recentWorkouts.map((item) => item.volume), 1);

  return (
    <div className="phone statistics-phone">
      <header className="statistics-appbar"><div><span>Аналитика тренировок</span><h1>Статистика</h1></div><button className="profile-btn" type="button" aria-label="Профиль"><ProfileIcon /></button></header>
      <main className="statistics-content">
        <div className="statistics-range" role="group" aria-label="Период статистики">{RANGE_OPTIONS.map((item) => <button key={item.key} className={range === item.key ? 'active' : ''} type="button" onClick={() => setRange(item.key)}>{item.label}</button>)}</div>
        {status === 'loading' && <LoadingCard />}
        {status === 'error' && <section className="statistics-state-card error"><strong>Не удалось загрузить статистику</strong><span>Проверьте соединение и попробуйте ещё раз.</span><button type="button" onClick={() => setReloadKey((value) => value + 1)}>Повторить</button></section>}
        {status === 'ready' && data?.sessions.length === 0 && <EmptyState />}
        {status === 'ready' && data?.sessions.length > 0 && <>
          <section className="statistics-metric-grid">
            <article><span>Тренировок</span><strong>{metrics.workouts}</strong><small>завершено</small></article>
            <article><span>Время</span><strong>{formatCompactDuration(metrics.duration)}</strong><small>{formatDuration(metrics.duration)}</small></article>
            <article><span>Тоннаж</span><strong>{formatVolume(metrics.volume)}</strong><small>только рабочие</small></article>
            <article><span>Подходов</span><strong>{metrics.workingSets}</strong><small>рабочих</small></article>
          </section>

          <section className="statistics-section">
            <div className="statistics-section-head"><div><span>Динамика</span><h2>Последние тренировки</h2></div><small>тоннаж</small></div>
            {recentWorkouts.length === 0 ? <p className="statistics-muted">В выбранном периоде тренировок нет.</p> : <div className="statistics-volume-chart">{[...recentWorkouts].reverse().map((item) => <div className="statistics-volume-column" key={item.id}><div className="statistics-volume-bar-shell"><span style={{ height: `${Math.max(6, (item.volume / maxRecentVolume) * 100)}%` }} /></div><small>{formatDate(item.date)}</small></div>)}</div>}
          </section>

          <section className="statistics-section">
            <div className="statistics-section-head"><div><span>Сила</span><h2>Прогресс по упражнениям</h2></div><small>e1RM</small></div>
            {exerciseRecords.length === 0 ? <p className="statistics-muted">Нужны рабочие подходы с весом и повторами.</p> : <div className="statistics-exercise-list">{exerciseRecords.map((record) => <article className="statistics-exercise-row" key={record.key}><div className="statistics-exercise-copy"><strong>{record.name}</strong><span>Лучший: {Math.round(record.bestSet.weight * 10) / 10} кг × {record.bestSet.reps} · e1RM {Math.round(record.best)} кг</span></div><ExerciseProgress record={record} /></article>)}</div>}
          </section>

          <section className="statistics-section recent-list-section">
            <div className="statistics-section-head"><div><span>История</span><h2>Недавние тренировки</h2></div></div>
            <div className="statistics-recent-list">{recentWorkouts.slice(0, 5).map((item) => <article key={item.id}><div><strong>{item.workoutName}</strong><span>{formatDate(item.date)} · {formatDuration(item.durationSeconds)}</span></div><b>{formatVolume(item.volume)}</b></article>)}</div>
          </section>
        </>}
      </main>
      <StatisticsBottomNav />
    </div>
  );
}
