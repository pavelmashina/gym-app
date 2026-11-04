import { useEffect, useRef, useState } from 'react';
import '../exercise-photo-gallery.css';

/** Swipe only for a clearly horizontal gesture; vertical scroll stays native. */
export function gallerySwipeIndex(current, count, deltaX, deltaY) {
  if (count < 2 || Math.abs(deltaX) < 45 || Math.abs(deltaX) < Math.abs(deltaY) * 1.3) return current;
  return (current + (deltaX < 0 ? 1 : -1) + count) % count;
}

export function ExercisePhotoGallery({ photos = [], alt = 'Фото упражнения' }) {
  const sources = Array.isArray(photos) ? photos.filter(Boolean) : [];
  const count = sources.length;
  const [index, setIndex] = useState(0);
  const [expanded, setExpanded] = useState(false);
  const touchStart = useRef(null);
  const swiped = useRef(false);
  const current = Math.min(index, Math.max(0, count - 1));

  useEffect(() => {
    setIndex(i => Math.min(i, Math.max(0, count - 1)));
    if (!count) setExpanded(false);
  }, [count]);

  useEffect(() => {
    if (!expanded) return undefined;
    const onKey = event => {
      if (event.key === 'Escape') { event.stopPropagation(); setExpanded(false); }
      if (event.key === 'ArrowLeft' && count > 1) { event.preventDefault(); setIndex(i => (i + count - 1) % count); }
      if (event.key === 'ArrowRight' && count > 1) { event.preventDefault(); setIndex(i => (i + 1) % count); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [expanded, count]);

  function beginTouch(event) {
    if (event.touches.length !== 1) return;
    touchStart.current = { x: event.touches[0].clientX, y: event.touches[0].clientY };
  }

  function endTouch(event) {
    const start = touchStart.current;
    touchStart.current = null;
    if (!start || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    const next = gallerySwipeIndex(current, count, deltaX, deltaY);
    if (next !== current) {
      swiped.current = true;
      setIndex(next);
    }
  }

  function step(direction) {
    setIndex(i => (i + direction + count) % count);
  }

  if (!count) return null;
  return <>
    <div className="exercise-photo-gallery" role="group" aria-label="Фотографии упражнения">
      <div className="exercise-photo-gallery-stage" onTouchStart={beginTouch} onTouchEnd={endTouch} onTouchCancel={() => { touchStart.current = null; }}>
        <button className="exercise-photo-gallery-open" type="button"
          aria-label={`Открыть фото ${current + 1} из ${count} на весь экран`}
          onClick={() => {
            if (swiped.current) { swiped.current = false; return; }
            setExpanded(true);
          }}>
          <img src={sources[current]} alt={`${alt}, фото ${current + 1}`} draggable="false" />
        </button>
        {count > 1 && <>
          <button className="exercise-photo-gallery-prev" type="button" aria-label="Предыдущее фото" onClick={() => step(-1)}>‹</button>
          <button className="exercise-photo-gallery-next" type="button" aria-label="Следующее фото" onClick={() => step(1)}>›</button>
          <span className="exercise-photo-gallery-count" aria-live="polite">{current + 1} / {count}</span>
        </>}
      </div>
      {count > 1 && <div className="exercise-photo-gallery-dots" role="group" aria-label="Выбрать фотографию">
        {sources.map((_, number) => <button type="button" key={number} className={number === current ? 'active' : ''}
          aria-current={number === current ? 'true' : undefined}
          aria-label={`Фото ${number + 1}`} onClick={() => setIndex(number)} />)}
      </div>}
    </div>

    {expanded && <div className="exercise-photo-lightbox-overlay">
      <button type="button" className="exercise-photo-lightbox-scrim" aria-label="Закрыть просмотр" onClick={() => setExpanded(false)} />
      <section className="exercise-photo-lightbox" role="dialog" aria-modal="true" aria-label="Просмотр фото упражнения">
        <header>
          <span>{current + 1} / {count}</span>
          <button type="button" aria-label="Закрыть просмотр фото" onClick={() => setExpanded(false)}>×</button>
        </header>
        <div className="exercise-photo-lightbox-stage"
          onTouchStart={beginTouch} onTouchEnd={endTouch} onTouchCancel={() => { touchStart.current = null; }}>
          <img src={sources[current]} alt={`${alt}, фото ${current + 1}`} draggable="false" />
        </div>
        {count > 1 && <div className="exercise-photo-lightbox-nav">
          <button type="button" aria-label="Предыдущее фото" onClick={() => step(-1)}>‹</button>
          <span>{current + 1} из {count}</span>
          <button type="button" aria-label="Следующее фото" onClick={() => step(1)}>›</button>
        </div>}
      </section>
    </div>}
  </>;
}
