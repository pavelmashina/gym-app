import { useEffect, useState } from 'react';
import { createProgram, getProgram, startProgram, updateProgram } from '../lib/programs.js';
import { CreateProgramCycleScreen } from './CreateProgramCycleScreen.jsx';
import { CreateProgramCycleScheduleScreen } from './CreateProgramCycleScheduleScreen.jsx';
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
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>;
}

function ImageIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="3" /><circle cx="9" cy="9" r="1.7" /><path d="m5.5 17 4.2-4.2 3 2.8 2.4-2.2 3.4 3.6" /></svg>;
}

function ChevronIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>;
}

function SelectRow({ label, value, onChange, options, placeholder }) {
  return (
    <label className="program-select-row">
      <span>{label}</span>
      <div className="program-select-control">
        <select value={value} onChange={(event) => onChange(event.target.value)}>
          <option value="">{placeholder}</option>
          {options.map((option) => <option value={option} key={option}>{option}</option>)}
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

function createCycle() {
  return { id: crypto.randomUUID(), number: 1, workouts: [] };
}

function normalizeIntoOneCycle(programWeeks) {
  const workouts = (programWeeks ?? []).flatMap((week) => week.workouts ?? []);
  return [{ id: programWeeks?.[0]?.id ?? crypto.randomUUID(), number: 1, workouts }];
}

export function CreateProgramScreen({ onBack, onCreated, programId = null, launchOnly = false }) {
  const isEditing = Boolean(programId) && !launchOnly;
  const [step, setStep] = useState(launchOnly ? 3 : 1);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [coverUrl, setCoverUrl] = useState('');
  const [coverFile, setCoverFile] = useState(null);
  const [existingCoverPath, setExistingCoverPath] = useState(null);
  const [categories, setCategories] = useState([]);
  const [place, setPlace] = useState('');
  const [equipment, setEquipment] = useState('');
  const [level, setLevel] = useState('');
  const [scheduleMode, setScheduleMode] = useState('custom');
  const [cycleRepeatCount, setCycleRepeatCount] = useState(1);
  const [programWeeks, setProgramWeeks] = useState([createCycle()]);
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
    async function loadProgram() {
      setInitialLoading(true);
      setInitialError('');
      try {
        const program = await getProgram(programId);
        if (!active) return;
        setName(program.name);
        setDescription(program.description);
        setCategories(program.categories);
        setPlace(program.trainingPlace);
        setEquipment(program.equipment);
        setLevel(program.level);
        setScheduleMode(program.scheduleMode ?? 'custom');
        setCycleRepeatCount(program.cycleRepeatCount ?? 1);
        setProgramWeeks(normalizeIntoOneCycle(program.programWeeks));
        setExistingCoverPath(program.coverPath);
        setCoverUrl(program.coverUrl ?? '');
        if (launchOnly) setStep(3);
      } catch (error) {
        if (!active) return;
        console.error('Unable to prepare program:', error);
        setInitialError(error?.message || 'Не удалось открыть программу.');
      } finally {
        if (active) setInitialLoading(false);
      }
    }
    loadProgram();
    return () => { active = false; };
  }, [programId, launchOnly]);

  const canContinue = name.trim().length > 0;
  const cycle = programWeeks[0];
  const structureReady = Boolean(cycle?.workouts?.length)
    && cycle.workouts.every((workout) => workout.name.trim() && workout.exercises.length > 0);

  function buildSavePayload() {
    return {
      name,
      description,
      weekCount: 1,
      structureMode: 'cycle',
      cycleRepeatCount,
      categories,
      trainingPlace: place,
      equipment,
      level,
      scheduleMode,
      programWeeks: normalizeIntoOneCycle(programWeeks),
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
        const updated = await updateProgram({ programId, existingCoverPath, ...buildSavePayload() });
        const participation = await startProgram(programId, startDate);
        savedProgram = { ...updated, participation };
      } else if (isEditing) {
        savedProgram = await updateProgram({ programId, existingCoverPath, ...buildSavePayload() });
      } else {
        savedProgram = await createProgram({ ...buildSavePayload(), startDate: action === 'start' ? startDate : null });
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

  function handleCoverChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    if (coverUrl?.startsWith('blob:')) URL.revokeObjectURL(coverUrl);
    setCoverFile(file);
    setCoverUrl(URL.createObjectURL(file));
  }

  function toggleCategory(category) {
    setCategories((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
  }

  function scrollToTop() {
    requestAnimationFrame(() => document.querySelector('.create-program-phone')?.scrollTo({ top: 0, behavior: 'instant' }));
  }

  function goToStep(nextStep) {
    setSaveError('');
    setStep(nextStep);
    scrollToTop();
  }

  if (initialLoading) {
    return <div className="phone create-program-phone"><main className="create-program-content"><div className="program-persistence-loading"><div className="exercise-list-spinner" aria-hidden="true" /><span>{launchOnly ? 'Готовим запуск программы…' : 'Загружаем программу…'}</span></div></main></div>;
  }

  if (initialError) {
    return (
      <div className="phone create-program-phone">
        <header className="create-program-header"><button className="create-program-back" type="button" onClick={onBack}><BackIcon /></button><strong>{launchOnly ? 'Начать программу' : 'Редактировать программу'}</strong><span className="create-program-header-spacer" /></header>
        <main className="create-program-content"><div className="program-persistence-message" role="alert">{initialError}</div></main>
      </div>
    );
  }

  if (step === 3) {
    return (
      <CreateProgramCycleScheduleScreen
        programName={name.trim()}
        programWeeks={programWeeks}
        onProgramWeeksChange={setProgramWeeks}
        scheduleMode={scheduleMode}
        onScheduleModeChange={setScheduleMode}
        cycleRepeatCount={cycleRepeatCount}
        onCycleRepeatCountChange={setCycleRepeatCount}
        onBack={() => launchOnly ? onBack?.() : goToStep(2)}
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
      <CreateProgramCycleScreen
        programName={name.trim()}
        categories={categories}
        programWeeks={programWeeks}
        onProgramWeeksChange={setProgramWeeks}
        onBack={() => goToStep(1)}
        onNext={() => structureReady && goToStep(3)}
      />
    );
  }

  return (
    <div className="phone create-program-phone">
      <header className="create-program-header"><button className="create-program-back" type="button" aria-label="Назад к тренировкам" onClick={onBack}><BackIcon /></button><strong>{isEditing ? 'Редактировать программу' : 'Создать программу'}</strong><span className="create-program-header-spacer" /></header>
      <main className="create-program-content">
        <section className="create-program-intro"><span>Шаг 1</span><h1>{isEditing ? 'Основная информация' : 'Новая программа'}</h1><p>Заполните информацию о программе. На следующем шаге вы соберёте один цикл тренировок, а затем зададите ритм и количество повторений.</p></section>
        <section className="create-program-form-card">
          <label className="program-field"><span>Название программы <b>*</b></span><textarea className="program-auto-textarea" value={name} onChange={(event) => { setName(event.target.value); resizeTextArea(event.target); }} placeholder="Например, Сила и масса" rows="1" maxLength={80} /></label>
          <label className="program-field"><span>Описание</span><textarea className="program-auto-textarea" value={description} onChange={(event) => { setDescription(event.target.value); resizeTextArea(event.target); }} placeholder="Коротко опишите цель и особенности программы" rows="1" maxLength={600} /></label>
        </section>

        <section className="create-program-section">
          <div className="create-program-section-head"><div><span>Обложка</span><h2>Фото программы</h2></div><small>Необязательно · до 5 МБ</small></div>
          <label className={`program-cover ${coverUrl ? 'has-image' : ''}`}>
            {coverUrl ? <img src={coverUrl} alt="Предпросмотр обложки программы" /> : <><span className="program-cover-icon"><ImageIcon /></span><strong>Добавить обложку</strong><small>JPG, PNG или WEBP</small></>}
            <input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleCoverChange} />
          </label>
        </section>

        <section className="create-program-section">
          <div className="create-program-section-head"><div><span>Тип тренировок</span><h2>Категории</h2></div></div>
          <div className="program-category-list">{CATEGORY_OPTIONS.map((category) => <button className={categories.includes(category) ? 'active' : ''} type="button" key={category} onClick={() => toggleCategory(category)} aria-pressed={categories.includes(category)}>{category}</button>)}</div>
          <div className="program-select-card">
            <SelectRow label="Место тренировок" value={place} onChange={setPlace} placeholder="Выбрать" options={['Тренажёрный зал','Дом','Улица','Неважно']} />
            <SelectRow label="Оборудование" value={equipment} onChange={setEquipment} placeholder="Выбрать" options={['Полный зал','Свободные веса','Тренажёры','Минимум оборудования','Без оборудования']} />
            <SelectRow label="Уровень" value={level} onChange={setLevel} placeholder="Выбрать" options={['Начальный','Средний','Продвинутый']} />
          </div>
        </section>
      </main>
      <footer className="create-program-footer"><button className="create-program-next" type="button" disabled={!canContinue} onClick={() => goToStep(2)}>Далее</button></footer>
    </div>
  );
}
