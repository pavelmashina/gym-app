import { useEffect, useMemo, useState } from 'react';
import { listPrograms } from '../lib/programs.js';
import { supabase } from '../lib/supabase.js';
import { ProgramDetailScreen } from './ProgramDetailScreen.jsx';
import '../exercise-catalog.css';
import '../program-list.css';

const ALL_GROUPS = 'Все';

const TRAINING_TABS = [
  { id: 'recommendations', label: 'Рекомендации' },
  { id: 'catalog', label: 'Каталог' },
  { id: 'your-programs', label: 'Мои программы' },
  { id: 'completed', label: 'Пройденные программы' },
  { id: 'create', label: 'Создать свою программу' },
];

const EMPTY_COPY = {
  recommendations: {
    title: 'Рекомендации',
    text: 'Здесь появятся программы, которые подойдут под ваши цели и уровень подготовки.',
  },
  catalog: {
    title: 'Каталог программ',
    text: 'Здесь будет общий каталог готовых тренировочных программ.',
  },
  'your-programs': {
    title: 'Мои программы',
    text: 'Здесь будут программы, которые вы создали или к которым присоединились.',
  },
  completed: {
    title: 'Пройденные программы',
    text: 'Здесь появится история завершённых тренировочных программ.',
  },
};

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function ProfileIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="16" cy="11" r="5" />
      <path d="M7 27c1.2-5.7 4.2-8.4 9-8.4s7.8 2.7 9 8.4" />
    </svg>
  );
}

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M4 6h16M7 12h10M10 18h4" />
    </svg>
  );
}

function SortIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <path d="M8 6h9M8 12h6M8 18h3" />
      <path d="m4 5 2 2 2-2M6 7v11" />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function Difficulty({ value }) {
  if (!value) return null;

  return (
    <span className="exercise-difficulty" aria-label={`Сложность ${value} из 3`}>
      {Array.from({ length: 3 }, (_, index) => (
        <i className={index < value ? 'active' : ''} key={index} />
      ))}
    </span>
  );
}

function ExerciseRow({ exercise, onOpen }) {
  return (
    <button className="exercise-row" type="button" onClick={() => onOpen(exercise)}>
      <div className="exercise-row-main">
        <strong>{exercise.name}</strong>
        <div className="exercise-row-meta">
          <span>{exercise.muscle_group}</span>
          {exercise.movement_type && <span>{exercise.movement_type}</span>}
        </div>
      </div>
      <div className="exercise-row-side">
        <Difficulty value={exercise.difficulty} />
        <span className="exercise-chevron" aria-hidden="true">›</span>
      </div>
    </button>
  );
}

