import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { programDraftKey, readProgramDraft, writeProgramDraft, clearProgramDraft } from '../lib/programDraft.js';
import { createProgram, getProgram, startProgram, startProgramWithWeekdays, updateProgram } from '../lib/programs.js';
import { CATEGORY_OPTIONS,PLACE_OPTIONS,EQUIPMENT_OPTIONS,LEVEL_OPTIONS,PROGRAM_DETAIL_FIELDS,normalizeProgramCategories,normalizeProgramLevel } from '../lib/programOptions.js';
import { CreateProgramCycleScreen } from './CreateProgramCycleScreen.jsx';
import { CreateProgramCycleScheduleScreen } from './CreateProgramCycleScheduleScreen.jsx';
import { ProgramCoverCropEditor } from './ProgramCoverCropEditor.jsx';
import { JoinReadyProgramScreen } from './JoinReadyProgramScreen.jsx';
import { getCatalogProgram } from '../lib/catalogPrograms.js';
import { catalogProgramCycleCount } from '../lib/catalogProgramDefaults.js';
import { defaultTrainingWeekdays, normalizeTrainingWeekdays, nextTrainingDate, trainingFrequencyLabel, trainingScheduleLabel } from '../lib/readyProgramSchedule.js';
import '../create-program.css';
import '../program-persistence.css';


function BackIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>; }
function ImageIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3.5" y="4" width="17" height="16" rx="3" /><circle cx="9" cy="9" r="1.7" /><path d="m5.5 17 4.2-4.2 3 2.8 2.4-2.2 3.4 3.6" /></svg>; }
function ChevronIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>; }

function SelectRow({ label, value, onChange, options, placeholder }) {
  const selectId = useId();
  const customId = useId();
  const [customSelected, setCustomSelected] = useState(false);
  const allowsCustom = options.includes('Свой вариант');
  // Keep legacy saved values with ё readable in the refreshed dropdown.
  const displayValue = value === 'Тренажёрный зал' && options.includes('Тренажерный зал')
    ? 'Тренажерный зал' : value === 'Тренажёры' && options.includes('Тренажеры') ? 'Тренажеры' : value;
  const existingCustom = Boolean(value && !options.includes(value) && !options.includes(displayValue));
  const showCustomInput = allowsCustom && (customSelected || existingCustom);
  const selectedValue = showCustomInput ? 'Свой вариант' : displayValue;
  const handleChoice = choice => {
    if (allowsCustom && choice === 'Свой вариант') {
      setCustomSelected(true);
      onChange('');
    } else {
      setCustomSelected(false);
      onChange(choice);
    }
  };
  return <div className={`program-select-row${showCustomInput ? ' program-select-row-custom' : ''}`}>
    <label className="program-select-row-label" htmlFor={selectId}>{label}</label>
    <div className="program-select-control">
      <select id={selectId} value={selectedValue} onChange={event => handleChoice(event.target.value)}>
        {!allowsCustom && value && !options.includes(value) && <option value={value}>{value} (ранее сохранено)</option>}
        <option value="">{placeholder}</option>
        {options.map(option => <option value={option} key={option}>{option}</option>)}
      </select>
      <ChevronIcon />
    </div>
    {showCustomInput && <div className="program-select-custom-input">
      <label htmlFor={customId}>Свой вариант</label>
      <input id={customId} type="text" value={value || ''} onChange={event => onChange(event.target.value)} placeholder="Укажите свой вариант" maxLength={100} autoComplete="off" />
    </div>}
  </div>;
}

function resizeTextArea(element) {
  if (!element) return;
  element.style.height = 'auto';
  element.style.height = `${element.scrollHeight}px`;
}

function createCycle() { return { id: crypto.randomUUID(), number: 1, workouts: [] }; }
function normalizeIntoOneCycle(programWeeks) {
  const workouts = (programWeeks ?? []).flatMap((week) => week.workouts ?? []);
  return [{ id: programWeeks?.[0]?.id ?? crypto.randomUUID(), number: 1, workouts }];
}

