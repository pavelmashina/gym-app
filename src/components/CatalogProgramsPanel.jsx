import { useEffect, useMemo, useState } from 'react';
import { adoptCatalogProgram, getCatalogProgram, listCatalogPrograms } from '../lib/catalogPrograms.js';
import '../catalog-programs.css';

const ALL = 'Все';
const NO_DATA = 'Нет данных';

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m9 5 7 7-7 7" />
    </svg>
  );
}

function CatalogCard({ program, onOpen }) {
  const category = program.categories[0] || 'Готовая программа';

  return (
    <button className="catalog-program-card" type="button" onClick={() => onOpen(program.id)}>
      <span className="catalog-program-cover catalog-program-placeholder" aria-hidden="true">
        <span className="catalog-placeholder-icon" />
      </span>
      <span className="catalog-program-card-copy">
        <span className="catalog-program-category">{category}</span>
        <strong>{program.name}</strong>
        <span className="catalog-program-card-meta">
          <span>{program.workoutCount} трен.</span>
          <span>{program.weekCount} нед.</span>
          {program.level && <span>{program.level}</span>}
        </span>
      </span>
      <span className="catalog-program-card-arrow"><ChevronIcon /></span>
    </button>
  );
}

function FilterGroup({ title, values, selected, onSelect }) {
  if (values.length <= 1) return null;
  return (
    <div className="catalog-filter-group">
      <span>{title}</span>
      <div className="catalog-filter-pills">
        {values.map((value) => (
          <button
            className={value === selected ? 'active' : ''}
            key={value}
            type="button"
            onClick={() => onSelect(value)}
          >
            {value}
          </button>
        ))}
      </div>
    </div>
  );
}

