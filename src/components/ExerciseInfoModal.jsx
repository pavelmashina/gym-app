import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ExerciseDetailsContent } from './ExerciseDetailsContent.jsx';
import '../training-exercise-browser.css';

// The picker and workout program flows open the same separate full-screen
// exercise information page as Training → Exercises. No bottom-sheet overlay.
export function ExerciseInfoModal({ exercise, onClose, onEdit, onDelete }) {
  useEffect(() => {
    const onKeyDown = event => { if (event.key === 'Escape') onClose(); };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return createPortal(<div className="training-exercise-page exercise-info-fullscreen"
    role="dialog" aria-modal="true" aria-label={'Информация: ' + exercise.name}>
    <header className="training-exercise-page-header">
      <button type="button" aria-label="Назад к списку упражнений" onClick={onClose}>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>
      </button>
      <strong>Информация</strong>
      <span aria-hidden="true" />
    </header>
    <main className="training-exercise-page-content">
      <ExerciseDetailsContent key={exercise.id} exercise={exercise} />
      {exercise.isMine && (onEdit || onDelete) && <div className="training-exercise-detail-actions">
        {onEdit && <button type="button" onClick={() => onEdit(exercise)}>Редактировать упражнение</button>}
        {onDelete && <button className="danger" type="button" onClick={() => onDelete(exercise)}>Удалить упражнение</button>}
      </div>}
    </main>
  </div>, document.body);
}
