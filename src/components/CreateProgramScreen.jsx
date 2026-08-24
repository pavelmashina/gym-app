import { useEffect, useState } from 'react';
import { createProgram, getProgram, startProgram, updateProgram } from '../lib/programs.js';
import { CreateProgramScheduleScreen } from './CreateProgramScheduleScreen.jsx';
import { CreateProgramStructureScreen } from './CreateProgramStructureScreen.jsx';
import '../create-program.css';
import '../program-persistence.css';

const CATEGORY_OPTIONS = [
  'Кардио',
  'С собственным весом',
  'Растяжка',
  'Функциональный тренинг',
  'Силовой тренинг',
];

function BackIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m15 5-7 7 7 7" />
    </svg>
  );
}

function ImageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <rect x="3.5" y="4" width="17" height="16" rx="3" />
      <circle cx="9" cy="9" r="1.7" />
      <path d="m5.5 17 4.2-4.2 3 2.8 2.4-2.2 3.4 3.6" />
    </svg>
  );
}

function ChevronIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="m9 6 6 6-6 6" />
    </svg>
  );
}

function SelectRow({ label, value, onChange, options, placeholder }) {
  return (
    <label className="program-select-row">
      <span>{label}</span>
      <div className="program-select-control">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">{placeholder}</option>
          {options.map((option) => (
            <option value={option} key={option}>{option}</option>
          ))}
        </select>
        <ChevronIcon />
      </div>
    </label>
  );
}

function resizeTextArea(element) {
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}

function createProgramWeek(index) {
  return {
    id: crypto.randomUUID(),
    number: index + 1,
    workouts: [],
  };
}

function reconcileProgramWeeks(currentWeeks, weekCount) {
  return Array.from({ length: weekCount }, (_, index) => {
    const existing = currentWeeks[index];
    if (existing) return { ...existing, number: index + 1 };
    return createProgramWeek(index);
  });
}