function WorkoutBlock({ workout, index }) {
  const [open, setOpen] = useState(index === 0);
  const exercises = workout.exercises ?? [];

  return (
    <article className={`catalog-workout-card${open ? ' open' : ''}`}>
      <button className="catalog-workout-head" type="button" onClick={() => setOpen((value) => !value)}>
        <span className="catalog-workout-index">{index + 1}</span>
        <span className="catalog-workout-title">
          <small>Тренировка</small>
          <strong>{workout.name || `Тренировка ${index + 1}`}</strong>
          <span>{exercises.length} упражнений</span>
        </span>
        <span className="catalog-workout-chevron"><ChevronIcon /></span>
      </button>

      {open && (
        <div className="catalog-workout-exercises">
          {exercises.length === 0 ? (
            <div className="catalog-no-data-row">{NO_DATA}</div>
          ) : exercises.map((exercise, exerciseIndex) => (
            <div className="catalog-workout-exercise" key={`${exercise.name}-${exerciseIndex}`}>
              <span className="catalog-exercise-number">{exerciseIndex + 1}</span>
              <span className="catalog-exercise-copy">
                <strong>{exercise.name || NO_DATA}</strong>
                <span>{exercise.prescription || NO_DATA}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function InfoRow({ label, value }) {
  return (
    <div className="catalog-info-row">
      <span>{label}</span>
      <strong className={!value ? 'empty' : ''}>{value || NO_DATA}</strong>
    </div>
  );
}

function CatalogProgramDetail({ programId, onBack, onJoin }) {
  const [program, setProgram] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('info');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setActiveTab('info');
    getCatalogProgram(programId)
      .then((result) => { if (active) setProgram(result); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [programId]);

  const weeks = program?.sourcePayload?.weeks ?? [];
  const workouts = weeks.flatMap((week) => week.workouts ?? []);

  async function handleJoin() {
    if (!program || joining) return;
    setJoining(true);
    setJoinError('');
    try {
      const adoptedProgramId = await adoptCatalogProgram(program.id);
      onJoin?.(adoptedProgramId);
    } catch (requestError) {
      setJoinError(requestError?.message || 'Не удалось присоединиться к программе.');
      setJoining(false);
    }
  }

  return (
    <div className="catalog-detail-layer" role="dialog" aria-modal="true" aria-label="Программа из каталога">
      <div className="catalog-detail-phone">
        <header className="catalog-detail-header">
          <button type="button" aria-label="Назад к каталогу" onClick={onBack}><BackIcon /></button>
          <strong>Каталог программ</strong>
          <span />
        </header>

        {loading && <div className="catalog-detail-state">Загружаем программу…</div>}
        {!loading && error && <div className="catalog-detail-state error">{error}</div>}

        {!loading && program && (
          <>
            <nav className="catalog-detail-tabs" aria-label="Разделы программы">
              <button
                className={activeTab === 'info' ? 'active' : ''}
                type="button"
                onClick={() => setActiveTab('info')}
              >
                О программе
              </button>
              <button
                className={activeTab === 'workouts' ? 'active' : ''}
                type="button"
                onClick={() => setActiveTab('workouts')}
              >
                Тренировки
              </button>
            </nav>

            <main className="catalog-detail-content has-footer">
              {activeTab === 'info' && (
                <>
                  <div className="catalog-detail-cover-placeholder catalog-program-placeholder" aria-hidden="true">
                    <span className="catalog-placeholder-icon" />
                  </div>

                  <section className="catalog-detail-hero catalog-detail-hero-light">
                    <span className="catalog-detail-kicker">{program.categories[0] || 'Готовая программа'}</span>
                    <h1>{program.name}</h1>
                  </section>

                  <section className="catalog-detail-section catalog-about-section">
                    <div className="catalog-detail-section-head"><span>Информация о программе</span></div>
                    <div className="catalog-info-card">
                      <InfoRow label="Направление" value={program.categories.length ? program.categories.join(', ') : ''} />
                      <InfoRow label="Место тренировок" value={program.trainingPlace} />
                      <InfoRow label="Уровень" value={program.level} />
                      <InfoRow label="Оборудование" value="" />
                      <InfoRow label="Продолжительность" value={program.weekCount ? `${program.weekCount} нед.` : ''} />
                      <InfoRow label="Количество тренировок" value={program.workoutCount ? String(program.workoutCount) : ''} />
                    </div>
                  </section>

                  <section className="catalog-detail-section">
                    <div className="catalog-detail-section-head"><span>Описание</span></div>
                    <div className={`catalog-description-card${program.description ? '' : ' empty'}`}>
                      {program.description || NO_DATA}
                    </div>
                  </section>
                </>
              )}

              {activeTab === 'workouts' && (
                <section className="catalog-detail-section catalog-workouts-tab-section">
                  <div className="catalog-detail-section-head">
                    <span>Тренировки программы</span>
                    <strong>{workouts.length ? `${workouts.length} тренировок` : NO_DATA}</strong>
                  </div>
                  {workouts.length > 0 ? (
                    <div className="catalog-workout-list">
                      {workouts.map((workout, index) => (
                        <WorkoutBlock key={`${workout.name}-${index}`} workout={workout} index={index} />
                      ))}
                    </div>
                  ) : (
                    <div className="catalog-detail-empty-card">{NO_DATA}</div>
                  )}
                  <div className="catalog-source-note">
                    Схемы подходов и повторений показаны в формулировках из загруженного каталога.
                  </div>
                </section>
              )}

              {joinError && <div className="catalog-join-error">{joinError}</div>}
            </main>

            <footer className="catalog-detail-footer">
              <button type="button" onClick={handleJoin} disabled={joining}>
                {joining ? 'Добавляем программу…' : 'Присоединиться к программе'}
              </button>
            </footer>
          </>
        )}
      </div>
    </div>
  );
}

export function CatalogProgramsPanel({ query = '', sortDirection = 'asc', filtersOpen = false, onJoin }) {
  const [programs, setPrograms] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reloadKey, setReloadKey] = useState(0);
  const [selectedProgramId, setSelectedProgramId] = useState(null);
  const [place, setPlace] = useState(ALL);
  const [category, setCategory] = useState(ALL);
  const [level, setLevel] = useState(ALL);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    listCatalogPrograms()
      .then((result) => { if (active) setPrograms(result); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [reloadKey]);

  const places = useMemo(() => [ALL, ...new Set(programs.map((item) => item.trainingPlace).filter(Boolean))], [programs]);
  const categories = useMemo(() => [ALL, ...new Set(programs.flatMap((item) => item.categories).filter(Boolean))], [programs]);
  const levels = useMemo(() => [ALL, ...new Set(programs.map((item) => item.level).filter(Boolean))], [programs]);

  const filteredPrograms = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru');
    const result = programs.filter((program) => {
      if (place !== ALL && program.trainingPlace !== place) return false;
      if (category !== ALL && !program.categories.includes(category)) return false;
      if (level !== ALL && program.level !== level) return false;
      if (!normalizedQuery) return true;

      const exerciseNames = (program.sourcePayload?.weeks ?? [])
        .flatMap((week) => week.workouts ?? [])
        .flatMap((workout) => workout.exercises ?? [])
        .map((exercise) => exercise.name);

      return [
        program.name,
        program.description,
        program.trainingPlace,
        program.level,
        ...program.categories,
        ...exerciseNames,
      ]
        .filter(Boolean)
        .some((value) => value.toLocaleLowerCase('ru').includes(normalizedQuery));
    });

    return result.sort((a, b) => {
      const comparison = a.name.localeCompare(b.name, 'ru');
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [programs, query, sortDirection, place, category, level]);

  const hasFilters = place !== ALL || category !== ALL || level !== ALL;

  return (
    <>
      {filtersOpen && (
        <section className="catalog-filters" aria-label="Фильтры каталога программ">
          <FilterGroup title="Место" values={places} selected={place} onSelect={setPlace} />
          <FilterGroup title="Направление" values={categories} selected={category} onSelect={setCategory} />
          <FilterGroup title="Уровень" values={levels} selected={level} onSelect={setLevel} />
          {hasFilters && (
            <button
              className="catalog-filters-reset"
              type="button"
              onClick={() => { setPlace(ALL); setCategory(ALL); setLevel(ALL); }}
            >
              Сбросить фильтры
            </button>
          )}
        </section>
      )}

      <div className="catalog-results-head">
        <span>{loading ? 'Загрузка…' : `${filteredPrograms.length} программ`}</span>
        {hasFilters && <strong>Фильтр включён</strong>}
      </div>

      {loading && (
        <div className="my-programs-state">
          <div className="exercise-list-spinner" aria-hidden="true" />
          <span>Загружаем каталог программ…</span>
        </div>
      )}

      {!loading && error && (
        <div className="my-programs-state error">
          <span>{error}</span>
          <button type="button" onClick={() => setReloadKey((value) => value + 1)}>Повторить</button>
        </div>
      )}

      {!loading && !error && filteredPrograms.length === 0 && (
        <div className="catalog-empty">
          <strong>Программы не найдены</strong>
          <span>Попробуйте изменить поиск или фильтры.</span>
        </div>
      )}

      {!loading && !error && filteredPrograms.length > 0 && (
        <section className="catalog-program-list" aria-label="Каталог программ">
          {filteredPrograms.map((program) => (
            <CatalogCard key={program.id} program={program} onOpen={setSelectedProgramId} />
          ))}
        </section>
      )}

      {selectedProgramId && (
        <CatalogProgramDetail
          programId={selectedProgramId}
          onBack={() => setSelectedProgramId(null)}
          onJoin={onJoin}
        />
      )}
    </>
  );
}
