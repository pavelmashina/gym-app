import '../exercise-library-picker.css';
import ExerciseTechnique from './ExerciseTechnique.jsx';
import { ExercisePhotoGallery } from './ExercisePhotoGallery.jsx';

function isDirectVideo(url) {
  return /\.(mp4|webm|mov)(?:$|[?#])/i.test(String(url || '')) || String(url || '').includes('/storage/v1/object/sign/exercise-videos/');
}

export function ExerciseInfoModal({ exercise, onClose, onEdit, onDelete }) {
  const video = exercise.resolvedVideoUrl || exercise.video_url || null;
  const photos = exercise.resolvedPhotoUrls?.length
    ? exercise.resolvedPhotoUrls
    : (exercise.resolvedPhotoUrl ? [exercise.resolvedPhotoUrl] : []);
  return <div className="exercise-library-info-shell" role="dialog" aria-modal="true" aria-label={`Информация: ${exercise.name}`}>
    <button className="exercise-library-info-scrim" type="button" aria-label="Закрыть" onClick={onClose} />
    <section className="exercise-library-info-card">
      <header><div><span>Упражнение</span><h3>{exercise.name}</h3></div><button type="button" onClick={onClose}>×</button></header>
      {photos.length > 0 && <ExercisePhotoGallery photos={photos} alt={exercise.name} />}
      {video && <div className="exercise-library-info-video">
        {isDirectVideo(video) ? <video controls playsInline preload="metadata" src={video} /> : <a href={video} target="_blank" rel="noreferrer"><span>▶</span><strong>Открыть видео</strong><small>Видео откроется в новой вкладке</small></a>}
      </div>}
      <div className="exercise-library-info-tags"><span>{exercise.display_muscle_group || exercise.muscle_group}</span>{exercise.equipment && <span>{exercise.equipment}</span>}{exercise.isMine && <span>Моё упражнение</span>}</div>
      {!video && <p className="exercise-library-empty">Видео пока не добавлено.</p>}
      <section className="exercise-library-info-description"><ExerciseTechnique exercise={exercise} /></section>
      {exercise.isMine && <div className="exercise-library-info-actions">
        <button type="button" onClick={() => onEdit(exercise)}>Редактировать своё упражнение</button>
        {onDelete && <button className="exercise-library-info-delete" type="button" onClick={() => onDelete(exercise)}>Удалить упражнение</button>}
      </div>}
    </section>
  </div>;
}
