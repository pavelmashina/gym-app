import { normalizeProgramCategories } from '../lib/programOptions.js';
import { ProgramStatusIcon } from './ProgramStatusIcon.jsx';

/** Identical program card for Catalog and My Programs; a swipeable single-row tag strip. */
export function ProgramListCard({ program, onOpen, status = null }) {
  const categories = normalizeProgramCategories(program.categories);
  const duration = program.details?.duration || program.sourcePayload?.details?.duration || program.sourcePayload?.duration || '';
  const place = program.trainingPlace || '';
  return <button className={`catalog-program-card program-list-unified-card${status ? ' my-program-card' : ''}`} type="button" onClick={() => onOpen(program.id)}>
    <span className={`catalog-program-cover${program.coverUrl ? ' catalog-program-cover-image' : ' catalog-program-placeholder'}`} aria-hidden="true">
      {program.coverUrl ? <img src={program.coverUrl} alt="" loading="lazy" /> : <span className="catalog-placeholder-icon" />}
    </span>
    <span className="catalog-program-card-copy">
      <span className="program-list-card-heading">
        <strong>{program.name}</strong>
        {status && <ProgramStatusIcon tone={status.tone} label={status.label} />}
      </span>
      <span className="catalog-program-card-meta program-list-tag-scroll" aria-label="Теги программы">
        <span className="catalog-program-tag">{place || 'Место не указано'}</span>
        <span className="catalog-program-tag">{duration || 'Длительность не указана'}</span>
        {categories.map(category => <span className="catalog-program-tag" key={category}>{category}</span>)}
      </span>
    </span>
  </button>;
}
