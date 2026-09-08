import { useMemo, useState } from 'react';
import '../statistics-interactive-chart.css';

function dateFromKey(value) {
  const [year, month, day] = String(value || '').slice(0, 10).split('-').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 12, 0, 0);
}

function dateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value, full = false) {
  const date = dateFromKey(value);
  if (!date) return '—';
  return new Intl.DateTimeFormat('ru-RU', full
    ? { day: 'numeric', month: 'long', year: 'numeric' }
    : { day: '2-digit', month: '2-digit' }).format(date);
}

function formatNumber(value) {
  return (Math.round(Number(value || 0) * 10) / 10).toLocaleString('ru-RU', { maximumFractionDigits: 1 });
}

function makeDateTicks(firstKey, lastKey, count = 8) {
  const first = dateFromKey(firstKey);
  const last = dateFromKey(lastKey);
  if (!first || !last) return [];
  const start = first.getTime();
  const end = last.getTime();
  return Array.from({ length: count }, (_, index) => {
    const ratio = count === 1 ? 0 : index / (count - 1);
    return dateKey(new Date(start + (end - start) * ratio));
  });
}

function makeScale(values, count = 5) {
  const clean = values.map(Number).filter(Number.isFinite);
  const rawMin = Math.min(...clean);
  const rawMax = Math.max(...clean);
  let min = rawMin - Math.abs(rawMin) * .1;
  let max = rawMax + Math.abs(rawMax) * .1;
  if (min === max) {
    const extra = Math.max(Math.abs(rawMax) * .1, 1);
    min -= extra;
    max += extra;
  }
  return {
    min,
    max,
    ticks: Array.from({ length: count }, (_, index) => max - ((max - min) * index) / (count - 1)),
  };
}

export function ScaledTrendChart({ records, field, label, unit }) {
  const [selectedKey, setSelectedKey] = useState(null);
  const points = useMemo(() => records
    .filter((item) => Number.isFinite(Number(item[field])) && Number(item[field]) > 0 && item.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((item, index) => ({ id: item.id || `${item.date}-${index}`, date: item.date, value: Number(item[field]) })), [records, field]);

  if (!points.length) return <p className="statistics-muted">Добавьте данные, чтобы появилась динамика.</p>;

  const width = 360;
  const height = 220;
  const plot = { left: 62, right: 12, top: 16, bottom: 42 };
  const plotWidth = width - plot.left - plot.right;
  const plotHeight = height - plot.top - plot.bottom;
  const scale = makeScale(points.map((item) => item.value), 5);
  const range = Math.max(scale.max - scale.min, .0001);
  const firstDate = dateFromKey(points[0].date)?.getTime() || 0;
  const lastDate = dateFromKey(points[points.length - 1].date)?.getTime() || firstDate;
  const timeRange = Math.max(lastDate - firstDate, 1);
  const dateTicks = makeDateTicks(points[0].date, points[points.length - 1].date, 8);

  const coords = points.map((item) => {
    const timestamp = dateFromKey(item.date)?.getTime() || firstDate;
    return {
      ...item,
      x: points.length === 1 ? plot.left + plotWidth / 2 : plot.left + ((timestamp - firstDate) / timeRange) * plotWidth,
      y: plot.top + ((scale.max - item.value) / range) * plotHeight,
    };
  });
  const selected = coords.find((item) => item.id === selectedKey) || null;
  const polyline = coords.map((item) => `${item.x},${item.y}`).join(' ');
  const latest = points[points.length - 1];

  return (
    <div className="statistics-scaled-chart-wrap">
      <div className="statistics-trend-value"><span>{label}</span><strong>{formatNumber(latest.value)} {unit}</strong><small>{formatDate(latest.date, true)}</small></div>
      <div className="statistics-scaled-chart-stage">
        {selected && <div className="statistics-point-popover" style={{ left: `${(selected.x / width) * 100}%`, top: `${(selected.y / height) * 100}%` }}><span>{formatDate(selected.date, true)}</span><strong>{formatNumber(selected.value)} {unit}</strong></div>}
        <svg className="statistics-scaled-chart" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`Динамика: ${label}`}>
          {scale.ticks.map((tick, index) => {
            const y = plot.top + (index / (scale.ticks.length - 1)) * plotHeight;
            return <g key={`y-${index}`}><line x1={plot.left} y1={y} x2={width - plot.right} y2={y} className="statistics-scaled-grid" /><text x={plot.left - 8} y={y + 3} textAnchor="end" className="statistics-scaled-y-label">{formatNumber(tick)} {unit}</text></g>;
          })}
          {dateTicks.map((tick, index) => {
            const x = plot.left + (index / (dateTicks.length - 1)) * plotWidth;
            return <g key={`x-${index}`}><line x1={x} y1={plot.top} x2={x} y2={plot.top + plotHeight} className="statistics-scaled-grid vertical" /><text x={x} y={height - 14} textAnchor="middle" className="statistics-scaled-x-label">{formatDate(tick)}</text></g>;
          })}
          <polyline points={polyline} fill="none" className="statistics-scaled-line" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          {coords.map((item) => <circle key={item.id} cx={item.x} cy={item.y} r={selectedKey === item.id ? 6 : 4.5} className={`statistics-scaled-dot${selectedKey === item.id ? ' selected' : ''}`} role="button" tabIndex="0" aria-label={`${formatDate(item.date, true)}: ${formatNumber(item.value)} ${unit}`} onClick={() => setSelectedKey((current) => current === item.id ? null : item.id)} onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); setSelectedKey((current) => current === item.id ? null : item.id); } }} />)}
        </svg>
      </div>
      <div className="statistics-scaled-chart-caption"><span>{label}, {unit}</span><span>Дата</span></div>
    </div>
  );
}
