import { useEffect, useMemo, useState } from 'react';
import { RootSectionHeader } from './RootSectionHeader.jsx';
import { listPrograms, listRecentCompletedPrograms } from '../lib/programs.js';
import { CatalogProgramsPanel } from './CatalogProgramsPanel.jsx';
import { ProgramListCard } from './ProgramListCard.jsx';
import { TrainingExerciseBrowser } from './TrainingExerciseBrowser.jsx';
import { ProgramDetailScreen } from './ProgramDetailScreen.jsx';
import { ReceiveProgramPanel } from './ReceiveProgramPanel.jsx';
import { EMPTY_PROGRAM_FILTERS, matchesProgramFilters, programFilterOptions } from '../lib/programFilters.js';
import '../exercise-catalog.css';
import '../program-list.css';

const TRAINING_TABS = [
  { id: 'recommendations', label: 'Рекомендации' },
  { id: 'catalog', label: 'Каталог' },
  { id: 'exercises', label: 'Упражнения' },
  { id: 'your-programs', label: 'Мои программы' },
  { id: 'received', label: 'Получить' },
  { id: 'completed', label: 'Пройденные' },
  { id: 'create', label: 'Создать' },
];

const EMPTY_COPY = {
  recommendations: { title: 'Рекомендации', text: 'Здесь появятся программы, которые подойдут под ваши цели и уровень подготовки.' },
  catalog: { title: 'Каталог программ', text: 'Готовые программы тренировок.' },
  'your-programs': { title: 'Мои программы', text: 'Здесь отображаются все программы, созданные вами.' },
  received: { title: 'Получить программу', text: 'Примите программу по ссылке от другого пользователя.' },
  completed: { title: 'Пройденные программы', text: 'Здесь отображаются 10 последних полностью пройденных программ.' },
};

function SearchIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><circle cx="11" cy="11" r="6.5" /><path d="m16 16 4 4" /></svg>; }
function FilterIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>; }
function SortIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M7 20V4m-4 4 4-4 4 4M17 4v16m-4-4 4 4 4-4" /></svg>; }
function PlusIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>; }

function EmptyPrograms({ tabId }) {
  const copy = EMPTY_COPY[tabId];
  return <section className="training-empty-programs"><div className="training-empty-mark" aria-hidden="true">—</div><strong>Пока пусто</strong><span>{copy?.text}</span></section>;
}

function programState(program) {
  const participation = program.participation;
  if (!participation) return { label: 'Не начата', tone: 'not-started' };
  if (participation.status === 'paused') return { label: 'На паузе', tone: 'paused' };
  if (participation.status === 'completed') return { label: 'Завершена', tone: 'completed' };
  if (participation.status === 'abandoned') return { label: 'Остановлена', tone: 'abandoned' };
  const now = new Date();
  const localToday = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
  if (participation.startDate > localToday) return { label: 'Запланирована', tone: 'scheduled' };
  return { label: 'Активна', tone: 'active' };
}

function ProgramCard({ program, onOpen }) {
  return <ProgramListCard program={program} onOpen={onOpen} status={programState(program)} />;
}

