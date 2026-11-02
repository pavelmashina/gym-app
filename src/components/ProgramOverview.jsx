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
      <span>Тренировочная программа</span>
      <h1>{program.name}</h1>
      {program.description && <p>{program.description}</p>}
      {categories.length > 0 && <div className="program-detail-tags">{categories.map(category => <span key={category}>{category}</span>)}</div>}
    </section>
  </>;
}

export function ProgramOverviewStats({ items }) {
  return <section className="program-detail-stats">
    {items.map(({ label, value }) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
  </section>;
}

export function ProgramOverviewMeta({ program }) {
  return <section className="program-detail-meta-card">
    <div><span>Место</span><strong>{program.trainingPlace || 'Нет данных'}</strong></div>
    <div><span>Оборудование</span><strong>{program.equipment || 'Нет данных'}</strong></div>
    <div><span>Уровень</span><strong>{program.level || 'Нет данных'}</strong></div>
  </section>;
}
