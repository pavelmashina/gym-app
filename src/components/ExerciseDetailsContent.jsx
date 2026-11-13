import { useEffect, useRef, useState } from 'react';
import { ExercisePhotoGallery } from './ExercisePhotoGallery.jsx';
import ExerciseTechnique from './ExerciseTechnique.jsx';
import { exerciseMuscleTags } from '../lib/exerciseLibrary.js';
import '../training-exercise-browser.css';

function isDirectVideo(url) {
  return /\.(mp4|webm|mov)(?:$|[?#])/i.test(String(url || ''))
    || String(url || '').includes('/storage/v1/object/sign/exercise-videos/');
}


const EXTRA_TECHNIQUE_KEYS = ['setup_instructions', 'execution_steps', 'technique_cues', 'common_mistakes', 'safety_notes'];

function ExerciseDescription({ exercise }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef(null);
  const description = exercise.short_description || exercise.description || exercise.technique || exercise.notes || 'Описание пока не добавлено.';
  const hasExtra = Boolean(
    exercise.family_name_ru || exercise.measurement_note
    || EXTRA_TECHNIQUE_KEYS.some(key => Array.isArray(exercise[key]) && exercise[key].length > 0)
  );

  useEffect(() => {
    if (expanded) return undefined;
    const element = textRef.current;
    if (!element) return undefined;
    const measure = () => setOverflows(element.scrollHeight > element.clientHeight + 1);
    measure();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [description, expanded]);

  return <section className="training-exercise-detail-description">
    <h2>Описание</h2>
    <p ref={textRef} className={expanded ? 'training-exercise-description-text' : 'training-exercise-description-text is-clamped'}>{description}</p>
    {expanded && hasExtra && <div className="training-exercise-extra-technique">
      <ExerciseTechnique exercise={exercise} />
    </div>}
    {(overflows || hasExtra) && <button className="training-exercise-description-toggle" type="button"
      aria-expanded={expanded} onClick={() => setExpanded(value => !value)}>{expanded ? 'Скрыть' : 'Подробнее'}</button>}
  </section>;
}

export function ExerciseDetailsContent({ exercise }) {
  const photos = exercise.resolvedPhotoUrls?.length ? exercise.resolvedPhotoUrls
    : exercise.resolvedPhotoUrl ? [exercise.resolvedPhotoUrl] : [];
  const video = exercise.resolvedVideoUrl || exercise.video_url || null;
  const animatedImage = /\.(gif|webp)(?:$|[?#])/i.test(String(video || ''));
  return <>
    <div className="training-exercise-detail-heading">
      <span>Упражнение</span>
      <h1>{exercise.name}</h1>
    </div>
    {photos.length > 0 && <ExercisePhotoGallery photos={photos} alt={exercise.name} />}
    <div className="training-exercise-detail-tags">
      {exerciseMuscleTags(exercise).map((tag, index) => <span key={tag} className={index === 0 ? 'is-primary' : 'is-secondary'}>{tag}</span>)}
      {exercise.equipment && <span>{exercise.equipment}</span>}
    </div>
    <div className={'training-exercise-detail-video' + (video ? '' : ' is-empty')}>
      {!video
        ? <div className="training-exercise-video-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="2" /><path d="m16 10 5-3v10l-5-3" /></svg>
            <span>Видео пока нет</span>
          </div>
        : animatedImage ? <img src={video} alt={'Демонстрация упражнения ' + exercise.name} loading="lazy" />
        : isDirectVideo(video) ? <video controls playsInline preload="metadata" src={video} />
        : <a href={video} target="_blank" rel="noreferrer">Открыть видео упражнения</a>}
    </div>
    <ExerciseDescription key={exercise.id} exercise={exercise} />
    {Array.isArray(exercise.variation_axes) && exercise.variation_axes.length > 0 &&
      <section className="training-exercise-variation-axes" aria-label="Вариации упражнения">
        <h2>Вариации</h2>
        {exercise.variation_axes.map((axis, index) => <div key={index} className="training-exercise-variation-axis">
          <strong>{axis.label}</strong><p>{axis.options.join(' · ')}</p>
        </div>)}
      </section>}
  </>;
}