export function ExercisesScreen({ initialTab = 'recommendations', refreshKey = 0, onCreateProgram, onEditProgram, onStartProgram, onOpenWorkout }) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [myProgramsView, setMyProgramsView] = useState('active');
  const [programs, setPrograms] = useState([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [programsError, setProgramsError] = useState('');
  const [programsReloadKey, setProgramsReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [programFilters, setProgramFilters] = useState(EMPTY_PROGRAM_FILTERS);
  const [sortDirection, setSortDirection] = useState('asc');
  const [sortOpen, setSortOpen] = useState(false);
  const [selectedProgramId, setSelectedProgramId] = useState(null);

  useEffect(() => { setActiveTab(initialTab === 'my-exercises' ? 'exercises' : initialTab); }, [initialTab]);

  useEffect(() => {
    if (!['your-programs', 'completed'].includes(activeTab)) return undefined;
    let active = true;
    setProgramsLoading(true);
    setProgramsError('');
    (activeTab === 'completed' ? listRecentCompletedPrograms() : listPrograms())
      .then((data) => { if (active) setPrograms(data); })
      .catch((requestError) => { if (active) setProgramsError(requestError?.message || 'Не удалось загрузить ваши программы.'); })
      .finally(() => { if (active) setProgramsLoading(false); });
    return () => { active = false; };
  }, [activeTab, refreshKey, programsReloadKey]);

  useEffect(() => { setQuery(''); setFiltersOpen(false); setSortOpen(false); setProgramFilters(EMPTY_PROGRAM_FILTERS); }, [activeTab]);
  useEffect(() => { if (activeTab === 'your-programs') setMyProgramsView('active'); }, [activeTab]);

  const filteredPrograms = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru');
    let result = programs.filter((program) => {
      if (activeTab === 'completed' && program.participation?.status !== 'completed') return false;
      if (activeTab !== 'your-programs' && !matchesProgramFilters(program, programFilters)) return false;
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
      result = result.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    }
    return result;
  }, [programs, query, sortDirection, activeTab, programFilters]);

  const isCatalogTab = activeTab === 'catalog';
  const isCompletedTab = activeTab === 'completed';
  const isProgramsTab = activeTab === 'your-programs' || isCompletedTab;
  const hasProgramFilters = false;
  const filterOptions = programFilterOptions(programs);
  const activePrograms = filteredPrograms.filter(program => ['active','paused'].includes(program.participation?.status));
  const personalPrograms = filteredPrograms.filter(program => !program.sourceCatalogProgramId);

  function openCreateProgram() {
    if (onCreateProgram) return onCreateProgram();
    setActiveTab('create');
  }

  function handleTabClick(tabId) {
    if (tabId === 'create') return openCreateProgram();
    setActiveTab(tabId === 'my-exercises' ? 'exercises' : tabId);
  }

  if (selectedProgramId) return <ProgramDetailScreen programId={selectedProgramId} onBack={() => setSelectedProgramId(null)} onEdit={(programId) => onEditProgram?.(programId)} onStart={(programId) => onStartProgram?.(programId)} onOpenWorkout={onOpenWorkout} onDeleted={() => { setSelectedProgramId(null); setProgramsReloadKey(value => value + 1); }} />;

  return <div className="phone exercise-phone">
    <RootSectionHeader title="Тренировки" />
    <main className="exercise-catalog-content">
      <nav className="training-tabs" aria-label="Разделы тренировок">{TRAINING_TABS.map((tab) => <button data-training-tab={tab.id} className={tab.id === activeTab ? 'active' : ''} type="button" key={tab.id} onClick={() => handleTabClick(tab.id)}>{tab.label}</button>)}</nav>
      {!['exercises','received'].includes(activeTab) && <label className="exercise-search training-search"><SearchIcon /><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Найти программу" aria-label="Поиск программ" />{query && <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}>×</button>}</label>}
      {['recommendations','catalog'].includes(activeTab) && <div className="training-toolbar-row compact-training-toolbar">
        <div className="training-tools" role="group" aria-label="Настройка списка программ">
          {['recommendations','catalog'].includes(activeTab) && <>
            <button className={filtersOpen ? 'active' : ''} type="button" title="Фильтры" aria-label="Фильтры" aria-expanded={filtersOpen} onClick={() => setFiltersOpen(v => !v)}><FilterIcon /></button>
            <button className={sortOpen ? 'active' : ''} type="button" title="Сортировка" aria-label="Сортировка" aria-expanded={sortOpen} onClick={() => setSortOpen(v => !v)}><SortIcon /></button>
          </>}
        </div>
        <button className="training-create-compact" type="button" onClick={openCreateProgram}><PlusIcon /><span>Создать</span></button>
      </div>}
      {activeTab === 'your-programs' && <div className="training-toolbar-row compact-training-toolbar my-programs-create-row">
        <button className="training-create-compact" type="button" onClick={openCreateProgram}><PlusIcon /><span>Создать</span></button>
      </div>}
      {activeTab === 'your-programs' && <div className="my-programs-switcher" role="tablist" aria-label="Мои программы">
          <button type="button" role="tab" id="my-programs-active-tab" aria-controls="my-programs-active-panel" aria-selected={myProgramsView === 'active'} className={myProgramsView === 'active' ? 'active' : ''} onClick={() => setMyProgramsView('active')}>Активные</button>
          <button type="button" role="tab" id="my-programs-created-tab" aria-controls="my-programs-created-panel" aria-selected={myProgramsView === 'created'} className={myProgramsView === 'created' ? 'active' : ''} onClick={() => setMyProgramsView('created')}>Мои</button>
        </div>}
      

      {sortOpen && ['recommendations','catalog'].includes(activeTab) && <section className="training-sort-picker" aria-label="Сортировка программ">
        {[['asc','Название А–Я'],['desc','Название Я–А'],['newest','Сначала новые'],['workouts','По числу тренировок'],['level','По уровню']].map(([id,label]) =>
          <button key={id} className={sortDirection === id ? 'active' : ''} type="button" onClick={() => {setSortDirection(id);setSortOpen(false);}}>{label}</button>)}
      </section>}

      {activeTab === 'received' && <ReceiveProgramPanel onAccepted={(programId) => { setProgramsReloadKey((value) => value + 1); setSelectedProgramId(programId); }} />}
      {isCatalogTab && <CatalogProgramsPanel query={query} sortDirection={sortDirection} filtersOpen={filtersOpen} onJoin={(programId) => onStartProgram?.(programId)} />}
      {activeTab === 'exercises' && <section className="training-exercise-browser" aria-label="База и мои упражнения"><TrainingExerciseBrowser refreshKey={refreshKey} /></section>}
      {isProgramsTab && programsLoading && <div className="my-programs-state"><div className="exercise-list-spinner" /><span>{isCompletedTab ? 'Загружаем пройденные программы…' : 'Загружаем ваши программы…'}</span></div>}
      {isProgramsTab && !programsLoading && programsError && <div className="my-programs-state error"><span>{programsError}</span><button type="button" onClick={() => setProgramsReloadKey((value) => value + 1)}>Повторить</button></div>}
      {activeTab === 'your-programs' && !programsLoading && !programsError && <section className="my-programs-section">
        {myProgramsView === 'active' ? <div role="tabpanel" id="my-programs-active-panel" aria-labelledby="my-programs-active-tab">
          {activePrograms.length ? <div className="my-programs-list">{activePrograms.map(program => <ProgramCard key={program.id} program={program} onOpen={setSelectedProgramId} />)}</div>
            : <p className="my-programs-segment-empty">Нет программ, которые вы сейчас выполняете.</p>}
        </div> : <div role="tabpanel" id="my-programs-created-panel" aria-labelledby="my-programs-created-tab">
          {personalPrograms.length ? <div className="my-programs-list">{personalPrograms.map(program => <ProgramCard key={program.id} program={program} onOpen={setSelectedProgramId} />)}</div>
            : <p className="my-programs-segment-empty">Пока нет созданных вами программ.</p>}
        </div>}
      </section>}
      {isCompletedTab && !programsLoading && !programsError && (filteredPrograms.length
        ? <section className="my-programs-list">{filteredPrograms.map(program =>
            <ProgramCard key={program.participation?.id || program.id} program={program} onOpen={setSelectedProgramId} />)}</section>
        : <EmptyPrograms tabId="completed" />)}
      {activeTab === 'recommendations' && <EmptyPrograms tabId={activeTab} />}
    </main>
    
  </div>;
}