function ExerciseDetail({ exercise, onClose }) {
  return (
    <div className="exercise-detail-layer" role="dialog" aria-modal="true" aria-label={exercise.name}>
      <div className="exercise-detail-phone">
        <header className="exercise-detail-header">
          <button className="exercise-back" type="button" aria-label="Назад к списку" onClick={onClose}>
            <BackIcon />
          </button>
          <span>Упражнение</span>
          <span className="exercise-header-spacer" />
        </header>

        <main className="exercise-detail-content">
          <section className="exercise-detail-hero">
            <div className="exercise-detail-kicker">{exercise.muscle_group}</div>
            <h1>{exercise.name}</h1>
            <div className="exercise-detail-tags">
              {exercise.exercise_type && <span>{exercise.exercise_type}</span>}
              {exercise.movement_type && <span>{exercise.movement_type}</span>}
              {exercise.difficulty && <span>Сложность {exercise.difficulty}/3</span>}
            </div>
          </section>

          {(exercise.target_muscle || exercise.synergists) && (
            <section className="exercise-info-card">
              {exercise.target_muscle && (
                <div className="exercise-info-row">
                  <span>Основная мышца</span>
                  <strong>{exercise.target_muscle}</strong>
                </div>
              )}
              {exercise.synergists && (
                <div className="exercise-info-row">
                  <span>Дополнительно работают</span>
                  <strong>{exercise.synergists}</strong>
                </div>
              )}
            </section>
          )}

          <section className="exercise-technique-card">
            <div className="exercise-section-label">Техника выполнения</div>
            {exercise.technique ? (
              <p>{exercise.technique}</p>
            ) : (
              <div className="exercise-technique-empty">Описание техники пока не добавлено.</div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function TrainingBottomNav() {
  return (
    <nav className="bottom-nav exercise-bottom-nav" aria-label="Основная навигация">
      <button className="nav-item exercise-nav-active" type="button">
        <svg viewBox="0 0 32 32" fill="none" strokeWidth="1.8">
          <path d="m8 20 12-12M7 16l9 9M5 19l8 8M19 5l8 8M16 7l9 9" />
          <path d="m4 21 7 7M21 4l7 7" />
        </svg>
        <span>Тренировки</span>
      </button>

      <button className="nav-item" type="button">
        <svg viewBox="0 0 32 32" fill="none" strokeWidth="1.7">
          <rect x="5" y="16" width="4" height="10" rx="1" />
          <rect x="14" y="7" width="4" height="19" rx="1" />
          <rect x="23" y="12" width="4" height="14" rx="1" />
        </svg>
        <span>Статистика</span>
      </button>

      <button className="nav-item home" type="button">
        <span className="home-circle">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="m5 15 11-10 11 10v12H19v-8h-6v8H5V15Z" />
          </svg>
        </span>
        <span>Главная</span>
      </button>

      <button className="nav-item" type="button">
        <svg viewBox="0 0 32 32" fill="none" strokeWidth="1.6">
          <path d="M9 5v9M6 5v6c0 2 1.2 3 3 3s3-1 3-3V5M9 14v13M21 5v22M21 5c4 3 4 9 0 12" />
        </svg>
        <span>Питание</span>
      </button>

      <button className="nav-item" type="button">
        <svg viewBox="0 0 32 32" fill="none" strokeWidth="1.5">
          <path d="M10 7h12l2 5-2 13H10L8 12l2-5Z" />
          <path d="M12 7V4h8v3M11 15h10M15 12v6M12 15h6" />
        </svg>
        <span>СпортПит</span>
      </button>
    </nav>
  );
}

function EmptyPrograms({ tabId }) {
  const copy = EMPTY_COPY[tabId];

  return (
    <section className="training-empty-programs">
      <div className="training-empty-mark" aria-hidden="true">—</div>
      <strong>Пока пусто</strong>
      <span>{copy?.text}</span>
    </section>
  );
}

function ProgramCard({ program, onOpen }) {
  const initial = program.name?.trim()?.slice(0, 1)?.toUpperCase() || 'P';

  return (
    <button className="my-program-card" type="button" onClick={() => onOpen(program.id)}>
      <span className="my-program-cover">
        {program.coverUrl ? <img src={program.coverUrl} alt="" /> : <span>{initial}</span>}
      </span>
      <span className="my-program-copy">
        <strong>{program.name}</strong>
        <span className="my-program-meta">
          <span>{program.weekCount} нед.</span>
          {program.level && <span>{program.level}</span>}
        </span>
        {program.categories.length > 0 && (
          <span className="my-program-tags">
            {program.categories.slice(0, 2).map((category) => <span key={category}>{category}</span>)}
          </span>
        )}
      </span>
      <span className="my-program-arrow" aria-hidden="true">›</span>
    </button>
  );
}

export function ExercisesScreen({
  initialTab = 'recommendations',
  refreshKey = 0,
  onCreateProgram,
  onEditProgram,
}) {
  const [activeTab, setActiveTab] = useState(initialTab);
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [programs, setPrograms] = useState([]);
  const [programsLoading, setProgramsLoading] = useState(false);
  const [programsError, setProgramsError] = useState('');
  const [programsReloadKey, setProgramsReloadKey] = useState(0);
  const [query, setQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(ALL_GROUPS);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortDirection, setSortDirection] = useState('asc');
  const [selectedExercise, setSelectedExercise] = useState(null);
  const [selectedProgramId, setSelectedProgramId] = useState(null);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    let active = true;

    async function loadExercises() {
      setLoading(true);
      setError(null);

      const { data, error: requestError } = await supabase
        .from('exercises')
        .select('id, name, muscle_group, target_muscle, synergists, exercise_type, difficulty, movement_type, technique')
        .order('name', { ascending: true });

      if (!active) return;

      if (requestError) {
        console.error('Unable to load exercise catalog:', requestError);
        setError('Не удалось загрузить упражнения. Проверьте соединение и попробуйте ещё раз.');
        setExercises([]);
      } else {
        setExercises(data ?? []);
      }

      setLoading(false);
    }

    loadExercises();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (activeTab !== 'your-programs') return undefined;

    let active = true;

    async function loadMyPrograms() {
      setProgramsLoading(true);
      setProgramsError('');

      try {
        const data = await listPrograms();
        if (active) setPrograms(data);
      } catch (requestError) {
        if (!active) return;
        console.error('Unable to load my programs:', requestError);
        setProgramsError(requestError?.message || 'Не удалось загрузить ваши программы.');
      } finally {
        if (active) setProgramsLoading(false);
      }
    }

    loadMyPrograms();
    return () => {
      active = false;
    };
  }, [activeTab, refreshKey, programsReloadKey]);

  useEffect(() => {
    setQuery('');
    setSelectedGroup(ALL_GROUPS);
    setFiltersOpen(false);
  }, [activeTab]);

  const groups = useMemo(() => {
    const values = [...new Set(exercises.map((item) => item.muscle_group).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ru'));
    return [ALL_GROUPS, ...values];
  }, [exercises]);

  const filteredExercises = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru');
    const filtered = exercises.filter((exercise) => {
      if (selectedGroup !== ALL_GROUPS && exercise.muscle_group !== selectedGroup) return false;
      if (!normalizedQuery) return true;

      return [
        exercise.name,
        exercise.muscle_group,
        exercise.target_muscle,
        exercise.synergists,
        exercise.exercise_type,
        exercise.movement_type,
      ]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase('ru').includes(normalizedQuery));
    });

    return filtered.sort((a, b) => {
      const result = a.name.localeCompare(b.name, 'ru');
      return sortDirection === 'asc' ? result : -result;
    });
  }, [exercises, query, selectedGroup, sortDirection]);

  const filteredPrograms = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru');
    const filtered = programs.filter((program) => {
      if (!normalizedQuery) return true;
      return [program.name, program.description, program.level, ...program.categories]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase('ru').includes(normalizedQuery));
    });

    return filtered.sort((a, b) => {
      const result = a.name.localeCompare(b.name, 'ru');
      return sortDirection === 'asc' ? result : -result;
    });
  }, [programs, query, sortDirection]);

  const activeTabConfig = TRAINING_TABS.find((tab) => tab.id === activeTab);
  const isCreateTab = activeTab === 'create';
  const isMyProgramsTab = activeTab === 'your-programs';

  function openCreateProgram() {
    if (onCreateProgram) {
      onCreateProgram();
      return;
    }

    setActiveTab('create');
    window.requestAnimationFrame(() => {
      document.querySelector('.training-builder')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  }

  function handleTabClick(tabId) {
    if (tabId === 'create') {
      openCreateProgram();
      return;
    }
    setActiveTab(tabId);
  }

  if (selectedProgramId) {
    return (
      <ProgramDetailScreen
        programId={selectedProgramId}
        onBack={() => setSelectedProgramId(null)}
        onEdit={(programId) => onEditProgram?.(programId)}
      />
    );
  }

  return (
    <div className="phone exercise-phone">
      <header className="exercise-appbar">
        <div>
          <span className="exercise-eyebrow">Раздел</span>
          <h1>Тренировки</h1>
        </div>
        <button className="profile-btn" type="button" aria-label="Профиль">
          <ProfileIcon />
        </button>
      </header>

      <main className="exercise-catalog-content">
        <label className="exercise-search training-search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={isCreateTab ? 'Найти упражнение' : 'Найти программу'}
            aria-label={isCreateTab ? 'Поиск упражнений' : 'Поиск программ'}
          />
          {query && (
            <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}>×</button>
          )}
        </label>

        <nav className="training-tabs" aria-label="Разделы тренировок">
          {TRAINING_TABS.map((tab) => (
            <button
              className={tab.id === activeTab ? 'active' : ''}
              type="button"
              key={tab.id}
              onClick={() => handleTabClick(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        <section className="training-section-head">
          <div className="training-section-title">
            <span>Программы</span>
            <h2>{isCreateTab ? 'Создать свою программу' : (EMPTY_COPY[activeTab]?.title ?? activeTabConfig?.label)}</h2>
          </div>

          <div className="training-tools">
            <button
              className={filtersOpen ? 'active' : ''}
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              aria-pressed={filtersOpen}
            >
              <FilterIcon />
              <span>Фильтры</span>
            </button>
            <button
              type="button"
              onClick={() => setSortDirection((current) => (current === 'asc' ? 'desc' : 'asc'))}
            >
              <SortIcon />
              <span>{sortDirection === 'asc' ? 'А–Я' : 'Я–А'}</span>
            </button>
          </div>
        </section>

        {isCreateTab && filtersOpen && (
          <div className="exercise-groups training-filter-groups" role="group" aria-label="Группа мышц">
            {groups.map((group) => (
              <button
                className={group === selectedGroup ? 'active' : ''}
                type="button"
                key={group}
                onClick={() => setSelectedGroup(group)}
              >
                {group}
              </button>
            ))}
          </div>
        )}

        {!isCreateTab && filtersOpen && (
          <div className="training-filter-placeholder">
            {isMyProgramsTab
              ? 'Фильтрацию по цели, уровню и месту тренировок подключим следующим шагом.'
              : 'Фильтры программ подключим вместе с каталогом программ.'}
          </div>
        )}

        <button className="create-program-wide" type="button" onClick={openCreateProgram}>
          <span className="create-program-plus"><PlusIcon /></span>
          <span className="create-program-copy">
            <strong>Создать свою программу</strong>
            <small>Соберите тренировочную программу из упражнений</small>
          </span>
          <span className="create-program-arrow" aria-hidden="true">›</span>
        </button>

        {isMyProgramsTab && programsLoading && (
          <div className="my-programs-state">
            <div className="exercise-list-spinner" aria-hidden="true" />
            <span>Загружаем ваши программы…</span>
          </div>
        )}

        {isMyProgramsTab && !programsLoading && programsError && (
          <div className="my-programs-state error">
            <span>{programsError}</span>
            <button type="button" onClick={() => setProgramsReloadKey((value) => value + 1)}>Повторить</button>
          </div>
        )}

        {isMyProgramsTab && !programsLoading && !programsError && filteredPrograms.length > 0 && (
          <section className="my-programs-list" aria-label="Мои программы">
            {filteredPrograms.map((program) => (
              <ProgramCard key={program.id} program={program} onOpen={setSelectedProgramId} />
            ))}
          </section>
        )}

        {isMyProgramsTab && !programsLoading && !programsError && filteredPrograms.length === 0 && (
          query ? (
            <div className="my-programs-state">По вашему запросу программы не найдены.</div>
          ) : (
            <EmptyPrograms tabId={activeTab} />
          )
        )}

        {!isCreateTab && !isMyProgramsTab && <EmptyPrograms tabId={activeTab} />}

        {isCreateTab && (
          <section className="training-builder">
            <div className="training-builder-heading">
              <div>
                <span>Шаг 1</span>
                <h3>Выберите упражнения</h3>
              </div>
              <strong>{loading ? '…' : filteredExercises.length}</strong>
            </div>

            {loading && (
              <div className="exercise-state-card">
                <div className="exercise-list-spinner" aria-hidden="true" />
                <span>Загружаем базу упражнений…</span>
              </div>
            )}

            {!loading && error && (
              <div className="exercise-state-card exercise-state-error">{error}</div>
            )}

            {!loading && !error && filteredExercises.length === 0 && (
              <div className="exercise-state-card">
                <strong>Ничего не найдено</strong>
                <span>Попробуйте изменить запрос или фильтры.</span>
              </div>
            )}

            {!loading && !error && filteredExercises.length > 0 && (
              <section className="exercise-list" aria-label="Список упражнений">
                {filteredExercises.map((exercise) => (
                  <ExerciseRow key={exercise.id} exercise={exercise} onOpen={setSelectedExercise} />
                ))}
              </section>
            )}
          </section>
        )}
      </main>

      <TrainingBottomNav />

      {selectedExercise && (
        <ExerciseDetail exercise={selectedExercise} onClose={() => setSelectedExercise(null)} />
      )}
    </div>
  );
}
