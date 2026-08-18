import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import '../exercise-catalog.css';

const ALL_GROUPS = 'Все';

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
              <div className="exercise-technique-empty">
                Описание техники пока не добавлено.
              </div>
            )}
          </section>
        </main>
      </div>
    </div>
  );
}

function CatalogBottomNav({ onHome }) {
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

      <button className="nav-item home" type="button" onClick={onHome}>
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

export function ExercisesScreen({ onHome }) {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [selectedGroup, setSelectedGroup] = useState(ALL_GROUPS);
  const [selectedExercise, setSelectedExercise] = useState(null);

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

  const groups = useMemo(() => {
    const values = [...new Set(exercises.map((item) => item.muscle_group).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'ru'));
    return [ALL_GROUPS, ...values];
  }, [exercises]);

  const filteredExercises = useMemo(() => {
    const normalizedQuery = query.trim().toLocaleLowerCase('ru');

    return exercises.filter((exercise) => {
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
  }, [exercises, query, selectedGroup]);

  return (
    <div className="phone exercise-phone">
      <header className="exercise-appbar">
        <div>
          <span className="exercise-eyebrow">Тренировки</span>
          <h1>Упражнения</h1>
        </div>
        <button className="profile-btn" type="button" aria-label="Профиль">
          <ProfileIcon />
        </button>
      </header>

      <main className="exercise-catalog-content">
        <label className="exercise-search">
          <SearchIcon />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Найти упражнение"
            aria-label="Поиск упражнений"
          />
          {query && (
            <button type="button" aria-label="Очистить поиск" onClick={() => setQuery('')}>×</button>
          )}
        </label>

        <div className="exercise-groups" role="group" aria-label="Группа мышц">
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

        <div className="exercise-catalog-heading">
          <span>{loading ? 'Загружаем…' : `${filteredExercises.length} упражнений`}</span>
          {selectedGroup !== ALL_GROUPS && (
            <button type="button" onClick={() => setSelectedGroup(ALL_GROUPS)}>Сбросить</button>
          )}
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
            <span>Попробуйте изменить запрос или выбрать другую группу мышц.</span>
          </div>
        )}

        {!loading && !error && filteredExercises.length > 0 && (
          <section className="exercise-list" aria-label="Список упражнений">
            {filteredExercises.map((exercise) => (
              <ExerciseRow key={exercise.id} exercise={exercise} onOpen={setSelectedExercise} />
            ))}
          </section>
        )}
      </main>

      <CatalogBottomNav onHome={onHome} />

      {selectedExercise && (
        <ExerciseDetail exercise={selectedExercise} onClose={() => setSelectedExercise(null)} />
      )}
    </div>
  );
}
