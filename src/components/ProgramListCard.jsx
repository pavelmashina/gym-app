import { normalizeProgramCategories, programLevelIndex } from '../lib/programOptions.js';
import { ProgramStatusIcon } from './ProgramStatusIcon.jsx';

/** Shared accessible program card: clickable cover/title, independently scrollable tags. */
export function ProgramListCard({ program, onOpen, status = null }) {
  const categories = normalizeProgramCategories(program.categories);
  const duration = program.details?.duration || program.sourcePayload?.details?.duration || program.sourcePayload?.duration
    || (program.structureMode !== 'cycle' && program.weekCount > 1 ? `${program.weekCount} нед.` : '');
  const place = program.trainingPlace || '';
  const difficulty = programLevelIndex(program.level);
  return <article className={`catalog-program-card program-list-unified-card${status ? ' my-program-card' : ''}`}>
    <button className="program-list-card-open" type="button" onClick={() => onOpen(program.id)} aria-label={`Открыть программу «${program.name}»`} />
    <span className={`catalog-program-cover${program.coverUrl ? ' catalog-program-cover-image' : ' catalog-program-placeholder'}`} aria-hidden="true">
      {program.coverUrl ? <img src={program.coverUrl} alt="" loading="lazy" /> : <span className="catalog-placeholder-icon" />}
    </span>
    <span className="catalog-program-card-copy">
      <span className="program-list-card-heading">
        <strong>{program.name}</strong>
        {status && <ProgramStatusIcon tone={status.tone} label={status.label} />}
      </span>
      <span className="catalog-program-card-meta program-list-tag-scroll" role="region" tabIndex={0} aria-label={`Теги программы «${program.name}». Прокрутите по горизонтали`}>
        <span className="catalog-program-tag program-list-tag-key">{place || 'Место не указано'}</span>
        {categories.map(category => <span className="catalog-program-tag" key={category}>{category}</span>)}
      </span>
      <span className="program-list-difficulty-row">
        <span className="catalog-program-tag program-list-tag-key">{duration || 'Продолжительность не указана'}</span>
        {(difficulty > 0 || program.level) && (difficulty
          ? <span className={`catalog-program-difficulty level-${difficulty}`} title={program.level} aria-label={`Сложность: ${program.level}, ${difficulty} из 5`}>
            {Array.from({ length: 5 }, (_, index) => <i key={index} className={index < difficulty ? 'filled' : ''} />)}
          </span>
          : <span className="catalog-program-tag">{program.level}</span>)}
      </span>
    </span>
  </article>;
}
