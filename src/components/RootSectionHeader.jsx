/** Shared root-screen heading: Training, Statistics, Nutrition and SportPit. */
export function RootSectionHeader({ title }) {
  if (['Тренировки','Статистика','Питание','СпортПит','Спортпит'].includes(title)) return null;
  return <header className="root-section-header"><h1>{title}</h1></header>;
}
