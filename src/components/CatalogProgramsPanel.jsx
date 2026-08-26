import { useEffect, useMemo, useState } from 'react';
import { getCatalogProgram, listCatalogPrograms } from '../lib/catalogPrograms.js';
import '../catalog-programs.css';

const ALL = 'Все';

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
  const initial = program.name?.trim()?.slice(0, 1)?.toUpperCase() || 'P';

  return (
    <button className="catalog-program-card" type="button" onClick={() => onOpen(program.id)}>
      <span className="catalog-program-cover" aria-hidden="true">
        <span>{initial}</span>
        <small>{program.trainingPlace || 'Тренировки'}</small>
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
          {exercises.map((exercise, exerciseIndex) => (
            <div className="catalog-workout-exercise" key={`${exercise.name}-${exerciseIndex}`}>
              <span className="catalog-exercise-number">{exerciseIndex + 1}</span>
              <span className="catalog-exercise-copy">
                <strong>{exercise.name}</strong>
                {exercise.prescription && <span>{exercise.prescription}</span>}
              </span>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function CatalogProgramDetail({ programId, onBack }) {
  const [program, setProgram] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    getCatalogProgram(programId)
      .then((result) => { if (active) setProgram(result); })
      .catch((requestError) => { if (active) setError(requestError.message); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [programId]);

  const weeks = program?.sourcePayload?.weeks ?? [];
  const workouts = weeks.flatMap((week) => week.workouts ?? []);

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
          <main className="catalog-detail-content">
            <section className="catalog-detail-hero">
              <span className="catalog-detail-kicker">{program.categories[0] || 'Готовая программа'}</span>
              <h1>{program.name}</h1>
              <div className="catalog-detail-tags">
                {program.trainingPlace && <span>{program.trainingPlace}</span>}
                <span>{program.workoutCount} тренировок</span>
                <span>{program.weekCount} нед.</span>
                {program.level && <span>{program.level}</span>}
              </div>
              {program.description && <p>{program.description}</p>}
            </section>

            {program.categories.length > 1 && (
              <section className="catalog-detail-section">
                <div className="catalog-detail-section-head"><span>Направления</span></div>
                <div className="catalog-detail-category-list">
                  {program.categories.map((category) => <span key={category}>{category}</span>)}
                </div>
              </section>
            )}

            <section className="catalog-detail-section">
              <div className="catalog-detail-section-head">
                <span>Структура программы</span>
                <strong>{workouts.length} тренировок</strong>
              </div>
              <div className="catalog-workout-list">
                {workouts.map((workout, index) => (
                  <WorkoutBlock key={`${workout.name}-${index}`} workout={workout} index={index} />
                ))}
              </div>
            </section>

            <div className="catalog-source-note">
              Схемы подходов и повторений показаны в формулировках из загруженного каталога.
            </div>
          </main>
        )}
      </div>
    </div>
  );
}

export function CatalogProgramsPanel({ query = '', sortDirection = 'asc', filtersOpen = false }) {
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
        <CatalogProgramDetail programId={selectedProgramId} onBack={() => setSelectedProgramId(null)} />
      )}
    </>
  );
}
