import { useEffect, useMemo, useState } from 'react';
import { listPrograms } from '../lib/programs.js';
import { CatalogProgramsPanel } from './CatalogProgramsPanel.jsx';
import { ProgramDetailScreen } from './ProgramDetailScreen.jsx';
import { EMPTY_PROGRAM_FILTERS, matchesProgramFilters, programFilterOptions } from '../lib/programFilters.js';
import '../exercise-catalog.css';
import '../program-list.css';

const TRAINING_TABS = [
  { id: 'recommendations', label: 'Рекомендации' },
  { id: 'catalog', label: 'Каталог' },
  { id: 'your-programs', label: 'Мои программы' },
  { id: 'completed', label: 'Пройденные программы' },
  { id: 'create', label: 'Создать свою программу' },
];

const EMPTY_COPY = {
  recommendations: { title: 'Рекомендации', text: 'Здесь появятся программы, которые подойдут под ваши цели и уровень подготовки.' },
  catalog: { title: 'Каталог программ', text: 'Готовые программы тренировок.' },
  'your-programs': { title: 'Мои программы', text: 'Здесь отображаются все программы, созданные вами.' },
  completed: { title: 'Пройденные программы', text: 'Здесь отображаются 10 последних полностью пройденных программ.' },
};

function SearchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>; }
function ProfileIcon() { return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="16" cy="11" r="5" /><path d="M7 27c1.2-5.7 4.2-8.4 9-8.4s7.8 2.7 9 8.4" /></svg>; }
function FilterIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>; }
function SortIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M8 6h9M8 12h6M8 18h3" /><path d="m4 5 2 2 2-2M6 7v11" /></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>; }

function EmptyPrograms({ tabId }) {
  const copy = EMPTY_COPY[tabId];
  return <section className="training-empty-programs"><div className="training-empty-mark" aria-hidden="true">—</div><strong>Пока пусто</strong><span>{copy?.text}</span></section>;
}

function formatShortDate(dateString) {
  if (!dateString) return '';
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'short' }).format(new Date(`${dateString}T12:00:00`));
}

function programState(program) {
  const participation = program.participation;
  if (!participation) return { label: 'Не начата', tone: 'not-started' };
  if (participation.status === 'paused') return { label: 'На паузе', tone: 'paused' };
  if (participation.status === 'completed') return { label: 'Завершена', tone: 'completed' };
  if (participation.status === 'abandoned') return { label: 'Остановлена', tone: 'abandoned' };
  const now = new Date();
  const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  if (participation.startDate > localToday) return { label: `Старт ${formatShortDate(participation.startDate)}`, tone: 'scheduled' };
  return { label: 'Активна', tone: 'active' };
}

function ProgramCard({ program, onOpen }) {
  const state = programState(program);
  const isCycle = program.structureMode === 'cycle';
  return <button className="my-program-card" type="button" onClick={() => onOpen(program.id)}>
    <span className="my-program-cover">{program.coverUrl ? <img src={program.coverUrl} alt="" /> : <span className="program-neutral-placeholder" aria-hidden="true" />}</span>
    <span className="my-program-copy"><span className={`my-program-status ${state.tone}`}>{state.label}</span><strong>{program.name}</strong>
      <span className="my-program-meta">
        {isCycle ? <><span>{program.templateWorkoutCount} в цикле</span><span>{program.cycleRepeatCount} цик.</span><span>{program.totalPlannedWorkoutCount} всего</span></> : <><span>{program.templateWorkoutCount} трен.</span><span>Старая структура</span></>}
        {program.level && <span>{program.level}</span>}
      </span>
      {program.categories.length > 0 && <span className="my-program-tags">{program.categories.slice(0, 2).map((category) => <span key={category}>{category}</span>)}</span>}
    </span><span className="my-program-arrow" aria-hidden="true">›</span>
  </button>;
}

