import { useEffect, useRef, useState } from 'react';
import { ExercisePhotoGallery } from './ExercisePhotoGallery.jsx';
import ExerciseTechnique from './ExerciseTechnique.jsx';
import { exerciseMuscleTags } from '../lib/exerciseLibrary.js';
import { defaultVariationSelection, variationPresentation } from '../lib/exerciseVariationSelection.js';
import '../training-exercise-browser.css';

function isDirectVideo(url) {
  return /\.(mp4|webm|mov)(?:$|[?#])/i.test(String(url || ''))
    || String(url || '').includes('/storage/v1/object/sign/exercise-videos/');
}


const EXTRA_TECHNIQUE_KEYS = ['setup_instructions', 'execution_steps', 'technique_cues', 'common_mistakes', 'safety_notes'];

function ExerciseDescription({ exercise, variation }) {
  const [expanded, setExpanded] = useState(false);
  const [overflows, setOverflows] = useState(false);
  const textRef = useRef(null);
  const baseDescription = exercise.short_description || exercise.description || exercise.technique || exercise.notes || 'Описание пока не добавлено.';
  const description = [
    variation?.summary ? 'Вариация: ' + variation.summary + '.' : '',
    variation?.notes,
    baseDescription,
  ].filter(Boolean).join('\n\n');
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
  const [selection, setSelection] = useState(() => defaultVariationSelection(exercise));
  useEffect(() => { setSelection(defaultVariationSelection(exercise)); }, [exercise.id, exercise.variation_axes]);
  const variation = variationPresentation(exercise, selection);
  const photos = exercise.resolvedPhotoUrls?.length ? exercise.resolvedPhotoUrls
    : exercise.resolvedPhotoUrl ? [exercise.resolvedPhotoUrl] : [];
  const video = variation.video;
  const animatedImage = /\.(gif|webp)(?:$|[?#])/i.test(String(video || ''));

  return <>
    <div className="training-exercise-detail-heading">
      <h1>{exercise.name}</h1>
    </div>
    {photos.length > 0 && <ExercisePhotoGallery photos={photos} alt={exercise.name} />}
    <div className="training-exercise-detail-tags">
      {exerciseMuscleTags(exercise).map((tag, index) => <span key={tag}
        className={index === 0 ? 'is-primary' : 'is-secondary'}>{tag}</span>)}
      {exercise.equipment && <span>{exercise.equipment}</span>}
    </div>
    {variation.hasVariation && <section className="training-exercise-variation-axes" aria-label="Вариации упражнения">
      <h2>Вариации</h2>
      {variation.axes.map((axis, axisIndex) => <div className="training-exercise-variation-axis" key={axis.label}>
        <strong>{axis.label}</strong>
        <div className="training-exercise-variation-options" role="group" aria-label={axis.label}>
          {axis.options.map(option => <button key={option.label} type="button"
            className={variation.selection[axisIndex] === option.label ? 'active' : ''}
            aria-pressed={variation.selection[axisIndex] === option.label}
            onClick={() => setSelection(current => {
              const next = [...current];
              next[axisIndex] = option.label;
              return next;
            })}>{option.label}</button>)}
        </div>
      </div>)}
    </section>}
    <div className={'training-exercise-detail-video' + (video ? '' : ' is-empty')}
      aria-label={variation.hasVariation ? 'Видео: ' + variation.summary : 'Видео упражнения'}>
      {!video
        ? <div className="training-exercise-video-empty">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><rect x="3" y="5" width="13" height="14" rx="2" /><path d="m16 10 5-3v10l5-3" /></svg>
            <span>{variation.missingVideo ? 'Видео выбранной вариации пока не добавлено' : 'Видео пока нет'}</span>
          </div>
        : animatedImage ? <img key={video} src={video} alt={'Демонстрация упражнения ' + exercise.name} loading="lazy" />
        : isDirectVideo(video) ? <video key={video} controls playsInline preload="metadata" src={video} />
        : <a key={video} href={video} target="_blank" rel="noreferrer">Открыть видео упражнения</a>}
    </div>
    <ExerciseDescription key={exercise.id} exercise={exercise} variation={variation} />
  </>;
}
