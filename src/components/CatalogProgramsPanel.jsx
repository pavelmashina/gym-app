import { useEffect, useMemo, useState } from 'react';
import { adoptCatalogProgram, getCatalogProgram, listCatalogPrograms } from '../lib/catalogPrograms.js';
import '../catalog-programs.css';
import { formatRussianCount } from '../lib/formatRussianCount.js';
import { ProgramOverviewIntro, ProgramOverviewStats, ProgramOverviewMeta, ProgramDetailTabs } from './ProgramOverview.jsx';

const ALL = 'Все';
const NO_DATA = 'Нет данных';

function BackIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>; }
function ChevronIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>; }

function CatalogCard({ program, onOpen }) {
  const category = program.categories[0] || 'Готовая программа';
  return (
    <button className="catalog-program-card" type="button" onClick={() => onOpen(program.id)}>
      <span className="catalog-program-cover catalog-program-placeholder" aria-hidden="true"><span className="catalog-placeholder-icon" /></span>
      <span className="catalog-program-card-copy">
        <span className="catalog-program-category">{category}</span>
        <strong>{program.name}</strong>
        <span className="catalog-program-card-meta">
          <span>{program.workoutCount} трен. в цикле</span>
          {program.trainingPlace && <span>{program.trainingPlace}</span>}
          {program.level && <span>{program.level}</span>}
        </span>
      </span>
      <span className="catalog-program-card-arrow"><ChevronIcon /></span>
    </button>
  );
}

function FilterGroup({ title, values, selected, onSelect }) {
  if (values.length <= 1) return null;
  return <div className="catalog-filter-group"><span>{title}</span><div className="catalog-filter-pills">{values.map((value) => <button className={value === selected ? 'active' : ''} key={value} type="button" onClick={() => onSelect(value)}>{value}</button>)}</div></div>;
}

function WorkoutBlock({ workout, index }) {
  const [open, setOpen] = useState(index === 0);
  const exercises = workout.exercises ?? [];
  return (
    <article className={`catalog-workout-card${open ? ' open' : ''}`}>
      <button className="catalog-workout-head" type="button" onClick={() => setOpen((value) => !value)}>
        <span className="catalog-workout-index">{index + 1}</span>
        <span className="catalog-workout-title"><small>Тренировка цикла</small><strong>{workout.name || `Тренировка ${index + 1}`}</strong><span>{formatRussianCount(exercises.length, ['упражнение', 'упражнения', 'упражнений'])}</span></span>
        <span className="catalog-workout-chevron"><ChevronIcon /></span>
      </button>
      {open && <div className="catalog-workout-exercises">{exercises.length === 0 ? <div className="catalog-no-data-row">{NO_DATA}</div> : exercises.map((exercise, exerciseIndex) => <div className="catalog-workout-exercise" key={`${exercise.name}-${exerciseIndex}`}><span className="catalog-exercise-number">{exerciseIndex + 1}</span><span className="catalog-exercise-copy"><strong>{exercise.name || NO_DATA}</strong><span>{exercise.prescription || NO_DATA}</span></span></div>)}</div>}
    </article>
  );
}

function InfoRow({ label, value }) {
  return <div className="catalog-info-row"><span>{label}</span><strong className={!value ? 'empty' : ''}>{value || NO_DATA}</strong></div>;
}

