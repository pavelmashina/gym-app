import { useEffect, useRef, useState } from 'react';
import '../program-cover-crop.css';

const OUTPUT_WIDTH = 1200;
const OUTPUT_HEIGHT = 675; // The program detail cover is 16:9.
const MAX_ZOOM = 3;

function clamp(value, radius) {
  return Math.max(-radius, Math.min(radius, value));
}

function coverGeometry(dimensions, viewport, zoom) {
  if (!dimensions || !viewport.width || !viewport.height) return null;
  const scale = Math.max(viewport.width / dimensions.width, viewport.height / dimensions.height) * zoom;
  const width = dimensions.width * scale;
  const height = dimensions.height * scale;
  return {
    width,
    height,
    limitX: Math.max(0, (width - viewport.width) / 2),
    limitY: Math.max(0, (height - viewport.height) / 2),
  };
}

/** Crop the actual upload so the selected framing survives page reloads and works on all cover displays. */
export function ProgramCoverCropEditor({ imageUrl, onApply, onCancel }) {
  const frameRef = useRef(null);
  const loadedImageRef = useRef(null);
  const dragRef = useRef(null);
  const [dimensions, setDimensions] = useState(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let live = true;
    const image = new Image();
    image.crossOrigin = 'anonymous';
    image.onload = () => {
      if (!live) return;
      loadedImageRef.current = image;
      setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
      setError('');
    };
    image.onerror = () => { if (live) setError('Фото не удалось открыть. Выберите его повторно.'); };
    image.src = imageUrl;
    return () => { live = false; image.onload = null; image.onerror = null; loadedImageRef.current = null; };
  }, [imageUrl]);

  useEffect(() => {
    const node = frameRef.current;
    if (!node) return;
    const updateSize = () => setViewport({ width: node.clientWidth, height: node.clientHeight });
    updateSize();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(updateSize);
    observer?.observe(node);
    window.addEventListener('resize', updateSize);
    return () => { observer?.disconnect(); window.removeEventListener('resize', updateSize); };
  }, []);

  const geometry = coverGeometry(dimensions, viewport, zoom);
  const point = geometry
    ? { x: clamp(position.x, geometry.limitX), y: clamp(position.y, geometry.limitY) }
    : { x: 0, y: 0 };

  function startDrag(event) {
    if (!geometry || saving) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, offsetX: point.x, offsetY: point.y };
  }
  function moveDrag(event) {
    const drag = dragRef.current;
    if (!drag || !geometry) return;
    setPosition({
      x: clamp(drag.offsetX + event.clientX - drag.x, geometry.limitX),
      y: clamp(drag.offsetY + event.clientY - drag.y, geometry.limitY),
    });
  }
  function endDrag() { dragRef.current = null; }

  async function applyCrop() {
    if (!loadedImageRef.current || !geometry || saving) return;
    setSaving(true);
    setError('');
    try {
      const canvas = document.createElement('canvas');
      canvas.width = OUTPUT_WIDTH;
      canvas.height = OUTPUT_HEIGHT;
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Ваш браузер не поддерживает обработку изображения.');
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = 'high';
      const factor = OUTPUT_WIDTH / viewport.width;
      context.drawImage(
        loadedImageRef.current,
        (viewport.width - geometry.width) / 2 * factor + point.x * factor,
        (viewport.height - geometry.height) / 2 * factor + point.y * factor,
        geometry.width * factor,
        geometry.height * factor,
      );
      const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', .88));
      if (!blob) throw new Error('Не удалось подготовить обложку.');
      const type = blob.type || 'image/png';
      const ext = type === 'image/webp' ? 'webp' : type === 'image/jpeg' ? 'jpg' : 'png';
      const file = new File([blob], `program-cover-${Date.now()}.${ext}`, { type, lastModified: Date.now() });
      if (file.size > 5 * 1024 * 1024) throw new Error('Обложка после обработки превышает 5 МБ.');
      onApply(file);
    } catch (failure) {
      setError(failure?.name === 'SecurityError'
        ? 'Не удалось обработать это фото. Загрузите изображение с устройства повторно.'
        : failure?.message || 'Не удалось сохранить выбранный фрагмент.');
    } finally {
      setSaving(false);
    }
  }

  return <div className="program-cover-crop-backdrop">
    <section className="program-cover-crop-dialog" role="dialog" aria-modal="true" aria-label="Выбрать фрагмент обложки">
      <header className="program-cover-crop-header">
        <h2>Обложка программы</h2>
        <button type="button" onClick={onCancel} disabled={saving} aria-label="Закрыть выбор фрагмента">×</button>
      </header>
      <p className="program-cover-crop-hint">Переместите фотографию пальцем или мышью, чтобы выбрать видимую область.</p>
      <div className="program-cover-crop-frame" ref={frameRef}
        onPointerDown={startDrag} onPointerMove={moveDrag}
        onPointerUp={endDrag} onPointerCancel={endDrag}
        aria-label="Предпросмотр выбранного фрагмента">
        {geometry && <img src={imageUrl} alt="Фрагмент обложки"
          draggable={false}
          style={{
            width: `${geometry.width}px`,
            height: `${geometry.height}px`,
            transform: `translate(-50%, -50%) translate(${point.x}px, ${point.y}px)`,
          }} />}
        {!geometry && <span className="program-cover-crop-loading">Загружаем фото…</span>}
      </div>
      <label className="program-cover-crop-zoom">
        <span>Масштаб</span>
        <input type="range" min="1" max={MAX_ZOOM} step=".05" value={zoom}
          onChange={event => setZoom(Number(event.target.value))} disabled={!geometry || saving}
          aria-label="Масштаб фотографии" />
      </label>
      {error && <p className="program-cover-crop-error" role="alert">{error}</p>}
      <footer className="program-cover-crop-actions">
        <button type="button" onClick={onCancel} disabled={saving}>Отмена</button>
        <button type="button" onClick={applyCrop} disabled={!geometry || saving}>
          {saving ? 'Сохраняем…' : 'Применить кадр'}
        </button>
      </footer>
    </section>
  </div>;
}
