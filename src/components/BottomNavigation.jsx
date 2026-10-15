const items = [
  { id: 'training', label: 'Тренировки', icon: TrainingIcon },
  { id: 'statistics', label: 'Статистика', icon: StatisticsIcon },
  { id: 'home', label: 'Главная', icon: HomeIcon, home: true },
  { id: 'nutrition', label: 'Питание', icon: NutritionIcon },
  { id: 'sportpit', label: 'Спортпит', icon: SportPitIcon },
];

function TrainingIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6M7 7v10M17 7v10M20 9v6M7 12h10" /></svg>;
}
function StatisticsIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 19V11M12 19V5M19 19v-9" /></svg>;
}
function HomeIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 11 8-7 8 7v9h-6v-6h-4v6H4z" /></svg>;
}
function NutritionIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 3v7M4 3v5c0 2 1.3 3 3 3s3-1 3-3V3M7 11v10M16 3v18M16 3c3 2 4 5 4 8h-4" /></svg>;
}
function SportPitIcon() {
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 3h8M9 3v4l-2 2v10c0 1.1.9 2 2 2h6c1.1 0 2-.9 2-2V9l-2-2V3M8 12h8" /></svg>;
}

export function BottomNavigation({ activeScreen, onNavigate }) {
  return <nav className="app-bottom-nav" aria-label="Основная навигация">
    {items.map(({ id, label, icon: Icon, home }) => {
      const active = activeScreen === id;
      return <button
        key={id}
        type="button"
        className={`app-nav-item${home ? ' home' : ''}${active ? ' active' : ''}`}
        aria-current={active ? 'page' : undefined}
        aria-label={label}
        onClick={() => onNavigate(id)}
      >
        <span className="app-nav-icon"><Icon /></span>
        <span className="app-nav-label">{label}</span>
      </button>;
    })}
  </nav>;
}
