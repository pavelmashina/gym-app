import { PROGRAM_DETAIL_FIELDS } from '../lib/programOptions.js';
/**
 * Shared structure for catalog templates and user-owned programs.
 * Only owned programs render the Share action; data and actions can differ.
 */
export function ProgramOverviewIntro({ program, coverUrl = null }) {
  const categories = Array.isArray(program.categories) ? program.categories : [];
  return <>
    <div className={`program-detail-cover${coverUrl ? '' : ' program-detail-cover-empty'}`}>
      {coverUrl ? <img src={coverUrl} alt="" /> : <span className="program-neutral-placeholder" aria-hidden="true" />}
    </div>
    <section className="program-detail-hero">
      <h1>{program.name}</h1>
      {categories.length > 0 && <div className="program-detail-tags">{categories.map(category => <span key={category}>{category}</span>)}</div>}
      {program.description && <p>{program.description}</p>}
    </section>
  </>;
}

export function ProgramOverviewStats({ items }) {
  return <section className="program-detail-stats">
    {items.map(({ label, value }) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
  </section>;
}

export function ProgramOverviewMeta({ program }) {
  return <section className="program-detail-meta-card" aria-label="Параметры программы">
    <div><span>Место</span><strong>{program.trainingPlace || 'Нет данных'}</strong></div>
    <div><span>Оборудование</span><strong>{program.equipment || 'Нет данных'}</strong></div>
    <div><span>Уровень</span><strong>{program.level || 'Нет данных'}</strong></div>
  </section>;
}

/** Selected extra program characteristics, displayed identically to catalog facts. */
export function ProgramOverviewFacts({ details }) {
  if (!details || typeof details !== 'object') return null;
  const fields = PROGRAM_DETAIL_FIELDS.filter(field => typeof details[field.key] === 'string' && details[field.key].trim());
  if (!fields.length) return null;
  const short = fields.filter(field => !['progression','warmup','cooldown'].includes(field.key));
  const tips = fields.filter(field => ['progression','warmup','cooldown'].includes(field.key));
  return <section className="catalog-program-facts" aria-label="Характеристики программы">
    {short.length > 0 && <div className="catalog-program-facts-grid">
      {short.map(field => <div key={field.key}><span>{field.label}</span><strong>{details[field.key]}</strong></div>)}
    </div>}
    {tips.length > 0 && <div className="catalog-program-facts-tips">
      {tips.map(field => <p key={field.key}><strong>{field.label}.</strong> {details[field.key]}</p>)}
    </div>}
  </section>;
}

/** Common tab switcher for catalog and personal program details. */
export function ProgramDetailTabs({ value, onChange, scope }) {
  const options = [{ id: 'description', label: 'Описание' }, { id: 'workouts', label: 'Тренировки' }];
  return <nav className="program-detail-tabs" role="tablist" aria-label="Разделы программы">
    {options.map(option => <button
      key={option.id}
      type="button"
      id={`${scope}-${option.id}-tab`}
      role="tab"
      aria-controls={`${scope}-${option.id}-panel`}
      aria-selected={value === option.id}
      className={value === option.id ? 'active' : ''}
      onClick={() => onChange(option.id)}
    >{option.label}</button>)}
  </nav>;
}
