import { useEffect, useState } from 'react';
import {
  EXERCISE_EQUIPMENT,
  createCustomExercise,
  muscleGroupChoiceError,
  muscleGroupDraft,
  updateCustomExercise,
} from '../lib/exerciseLibrary.js';
import '../exercise-library-picker.css';
import { ExercisePhotoGallery } from './ExercisePhotoGallery.jsx';
import { MuscleGroupField } from './MuscleGroupField.jsx';

const EMPTY_DRAFT = {
  name: '', muscleGroup: 'Грудь', customMuscleGroup: '', equipment: 'Гантели', description: '',
  videoUrl: '', videoFile: null, removeVideoFile: false,
  photoFiles: [], existingPhotos: [], removedPhotoPaths: [],
};

function draftFromExercise(exercise) {
  return {
    ...EMPTY_DRAFT,
    name: exercise.name,
    ...muscleGroupDraft(exercise.display_muscle_group),
    equipment: exercise.equipment,
    description: exercise.description || '',
    videoUrl: exercise.video_url || '',
    existingPhotos: exercise.resolvedPhotos || [],
  };
}

export function CustomExerciseForm({ exercise = null, initialChoice = null, onCancel, onSaved }) {
  const editing = Boolean(exercise);
  const [draft, setDraft] = useState(() => exercise ? draftFromExercise(exercise) : { ...EMPTY_DRAFT, ...initialChoice });
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [photoPreviews, setPhotoPreviews] = useState([]);
  useEffect(() => {
    const previews = draft.photoFiles.map(file => ({ file, url: URL.createObjectURL(file) }));
    setPhotoPreviews(previews);
    return () => previews.forEach(preview => URL.revokeObjectURL(preview.url));
  }, [draft.photoFiles]);
  const visibleExistingPhotos = draft.existingPhotos.filter(photo => !draft.removedPhotoPaths.includes(photo.path));
  const previewGallery = [
    ...visibleExistingPhotos.map(photo => photo.url).filter(Boolean),
    ...photoPreviews.map(preview => preview.url),
  ];
  const hasStoredVideo = Boolean(exercise?.video_path) && !draft.removeVideoFile && !draft.videoFile;

  function selectPhotoFiles(event) {
    const files = Array.from(event.target.files || []);
    event.target.value = '';
    if (!files.length) return;
    if (files.some(file => !['image/jpeg', 'image/png', 'image/webp'].includes(file.type))) {
      setFormError('Фото должны быть в формате JPEG, PNG или WebP.');
      return;
    }
    if (files.some(file => file.size > 8 * 1024 * 1024)) {
      setFormError('Размер каждого фото не должен превышать 8 МБ.');
      return;
    }
    if (visibleExistingPhotos.length + draft.photoFiles.length + files.length > 10) {
      setFormError('Можно добавить до 10 фотографий одного упражнения.');
      return;
    }
    setFormError('');
    setDraft(current => ({ ...current, photoFiles: [...current.photoFiles, ...files] }));
  }

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setFormError('');
    try {
      const saved = editing ? await updateCustomExercise(exercise.id, draft) : await createCustomExercise(draft);
      await onSaved(saved);
    } catch (requestError) {
      setFormError(requestError?.message || (editing ? 'Не удалось сохранить упражнение.' : 'Не удалось создать упражнение.'));
    } finally {
      setSaving(false);
    }
  }

  const canSave = Boolean(draft.name.trim()) && !muscleGroupChoiceError(draft) && draft.equipment !== 'Все';

  return <form className="exercise-library-create-form" onSubmit={submit}>
    <div className="exercise-library-create-form-head"><span>Мои упражнения</span><h3>{editing ? 'Редактирование упражнения' : 'Новое упражнение'}</h3><small>Обязательные поля отмечены *</small></div>
    <label><span>Название *</span><input required value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} maxLength={100} placeholder="Например, жим гантелей сидя" autoFocus /></label>
    <div className="exercise-library-create-form-grid">
      <MuscleGroupField muscleGroup={draft.muscleGroup} customMuscleGroup={draft.customMuscleGroup} onChange={(fields) => setDraft(current => ({ ...current, ...fields }))} />
      <label><span>Оборудование *</span><select required value={draft.equipment} onChange={(event) => setDraft({ ...draft, equipment: event.target.value })}>{EXERCISE_EQUIPMENT.filter((value) => value !== 'Все').map((value) => <option key={value}>{value}</option>)}</select></label>
    </div>
    <label><span>Описание · необязательно</span><textarea value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} maxLength={2000} rows="4" placeholder="Техника, положение тела, важные подсказки…" /></label>
    <div className="exercise-library-photo-fields">
      <label className="exercise-library-photo-upload">
        <span>Фотографии упражнения · необязательно</span>
        <input type="file" multiple accept="image/jpeg,image/png,image/webp" onChange={selectPhotoFiles} />
        <small>Выберите несколько фото или добавляйте по одному. До 10 изображений, каждое до 8 МБ (JPEG, PNG, WebP).</small>
      </label>
      {previewGallery.length > 0 && <ExercisePhotoGallery photos={previewGallery} alt={draft.name || 'Упражнение'} />}
      {(visibleExistingPhotos.length > 0 || photoPreviews.length > 0) && <div className="exercise-library-photo-thumbnails">
        {visibleExistingPhotos.map((photo, number) => <div className="exercise-library-photo-thumb" key={photo.path}>
          {photo.url ? <img src={photo.url} alt={`Сохранённое фото ${number + 1}`} /> : <span>Фото</span>}
          <button type="button" aria-label={`Убрать сохранённое фото ${number + 1}`}
            onClick={() => setDraft(current => ({
              ...current, removedPhotoPaths: [...current.removedPhotoPaths, photo.path],
            }))}>×</button>
        </div>)}
        {photoPreviews.map((preview, number) => <div className="exercise-library-photo-thumb" key={preview.url}>
          <img src={preview.url} alt={`Новое фото ${number + 1}`} />
          <button type="button" aria-label={`Убрать новое фото ${number + 1}`}
            onClick={() => setDraft(current => ({
              ...current, photoFiles: current.photoFiles.filter((_, index) => index !== number),
            }))}>×</button>
        </div>)}
      </div>}
      {draft.removedPhotoPaths.length > 0 && <button className="exercise-library-photo-restore" type="button"
        onClick={() => setDraft(current => ({ ...current, removedPhotoPaths: [] }))}>Вернуть удалённые фото</button>}
    </div>
    <div className="exercise-library-video-fields">
      {hasStoredVideo && <div className="exercise-library-video-current">
        <span>Загруженное видео сохранено</span>
        <button type="button" onClick={() => setDraft(current => ({ ...current, removeVideoFile: true }))}>Убрать видео</button>
      </div>}
      {exercise?.video_path && draft.removeVideoFile && <button className="exercise-library-photo-restore" type="button"
        onClick={() => setDraft(current => ({ ...current, removeVideoFile: false }))}>Вернуть удалённое видео</button>}
      <label><span>Ссылка на видео · необязательно</span><input type="url" value={draft.videoUrl} disabled={Boolean(draft.videoFile) || hasStoredVideo} onChange={(event) => setDraft({ ...draft, videoUrl: event.target.value })} placeholder="https://youtube.com/…" /></label>
      <div className="exercise-library-video-divider"><span>или</span></div>
      <label className="exercise-library-video-upload"><span>{hasStoredVideo ? 'Заменить видео · необязательно' : 'Загрузить видео · необязательно'}</span><input type="file" accept="video/mp4,video/webm,video/quicktime" disabled={Boolean(draft.videoUrl.trim())} onChange={(event) => setDraft({ ...draft, videoFile: event.target.files?.[0] || null })} /><strong>{draft.videoFile ? draft.videoFile.name : 'MP4, WEBM или MOV · до 100 МБ'}</strong></label>
    </div>
    {editing && <small>Программы и история тренировок сохранятся.</small>}
    {formError && <div className="exercise-library-error" role="alert">{formError}</div>}
    <div className="exercise-library-create-actions"><button type="button" onClick={onCancel}>Отмена</button><button className="primary" type="submit" disabled={saving || !canSave}>{saving ? 'Сохраняем…' : editing ? 'Сохранить' : 'Создать'}</button></div>
  </form>;
}
