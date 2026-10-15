const SECTIONS = [
  ['setup_instructions', 'Настройка и исходное положение'],
  ['execution_steps', 'Как выполнять'],
  ['technique_cues', 'На что обратить внимание'],
  ['common_mistakes', 'Частые ошибки'],
  ['safety_notes', 'Ограничения и безопасность'],
];

export default function ExerciseTechnique({ exercise, fallback = '' }) {
  const description = exercise.short_description || exercise.description || exercise.technique || fallback || exercise.notes;
  return <div className="exercise-technique">
    {exercise.family_name_ru && <p>Семейство: {exercise.family_name_ru}</p>}
    <section><h4>Описание</h4><p>{description || 'Описание пока не добавлено.'}</p></section>
    {SECTIONS.map(([key, title]) => Array.isArray(exercise[key]) && exercise[key].length > 0 &&
      <section key={key}><h4>{title}</h4>{key === 'execution_steps'
        ? <ol>{exercise[key].map((text, index) => <li key={index}>{text}</li>)}</ol>
        : <ul>{exercise[key].map((text, index) => <li key={index}>{text}</li>)}</ul>}</section>)}
    {exercise.measurement_note && <section><h4>Как учитывать результат</h4><p>{exercise.measurement_note}</p></section>}
  </div>;
}