function CatalogProgramDetail({ programId, onBack, onJoin }) {
  const [program, setProgram] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState('');
  const [detailTab, setDetailTab] = useState('description');

  useEffect(() => {
    let active = true;
    setLoading(true); setError(''); setDetailTab('description');
    getCatalogProgram(programId).then((result) => { if (active) setProgram(result); }).catch((requestError) => { if (active) setError(requestError.message); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [programId]);

  const workouts = program?.sourcePayload?.cycle?.workouts ?? [];

  async function handleJoin() {
    if (!program || joining) return;
    setJoining(true); setJoinError('');
    try {
      const adoptedProgramId = await adoptCatalogProgram(program.id);
      onJoin?.(adoptedProgramId);
    } catch (requestError) {
      setJoinError(requestError?.message || 'Не удалось присоединиться к программе.');
      setJoining(false);
    }
  }

  return <div className="catalog-detail-layer" role="dialog" aria-modal="true" aria-label="Программа из каталога">
    <div className="catalog-detail-phone program-detail-phone">
      <header className="program-detail-header"><button type="button" aria-label="Назад к каталогу" onClick={onBack}><BackIcon /></button><strong>Программа</strong><span /></header>
      {loading && <div className="program-detail-state"><div className="exercise-list-spinner" /><span>Загружаем программу…</span></div>}
      {!loading && error && <div className="program-detail-state error">{error}</div>}
      {!loading && program && <>
        <ProgramDetailTabs value={detailTab} onChange={setDetailTab} scope="catalog" />
        <main className="program-detail-content catalog-unified-detail">
          {detailTab === 'description' && <div id="catalog-description-panel" role="tabpanel" aria-labelledby="catalog-description-tab">
            <ProgramOverviewIntro program={program} />
          <ProgramOverviewStats items={[
            { label: 'Цикл', value: 1 },
            { label: 'В цикле', value: program.workoutCount || workouts.length },
            { label: 'Повторов', value: 'На выбор' },
          ]} />
          <ProgramOverviewMeta program={program} />
          </div>}
          {detailTab === 'workouts' && <div id="catalog-workouts-panel" role="tabpanel" aria-labelledby="catalog-workouts-tab">
          <section className="program-detail-section catalog-training-section">
            <div className="program-detail-section-head"><span>Структура</span><h2>Один цикл тренировок</h2></div>
            {workouts.length > 0
              ? <div className="catalog-workout-list">{workouts.map((workout, index) => <WorkoutBlock key={`${workout.name}-${index}`} workout={workout} index={index} />)}</div>
              : <div className="catalog-detail-empty-card">Нет данных</div>}
            <div className="catalog-source-note">Исходные упражнения, подходы и повторения сохранены из каталога. После присоединения программа появится в «Моих программах».</div>
          </section>
          </div>}
          {joinError && <div className="catalog-join-error" role="alert">{joinError}</div>}
        </main>
        <footer className="program-detail-footer catalog-unified-footer"><button className="program-detail-start-button" type="button" onClick={handleJoin} disabled={joining}>{joining ? 'Добавляем программу…' : 'Присоединиться к программе'}</button></footer>
      </>}
    </div>
  </div>;
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
    setLoading(true); setError('');
    listCatalogPrograms().then((result) => { if (active) setPrograms(result); }).catch((requestError) => { if (active) setError(requestError.message); }).finally(() => { if (active) setLoading(false); });
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
      const exerciseNames = (program.sourcePayload?.cycle?.workouts ?? []).flatMap((workout) => workout.exercises ?? []).map((exercise) => exercise.name);
      return [program.name, program.description, program.trainingPlace, program.equipment, program.level, ...program.categories, ...exerciseNames].filter(Boolean).some((value) => value.toLocaleLowerCase('ru').includes(normalizedQuery));
    });
    return result.sort((a, b) => { const comparison = a.name.localeCompare(b.name, 'ru'); return sortDirection === 'asc' ? comparison : -comparison; });
  }, [programs, query, sortDirection, place, category, level]);

  const hasFilters = place !== ALL || category !== ALL || level !== ALL;

  return <>
    {filtersOpen && <section className="catalog-filters"><FilterGroup title="Место" values={places} selected={place} onSelect={setPlace} /><FilterGroup title="Направление" values={categories} selected={category} onSelect={setCategory} /><FilterGroup title="Уровень" values={levels} selected={level} onSelect={setLevel} />{hasFilters && <button className="catalog-filters-reset" type="button" onClick={() => { setPlace(ALL); setCategory(ALL); setLevel(ALL); }}>Сбросить фильтры</button>}</section>}
    {hasFilters && <div className="catalog-results-filter-status" role="status">Фильтр включён</div>}
    {loading && <div className="my-programs-state"><div className="exercise-list-spinner" aria-hidden="true" /><span>Загружаем каталог программ…</span></div>}
    {!loading && error && <div className="my-programs-state error"><span>{error}</span><button type="button" onClick={() => setReloadKey((value) => value + 1)}>Повторить</button></div>}
    {!loading && !error && filteredPrograms.length === 0 && <div className="catalog-empty"><strong>Программы не найдены</strong><span>Попробуйте изменить поиск или фильтры.</span></div>}
    {!loading && !error && filteredPrograms.length > 0 && <section className="catalog-program-list">{filteredPrograms.map((program) => <CatalogCard key={program.id} program={program} onOpen={setSelectedProgramId} />)}</section>}
    {selectedProgramId && <CatalogProgramDetail programId={selectedProgramId} onBack={() => setSelectedProgramId(null)} onJoin={onJoin} />}
  </>;
}
