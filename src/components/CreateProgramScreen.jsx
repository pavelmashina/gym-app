import { useEffect, useState } from 'react';
import { CreateProgramStructureScreen } from './CreateProgramStructureScreen.jsx';
import '../create-program.css';

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

export function CreateProgramScreen({ onBack }) {
  const [step, setStep] = useState(1);
  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [categories, setCategories] = useState([]);
  const [place, setPlace] = useState('');
  const [equipment, setEquipment] = useState('');
  const [level, setLevel] = useState('');
  const [programWeeks, setProgramWeeks] = useState([]);

  useEffect(() => () => {
    if (coverUrl) URL.revokeObjectURL(coverUrl);
  }, [coverUrl]);

  const weekCount = Math.max(0, Math.min(52, Number(weeks) || 0));
  const canContinue = name.trim().length > 0 && weekCount > 0;

  function handleCoverChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (coverUrl) URL.revokeObjectURL(coverUrl);
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
    setProgramWeeks((current) => reconcileProgramWeeks(current, weekCount));
    setStep(2);
    scrollCreateProgramToTop();
  }

  function handleBackFromStepTwo() {
    setStep(1);
    scrollCreateProgramToTop();
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
        <strong>Создать программу</strong>
        <span className="create-program-header-spacer" />
      </header>

      <main className="create-program-content">
        <section className="create-program-intro">
          <span>Шаг 1</span>
          <h1>Новая программа</h1>
          <p>Заполните основную информацию. Тренировочные дни и упражнения добавим на следующем шаге.</p>
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
            <small>Необязательно</small>
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