export function ExercisesScreen({ initialTab = 'recommendations', refreshKey = 0, onCreateProgram, onEditProgram, onStartProgram }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [programs, setPrograms] = useState([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [programsError, setProgramsError] = useState('');
  const [programsReloadKey, setProgramsReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [programFilters, setProgramFilters] = useState(EMPTY_PROGRAM_FILTERS);
  const [sortDirection, setSortDirection] = useState('asc');
  const [selectedProgramId, setSelectedProgramId] = useState(null);

  useEffect(() => { setActiveTab(initialTab); }, [initialTab]);

  useEffect(() => {
    if (!['your-programs', 'completed'].includes(activeTab)) return undefined;
    let active = true;
    setProgramsLoading(true);
    setProgramsError('');
    listPrograms()
      .then((data) => { if (active) setPrograms(data); })
      .catch((requestError) => { if (active) setProgramsError(requestError?.message || 'Не удалось загрузить ваши программы.'); })
      .finally(() => { if (active) setProgramsLoading(false); });
    return () => { active = false; };
  }, [activeTab, refreshKey, programsReloadKey]);

  useEffect(() => { setQuery(''); setFiltersOpen(false); setProgramFilters(EMPTY_PROGRAM_FILTERS); }, [activeTab]);

  const filteredPrograms = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru');
    let result = programs.filter((program) => {
      if (activeTab === 'completed' && program.participation?.status !== 'completed') return false;
      if (!matchesProgramFilters(program, programFilters)) return false;
      if (!normalizedQuery) return true;
      return [program.name, program.description, program.level, ...program.categories]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase('ru').includes(normalizedQuery));
    });

    if (activeTab === 'completed') {
      result = result
        .sort((a, b) => new Date(b.participation?.completedAt || b.participation?.updatedAt || 0) - new Date(a.participation?.completedAt || a.participation?.updatedAt || 0))
        .slice(0, 10);
    } else {
      result = result.sort((a, b) => (sortDirection === 'asc' ? 1 : -1) * a.name.localeCompare(b.name, 'ru'));
    }
    return result;
  }, [programs, query, sortDirection, activeTab, programFilters]);

  const activeTabConfig = TRAINING_TABS.find((tab) => tab.id === activeTab);
  const isCatalogTab = activeTab === 'catalog';
  const isCompletedTab = activeTab === 'completed';
  const isProgramsTab = activeTab === 'your-programs' || isCompletedTab;
  const hasProgramFilters = Object.values(programFilters).some(Boolean);
  const filterOptions = programFilterOptions(isCompletedTab ? programs.filter((program) => program.participation?.status === 'completed') : programs);

  function openCreateProgram() {
    if (onCreateProgram) return onCreateProgram();
    setActiveTab('create');
  }

  function handleTabClick(tabId) {
    if (tabId === 'create') return openCreateProgram();
    setActiveTab(tabId);
  }

  if (selectedProgramId) return <ProgramDetailScreen programId={selectedProgramId} onBack={() => setSelectedProgramId(null)} onEdit={(programId) => onEditProgram?.(programId)} onStart={(programId) => onStartProgram?.(programId)} />;

  return <div className="phone exercise-phone">
    <header className="exercise-appbar"><div><span className="exercise-eyebrow">Раздел</span><h1>Тренировки</h1></div><button className="profile-btn" type="button" aria-label="Профиль"><ProfileIcon /></button></header>
    <main className="exercise-catalog-content">
      <label className="exercise-search training-search"><SearchIcon /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти программу" aria-label="Поиск программ" />{query && <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}>×</button>}</label>
      <nav className="training-tabs" aria-label="Разделы тренировок">{TRAINING_TABS.map((tab) => <button className={tab.id === activeTab ? 'active' : ''} type="button" key={tab.id} onClick={() => handleTabClick(tab.id)}>{tab.label}</button>)}</nav>
      <section className="training-section-head"><div className="training-section-title"><span>Программы</span><h2>{EMPTY_COPY[activeTab]?.title ?? activeTabConfig?.label}</h2></div><div className="training-tools">{(isCatalogTab || isProgramsTab) && <button className={filtersOpen || (isProgramsTab && hasProgramFilters) ? 'active' : ''} type="button" onClick={() => setFiltersOpen((current) => !current)} aria-expanded={filtersOpen}><FilterIcon /><span>Фильтры{isProgramsTab && hasProgramFilters ? ' •' : ''}</span></button>}{(isCatalogTab || activeTab === 'your-programs') && <button type="button" onClick={() => setSortDirection((current) => current === 'asc' ? 'desc' : 'asc')}><SortIcon /><span>{sortDirection === 'asc' ? 'А–Я' : 'Я–А'}</span></button>}</div></section>

      {isProgramsTab && filtersOpen && <section className="program-list-filters" aria-label="Фильтры программ">
        {Object.entries({ place: 'Место тренировок', category: 'Направление', level: 'Уровень' }).map(([key, label]) => <label key={key}><span>{label}</span><select value={programFilters[key]} onChange={(event) => setProgramFilters((current) => ({ ...current, [key]: event.target.value }))}><option value="">Все</option>{filterOptions[key].map((value) => <option key={value} value={value}>{value}</option>)}</select></label>)}
        <button type="button" disabled={!hasProgramFilters} onClick={() => setProgramFilters(EMPTY_PROGRAM_FILTERS)}>Сбросить фильтры</button>
      </section>}

      {!isCatalogTab && !isCompletedTab && <button className="create-program-wide" type="button" onClick={openCreateProgram}><span className="create-program-plus"><PlusIcon /></span><span className="create-program-copy"><strong>Создать свою программу</strong><small>Соберите тренировочный цикл из упражнений</small></span><span className="create-program-arrow">›</span></button>}

      {isCatalogTab && <CatalogProgramsPanel query={query} sortDirection={sortDirection} filtersOpen={filtersOpen} onJoin={(programId) => onStartProgram?.(programId)} />}
      {isProgramsTab && programsLoading && <div className="my-programs-state"><div className="exercise-list-spinner" /><span>{isCompletedTab ? 'Загружаем пройденные программы…' : 'Загружаем ваши программы…'}</span></div>}
      {isProgramsTab && !programsLoading && programsError && <div className="my-programs-state error"><span>{programsError}</span><button type="button" onClick={() => setProgramsReloadKey((value) => value + 1)}>Повторить</button></div>}
      {isProgramsTab && !programsLoading && !programsError && filteredPrograms.length > 0 && <section className="my-programs-list">{filteredPrograms.map((program) => <ProgramCard key={`${activeTab}-${program.id}`} program={program} onOpen={setSelectedProgramId} />)}</section>}
      {isProgramsTab && !programsLoading && !programsError && filteredPrograms.length === 0 && (query || hasProgramFilters ? <div className="my-programs-state">По выбранным условиям программы не найдены.<button type="button" onClick={() => { setQuery(''); setProgramFilters(EMPTY_PROGRAM_FILTERS); }}>Сбросить поиск и фильтры</button></div> : <EmptyPrograms tabId={activeTab} />)}
      {!isProgramsTab && !isCatalogTab && <EmptyPrograms tabId={activeTab} />}
    </main>
    
  </div>;
}