export function CreateProgramScreen({ onBack, onCreated, programId = null, launchOnly = false, userId = null }) {
  const isEditing = Boolean(programId) && !launchOnly;
  const draftKey = !programId && !launchOnly ? programDraftKey(userId) : null;
  const [restoration] = useState(() => {
    try { return { draft: readProgramDraft(localStorage, draftKey), error: '' }; }
    catch { return { draft: null, error: 'Не удалось восстановить черновик. Автосохранение недоступно; не закрывайте страницу до сохранения программы.' }; }
  });
  const restored = restoration.draft;
  const draftFinished = useRef(false);
  const nameInputRef = useRef(null);
  const descriptionInputRef = useRef(null);
  const [draftError, setDraftError] = useState(restoration.error);
  const [draftBlocked, setDraftBlocked] = useState(Boolean(restoration.error));
  const [step, setStep] = useState(restored?.step ?? (launchOnly ? 3 : 1));
  const [name, setName] = useState(restored?.name ?? '');
  const [description, setDescription] = useState(restored?.description ?? '');
  const [coverUrl, setCoverUrl] = useState('');
  const [coverFile, setCoverFile] = useState(null);
  const [coverCropSource, setCoverCropSource] = useState(null);
  const [coverSelectionError, setCoverSelectionError] = useState('');
  const [existingCoverPath, setExistingCoverPath] = useState(null);
  const [categories, setCategories] = useState(() => normalizeProgramCategories(restored?.categories));
  const [place, setPlace] = useState(restored?.place ?? '');
  const [equipment, setEquipment] = useState(restored?.equipment ?? '');
  const [level, setLevel] = useState(() => normalizeProgramLevel(restored?.level));
  const [details, setDetails] = useState(restored?.details ?? {});
  const [scheduleMode, setScheduleMode] = useState(restored?.scheduleMode ?? 'custom');
  const [cycleRepeatCount, setCycleRepeatCount] = useState(restored?.cycleRepeatCount ?? 1);
  const [joinWeekdays, setJoinWeekdays] = useState([1, 3, 5]);
  const [programWeeks, setProgramWeeks] = useState(() => restored?.programWeeks ?? [createCycle()]);
  const [editingWorkoutId, setEditingWorkoutId] = useState(restored?.editingWorkoutId ?? null);
  const [startDate, setStartDate] = useState(restored?.startDate ?? '');
  const [coverNeedsSelection, setCoverNeedsSelection] = useState(Boolean(restored?.hasCover));
  const [participationStatus, setParticipationStatus] = useState(null);
  const [originalStructureMode, setOriginalStructureMode] = useState('cycle');
  const [saving, setSaving] = useState(false);
  const [savingAction, setSavingAction] = useState('');
  const [saveError, setSaveError] = useState('');
  const [initialLoading, setInitialLoading] = useState(Boolean(programId));
  const [initialError, setInitialError] = useState('');

  // Autosize restored drafts and loaded programs before the first paint, not
  // only when the user focuses/types into a textarea.
  useLayoutEffect(() => {
    if (step !== 1 || launchOnly || initialLoading) return undefined;
    let active = true;
    const resize = () => {
      if (!active) return;
      resizeTextArea(nameInputRef.current);
      resizeTextArea(descriptionInputRef.current);
    };
    resize();
    const frame = requestAnimationFrame(resize);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => resize());
    if (descriptionInputRef.current?.parentElement) observer?.observe(descriptionInputRef.current.parentElement);
    window.addEventListener('resize', resize);
    document.fonts?.ready?.then(resize).catch(() => {});
    return () => {
      active = false;
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', resize);
    };
  }, [step, launchOnly, initialLoading, name, description]);

  useEffect(() => () => {
    if (coverCropSource?.createdUrl) URL.revokeObjectURL(coverCropSource.url);
  }, [coverCropSource]);

  useEffect(() => {
    if (!draftKey || draftFinished.current || draftBlocked) return;
    try {
      writeProgramDraft(localStorage, draftKey, { step, name, description, categories, place, equipment, level, details,
        scheduleMode, cycleRepeatCount, programWeeks, editingWorkoutId, startDate, hasCover: Boolean(coverFile) || coverNeedsSelection });
      setDraftError('');
    } catch { setDraftError('Не удалось сохранить черновик на устройстве. Не закрывайте страницу до сохранения программы.'); }
  }, [draftKey, step, name, description, categories, place, equipment, level, details, scheduleMode, cycleRepeatCount,
    programWeeks, editingWorkoutId, startDate, coverFile, coverNeedsSelection, draftBlocked]);

  function discardDraft() {
    if (!window.confirm('Удалить черновик на этом устройстве и начать новую программу?')) return;
    try { clearProgramDraft(localStorage, draftKey); }
    catch { setDraftError('Не удалось удалить черновик. Попробуйте ещё раз.'); return; }
    setStep(1); setName(''); setDescription(''); setCategories([]); setPlace(''); setEquipment(''); setLevel(''); setDetails({});
    setScheduleMode('custom'); setCycleRepeatCount(1); setProgramWeeks([createCycle()]);
    setEditingWorkoutId(null); setStartDate(''); setCoverFile(null); setCoverUrl(''); setCoverCropSource(null); setCoverSelectionError(''); setCoverNeedsSelection(false);
    setDraftBlocked(false); setDraftError('');
  }

  const draftNotice = draftKey && draftError ? <aside className="program-draft-notice" role="alert">
    {draftError}
    <button type="button" onClick={discardDraft} disabled={saving}>Начать новую программу</button>
  </aside> : null;

  useEffect(() => () => { if (coverUrl?.startsWith('blob:')) URL.revokeObjectURL(coverUrl); }, [coverUrl]);

  useEffect(() => {
    if (!programId) { setInitialLoading(false); return undefined; }
    let active = true;
    async function loadProgram() {
      setInitialLoading(true); setInitialError('');
      try {
        const program = await getProgram(programId);
        let prescribedCycleCount = program.cycleRepeatCount ?? 1;
        let joinDetails = program.details ?? {};
        // Catalog adoption historically omitted the original schedule and set
        // just one cycle. Read the source defaults for the join screen without
        // overriding any later explicit user settings.
        if (launchOnly && program.sourceCatalogProgramId) {
          try {
            const catalog = await getCatalogProgram(program.sourceCatalogProgramId);
            joinDetails = { ...(catalog.sourcePayload?.details ?? {}), ...joinDetails };
            if (!program.participation && prescribedCycleCount <= 1) {
              prescribedCycleCount = catalogProgramCycleCount(catalog.sourcePayload);
            }
          } catch (lookupError) {
            console.warn('Using the saved program defaults: source catalog details unavailable.', lookupError);
          }
        }
        if (!active) return;
        setName(program.name);
        setDescription(program.description);
        setCategories(normalizeProgramCategories(program.categories));
        setPlace(program.trainingPlace);
        setEquipment(program.equipment);
        setLevel(normalizeProgramLevel(program.level));
        setDetails(launchOnly ? joinDetails : program.details ?? {});
        if (launchOnly) setJoinWeekdays(defaultTrainingWeekdays({ details: joinDetails, scheduleMode: program.scheduleMode, workoutCount: program.programWeeks?.flatMap(week => week.workouts ?? []).length }));
        setScheduleMode(program.scheduleMode ?? 'custom');
        setCycleRepeatCount(prescribedCycleCount);
        setProgramWeeks(normalizeIntoOneCycle(program.programWeeks));
        setParticipationStatus(program.participation?.status ?? null);
        setOriginalStructureMode(program.structureMode ?? 'legacy_weeks');
        setExistingCoverPath(program.coverPath);
        setCoverUrl(program.coverUrl ?? '');
        if (launchOnly) setStep(3);
      } catch (error) {
        if (active) setInitialError(error?.message || 'Не удалось открыть программу.');
      } finally { if (active) setInitialLoading(false); }
    }
    loadProgram();
    return () => { active = false; };
  }, [programId, launchOnly]);

  const hasLiveParticipation = ['active', 'paused'].includes(participationStatus);
  const legacyActiveLocked = isEditing && hasLiveParticipation && originalStructureMode !== 'cycle';
  const cycleRepeatLocked = hasLiveParticipation;
  const canContinue = name.trim().length > 0;
  const cycle = programWeeks[0];
  const structureReady = Boolean(cycle?.workouts?.length) && cycle.workouts.every((workout) => workout.name.trim() && workout.exercises.length > 0);

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
      details,
      scheduleMode,
      programWeeks: normalizeIntoOneCycle(programWeeks),
      coverFile,
    };
  }

  async function handleScheduleAction(action, startDate = '') {
    if (!structureReady || saving || legacyActiveLocked) return;
    setSaving(true); setSavingAction(action); setSaveError('');
    try {
      let savedProgram;
      if (launchOnly) {
        const days = normalizeTrainingWeekdays(joinWeekdays);
        const updated = await updateProgram({
          programId, existingCoverPath, ...buildSavePayload(),
          scheduleMode: 'custom',
          details: {
            ...details,
            frequency: trainingFrequencyLabel(days),
            schedule: trainingScheduleLabel(days),
          },
        });
        const participation = await startProgramWithWeekdays(programId, startDate, days);
        savedProgram = { ...updated, participation };
      } else if (isEditing) {
        savedProgram = await updateProgram({ programId, existingCoverPath, ...buildSavePayload() });
      } else {
        savedProgram = await createProgram({ ...buildSavePayload(), startDate: action === 'start' ? startDate : null });
      }
      draftFinished.current = true;
      try { clearProgramDraft(localStorage, draftKey); } catch { /* The program itself has already been saved. */ }
      onCreated?.(savedProgram);
    } catch (error) {
      setSaveError(error?.message || 'Не удалось выполнить действие. Попробуйте ещё раз.');
    } finally { setSaving(false); setSavingAction(''); }
  }

  function changeJoinWeekdays(next) {
    const days = normalizeTrainingWeekdays(next);
    if (!days.length) return;
    setJoinWeekdays(days);
    setStartDate(current => current ? nextTrainingDate(current, days) : current);
  }

  function handleCoverChange(event) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setCoverSelectionError('Для обложки подходят изображения JPG, PNG и WEBP.');
      return;
    }
    setCoverSelectionError('');
    setCoverCropSource({ url: URL.createObjectURL(file), createdUrl: true });
  }
  function applyCoverCrop(file) {
    setCoverFile(file);
    setCoverNeedsSelection(false);
    setCoverUrl(URL.createObjectURL(file));
    setCoverCropSource(null);
    setCoverSelectionError('');
  }
  function openExistingCoverCrop() {
    if (!coverUrl) return;
    setCoverSelectionError('');
    setCoverCropSource({ url: coverUrl, createdUrl: false });
  }

  function toggleCategory(category) {
    setCategories((current) => current.includes(category) ? current.filter((item) => item !== category) : [...current, category]);
  }
  function scrollToTop() { requestAnimationFrame(() => document.querySelector('.create-program-phone')?.scrollTo({ top: 0, behavior: 'instant' })); }
  function goToStep(nextStep) { setSaveError(''); setStep(nextStep); scrollToTop(); }

  if (initialLoading) return <div className="phone create-program-phone"><main className="create-program-content"><div className="program-persistence-loading"><div className="exercise-list-spinner" /><span>{launchOnly ? 'Готовим запуск программы…' : 'Загружаем программу…'}</span></div></main></div>;
  if (initialError) return <div className="phone create-program-phone"><header className="create-program-header"><button className="create-program-back" type="button" onClick={onBack}><BackIcon /></button><strong>Программа</strong><span /></header><main className="create-program-content"><div className="program-persistence-message" role="alert">{initialError}</div></main></div>;
  if (legacyActiveLocked) return <div className="phone create-program-phone"><header className="create-program-header"><button className="create-program-back" type="button" onClick={onBack}><BackIcon /></button><strong>Редактировать программу</strong><span /></header><main className="create-program-content"><div className="program-persistence-message" role="alert"><strong>Эта программа использует старую структуру и уже запущена.</strong><br />Чтобы преобразовать её в цикл, сначала завершите или остановите текущий запуск. Расписание и история останутся сохранены.</div></main></div>;

  if (launchOnly) return <JoinReadyProgramScreen
    programName={name.trim()}
    programWeeks={programWeeks}
    scheduleMode={scheduleMode}
    cycleRepeatCount={cycleRepeatCount}
    onCycleRepeatCountChange={setCycleRepeatCount}
    selectedWeekdays={joinWeekdays}
    onSelectedWeekdaysChange={changeJoinWeekdays}
    startDate={startDate}
    onStartDateChange={setStartDate}
    onBack={onBack}
    onAction={handleScheduleAction}
    saving={saving}
    savingAction={savingAction}
    saveError={saveError}
  />;

  if (step === 3) return <CreateProgramCycleScheduleScreen
    draftNotice={draftNotice}
    startDate={startDate}
    onStartDateChange={setStartDate}
    programName={name.trim()}
    programWeeks={programWeeks}
    onProgramWeeksChange={setProgramWeeks}
    scheduleMode={scheduleMode}
    onScheduleModeChange={setScheduleMode}
    cycleRepeatCount={cycleRepeatCount}
    onCycleRepeatCountChange={setCycleRepeatCount}
    cycleRepeatLocked={cycleRepeatLocked}
    onBack={() => launchOnly ? onBack?.() : goToStep(2)}
    onAction={handleScheduleAction}
    saving={saving}
    savingAction={savingAction}
    saveError={saveError}
    isEditing={isEditing}
    launchOnly={launchOnly}
  />;

  if (step === 2) return <CreateProgramCycleScreen draftNotice={draftNotice} editingWorkoutId={editingWorkoutId} onEditingWorkoutChange={setEditingWorkoutId} programName={name.trim()} categories={categories} programWeeks={programWeeks} onProgramWeeksChange={setProgramWeeks} onBack={() => goToStep(1)} onNext={() => structureReady && goToStep(3)} />;

  return <div className="phone create-program-phone create-program-step1-phone">
    <header className="create-program-header"><button className="create-program-back" type="button" aria-label="Назад к тренировкам" onClick={onBack}><BackIcon /></button><strong>{isEditing ? 'Редактировать программу' : 'Создать программу'}</strong><span className="create-program-header-spacer" /></header>
    <main className="create-program-content">
      {draftNotice}
      <section className="create-program-form-card"><label className="program-field"><span>Название программы <b>*</b></span><textarea ref={nameInputRef} className="program-auto-textarea" value={name} onChange={(event) => { setName(event.target.value); resizeTextArea(event.target); }} placeholder="Например, Сила и масса" rows="1" maxLength={80} /></label><label className="program-field"><span>Описание</span><textarea ref={descriptionInputRef} className="program-auto-textarea program-description-textarea" value={description} onChange={(event) => { setDescription(event.target.value); resizeTextArea(event.target); }} placeholder="Коротко опишите цель и особенности программы" rows="1" maxLength={600} /></label></section>
      <section className="create-program-section"><div className="create-program-section-head"><div><h2>Фото программы</h2></div><small>Необязательно · до 5 МБ</small></div><label className={`program-cover ${coverUrl ? 'has-image' : ''}`}>{coverUrl ? <img src={coverUrl} alt="Предпросмотр обложки программы" /> : <><span className="program-cover-icon"><ImageIcon /></span><strong>Добавить обложку</strong><small>JPG, PNG или WEBP</small></>}<input type="file" accept="image/jpeg,image/png,image/webp" onChange={handleCoverChange} /></label>{coverUrl && <button className="program-cover-edit-framing" type="button" onClick={openExistingCoverCrop}>Выбрать фрагмент фото</button>}{coverSelectionError && <div className="program-persistence-message" role="alert">{coverSelectionError}</div>}</section>
      <section className="create-program-section"><div className="create-program-section-head"><div><h2>Дополнительно</h2></div></div><div className="program-category-list">{CATEGORY_OPTIONS.map((category) => <button className={categories.includes(category) ? 'active' : ''} type="button" key={category} onClick={() => toggleCategory(category)}>{category}</button>)}</div><div className="program-select-card"><SelectRow label="Место тренировок" value={place} onChange={setPlace} placeholder="Выбрать" options={PLACE_OPTIONS} /><SelectRow label="Оборудование" value={equipment} onChange={setEquipment} placeholder="Выбрать" options={EQUIPMENT_OPTIONS} /><SelectRow label="Уровень" value={level} onChange={setLevel} placeholder="Выбрать" options={LEVEL_OPTIONS} />{PROGRAM_DETAIL_FIELDS.filter(field => ['duration', 'frequency'].includes(field.key)).map(field =>
          <SelectRow key={field.key} label={field.label} value={details[field.key] ?? ''} placeholder="Выбрать" options={field.options}
            onChange={value => setDetails(current => ({ ...current,[field.key]:value }))} />)}
        </div>
      </section>
    </main>
    <footer className="create-program-footer"><button className="create-program-next" type="button" disabled={!canContinue} onClick={() => goToStep(2)}>Далее</button></footer>
    {coverCropSource && <ProgramCoverCropEditor imageUrl={coverCropSource.url} onApply={applyCoverCrop} onCancel={() => setCoverCropSource(null)} />}
  </div>;
}