export function CreateProgramScreen({
  onBack,
  onCreated,
  programId = null,
  launchOnly = false,
}) {
  const isEditing = Boolean(programId) && !launchOnly;
  const [step, setStep] = useState(launchOnly ? 3 : 1);
  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [coverFile, setCoverFile] = useState(null);
  const [existingCoverPath, setExistingCoverPath] = useState(null);
  const [categories, setCategories] = useState([]);
  const [place, setPlace] = useState('');
  const [equipment, setEquipment] = useState('');
  const [level, setLevel] = useState('');
  const [scheduleMode, setScheduleMode] = useState('custom');
  const [programWeeks, setProgramWeeks] = useState([]);
  const [saving, setSaving] = useState(false);
  const [savingAction, setSavingAction] = useState('');
  const [saveError, setSaveError] = useState('');
  const [initialLoading, setInitialLoading] = useState(Boolean(programId));
  const [initialError, setInitialError] = useState('');

  useEffect(() => () => {
    if (coverUrl?.startsWith('blob:')) URL.revokeObjectURL(coverUrl);
  }, [coverUrl]);

  useEffect(() => {
    if (!programId) {
      setInitialLoading(false);
      return undefined;
    }

    let active = true;

    async function loadProgramForEditing() {
      setInitialLoading(true);
      setInitialError('');

      try {
        const program = await getProgram(programId);
        if (!active) return;

        setName(program.name);
        setWeeks(String(program.weekCount));
        setDescription(program.description);
        setCategories(program.categories);
        setPlace(program.trainingPlace);
        setEquipment(program.equipment);
        setLevel(program.level);
        setScheduleMode(program.scheduleMode ?? 'custom');
        setProgramWeeks(program.programWeeks);
        setExistingCoverPath(program.coverPath);
        setCoverUrl(program.coverUrl ?? '');
        if (launchOnly) setStep(3);
      } catch (error) {
        if (!active) return;
        console.error('Unable to prepare program editor:', error);
        setInitialError(error?.message || 'Не удалось открыть программу.');
      } finally {
        if (active) setInitialLoading(false);
      }
    }

    loadProgramForEditing();
    return () => {
      active = false;
    };
  }, [programId, launchOnly]);

  const weekCount = Math.max(0, Math.min(52, Number(weeks) || 0));
  const canContinue = name.trim().length > 0 && weekCount > 0;
  const structureReady = programWeeks.length === weekCount
    && programWeeks.every((week) => (
      week.workouts.length > 0
      && week.workouts.every((workout) => workout.name.trim() && workout.exercises.length > 0)
    ));

  function buildSavePayload() {
    return {
      name,
      description,
      weekCount,
      categories,
      trainingPlace: place,
      equipment,
      level,
      scheduleMode,
      programWeeks,
      coverFile,
    };
  }

  async function handleScheduleAction(action, startDate = '') {
    if (!structureReady || saving) return;

    setSaving(true);
    setSavingAction(action);
    setSaveError('');

    try {
      let savedProgram;

      if (launchOnly) {
        const participation = await startProgram(programId, startDate);
        savedProgram = { id: programId, participation };
      } else if (isEditing) {
        savedProgram = await updateProgram({
          programId,
          existingCoverPath,
          ...buildSavePayload(),
        });
      } else {
        savedProgram = await createProgram({
          ...buildSavePayload(),
          startDate: action === 'start' ? startDate : null,
        });
      }

      onCreated?.(savedProgram);
    } catch (error) {
      console.error('Program save/start failed:', error);
      setSaveError(error?.message || 'Не удалось выполнить действие. Попробуйте ещё раз.');
    } finally {
      setSaving(false);
      setSavingAction('');
    }
  }

  useEffect(() => {
    if (step !== 2) return undefined;

    const button = document.querySelector(
      '.create-program-step2-phone > .create-program-footer .create-program-next',
    );
    if (!button) return undefined;

    button.textContent = 'Далее';
    button.disabled = !structureReady;

    function handleClick(event) {
      event.preventDefault();
      if (!structureReady) return;
      setSaveError('');
      setStep(3);
      scrollCreateProgramToTop();
    }

    button.addEventListener('click', handleClick);
    return () => button.removeEventListener('click', handleClick);
  }, [step, structureReady]);

  function handleCoverChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (coverUrl?.startsWith('blob:')) URL.revokeObjectURL(coverUrl);
    setCoverFile(file);
    setCoverUrl(URL.createObjectURL(file));
  }

  function toggleCategory(category) {
    setCategories((current) => (
      current.includes(category)
        ? current.filter((item) => item !== category)
        : [...current, category]
    ));
  }

  function handleAutoGrowingTextChange(event, setter) {
    setter(event.target.value);
    resizeTextArea(event.target);
  }

  function scrollCreateProgramToTop() {
    requestAnimationFrame(() => {
      document.querySelector('.create-program-phone')?.scrollTo({ top: 0, behavior: 'instant' });
    });
  }

  function handleNext() {
    if (!canContinue) return;
    setSaveError('');
    setProgramWeeks((current) => reconcileProgramWeeks(current, weekCount));
    setStep(2);
    scrollCreateProgramToTop();
  }

  function handleBackFromStepTwo() {
    if (saving) return;
    setSaveError('');
    setStep(1);
    scrollCreateProgramToTop();
  }

  function handleBackFromSchedule() {
    if (saving) return;
    setSaveError('');
    if (launchOnly) {
      onBack?.();
      return;
    }
    setStep(2);
    scrollCreateProgramToTop();
  }

  if (initialLoading) {
    return (
      <div className="phone create-program-phone">
        <main className="create-program-content">
          <div className="program-persistence-loading">
            <div className="exercise-list-spinner" aria-hidden="true" />
            <span>{launchOnly ? 'Готовим запуск программы…' : 'Загружаем программу…'}</span>
          </div>
        </main>
      </div>
    );
  }

  if (initialError) {
    return (
      <div className="phone create-program-phone">
        <header className="create-program-header">
          <button className="create-program-back" type="button" aria-label="Назад" onClick={onBack}>
            <BackIcon />
          </button>
          <strong>{launchOnly ? 'Начать программу' : 'Редактировать программу'}</strong>
          <span className="create-program-header-spacer" />
        </header>
        <main className="create-program-content">
          <div className="program-persistence-message" role="alert">{initialError}</div>
        </main>
      </div>
    );
  }

  if (step === 3) {
    return (
      <CreateProgramScheduleScreen
        programName={name.trim()}
        programWeeks={programWeeks}
        onProgramWeeksChange={setProgramWeeks}
        scheduleMode={scheduleMode}
        onScheduleModeChange={setScheduleMode}
        onBack={handleBackFromSchedule}
        onAction={handleScheduleAction}
        saving={saving}
        savingAction={savingAction}
        saveError={saveError}
        isEditing={isEditing}
        launchOnly={launchOnly}
      />
    );
  }

  if (step === 2) {
    return (
      <CreateProgramStructureScreen
        programName={name.trim()}
        weekCount={weekCount}
        categories={categories}
        programWeeks={programWeeks}
        onProgramWeeksChange={setProgramWeeks}
        onBack={handleBackFromStepTwo}
      />
    );
  }

  return (
    <div className="phone create-program-phone">
      <header className="create-program-header">
        <button className="create-program-back" type="button" aria-label="Назад к тренировкам" onClick={onBack}>
          <BackIcon />
        </button>
        <strong>{isEditing ? 'Редактировать программу' : 'Создать программу'}</strong>
        <span className="create-program-header-spacer" />
      </header>

      <main className="create-program-content">
        <section className="create-program-intro">
          <span>Шаг 1</span>
          <h1>{isEditing ? 'Основная информация' : 'Новая программа'}</h1>
          <p>Заполните основную информацию. Тренировки и интервалы между ними настроим на следующих шагах.</p>
        </section>

        <section className="create-program-form-card">
          <label className="program-field">
            <span>Название программы <b>*</b></span>
            <textarea
              className="program-auto-textarea"
              value={name}
              onChange={(event) => handleAutoGrowingTextChange(event, setName)}
              placeholder="Например, Сила и масса"
              rows="1"
              maxLength={80}
            />
          </label>

          <label className="program-field program-weeks-field">
            <span>Количество недель <b>*</b></span>
            <input
              type="number"
              inputMode="numeric"
              min="1"
              max="52"
              value={weeks}
              onChange={(event) => setWeeks(event.target.value)}
              placeholder="8"
            />
          </label>

          <label className="program-field">
            <span>Описание</span>
            <textarea
              className="program-auto-textarea"
              value={description}
              onChange={(event) => handleAutoGrowingTextChange(event, setDescription)}
              placeholder="Коротко опишите цель и особенности программы"
              rows="1"
              maxLength={600}
            />
          </label>
        </section>

        <section className="create-program-section">
          <div className="create-program-section-head">
            <div>
              <span>Обложка</span>
              <h2>Фото программы</h2>
            </div>
            <small>Необязательно · до 5 МБ</small>
          </div>

          <label className={`program-cover ${coverUrl ? 'has-image' : ''}`}>
            {coverUrl ? (
              <img src={coverUrl} alt="Предпросмотр обложки программы" />
            ) : (
              <>
                <span className="program-cover-icon"><ImageIcon /></span>
                <strong>Добавить обложку</strong>
                <small>JPG, PNG или WEBP</small>
              </>
            )}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleCoverChange} />
          </label>
        </section>

        <section className="create-program-section">
          <div className="create-program-section-head">
            <div>
              <span>Тип тренировок</span>
              <h2>Категории</h2>
            </div>
          </div>

          <div className="program-category-list" aria-label="Категории программы">
            {CATEGORY_OPTIONS.map((category) => (
              <button
                className={categories.includes(category) ? 'active' : ''}
                type="button"
                key={category}
                onClick={() => toggleCategory(category)}
                aria-pressed={categories.includes(category)}
              >
                {category}
              </button>
            ))}
          </div>

          <div className="program-select-card">
            <SelectRow
              label="Место тренировок"
              value={place}
              onChange={setPlace}
              placeholder="Выбрать"
              options={['Тренажёрный зал', 'Дом', 'Улица', 'Неважно']}
            />
            <SelectRow
              label="Оборудование"
              value={equipment}
              onChange={setEquipment}
              placeholder="Выбрать"
              options={['Полный зал', 'Свободные веса', 'Тренажёры', 'Минимум оборудования', 'Без оборудования']}
            />
            <SelectRow
              label="Уровень"
              value={level}
              onChange={setLevel}
              placeholder="Выбрать"
              options={['Начальный', 'Средний', 'Продвинутый']}
            />
          </div>
        </section>
      </main>

      <footer className="create-program-footer">
        <button className="create-program-next" type="button" disabled={!canContinue} onClick={handleNext}>
          Далее
        </button>
      </footer>
    </div>
  );
}
