/** Canonical selectable program metadata; use in forms and display. */
export const CATEGORY_OPTIONS=['Силовой','Функционал','Растяжка','Кардио','Свой вес'];
export const LEVEL_OPTIONS=['Новичок','Средний','Уверенный','Продвинутый','Эксперт'];

const CATEGORY_LEGACY_NAMES = {
  'силовые':'Силовой', 'силовой тренинг':'Силовой', 'силовая':'Силовой', 'силовой':'Силовой',
  'функциональный тренинг':'Функционал', 'функциональные':'Функционал', 'функционал':'Функционал',
  'растяжка':'Растяжка', 'стретчинг':'Растяжка',
  'кардио':'Кардио', 'кардиотренировки':'Кардио',
  'с собственным весом':'Свой вес', 'собственный вес':'Свой вес', 'свой вес':'Свой вес',
};
const LEVEL_LEGACY_NAMES = {
  'начальный':'Новичок', 'начинающий':'Новичок', 'легкий':'Новичок', 'лёгкий':'Новичок', 'новичок':'Новичок',
  'средний':'Средний', 'базовый':'Средний', 'ниже среднего':'Средний',
  'уверенный':'Уверенный', 'выше среднего':'Уверенный',
  'продвинутый':'Продвинутый',
  'профессиональный':'Эксперт', 'эксперт':'Эксперт',
};

export function normalizeProgramCategories(categories) {
  if (!Array.isArray(categories)) return [];
  const canonical = categories.map(value => CATEGORY_LEGACY_NAMES[String(value ?? '').trim().toLocaleLowerCase('ru')] ?? '')
    .filter(value => CATEGORY_OPTIONS.includes(value));
  return [...new Set(canonical)].sort((a,b)=>CATEGORY_OPTIONS.indexOf(a)-CATEGORY_OPTIONS.indexOf(b));
}

export function normalizeProgramLevel(level) {
  const value = String(level ?? '').trim().toLocaleLowerCase('ru');
  return LEVEL_LEGACY_NAMES[value] || '';
}

export function programLevelIndex(level) {
  const index = LEVEL_OPTIONS.indexOf(normalizeProgramLevel(level));
  return index === -1 ? 0 : index + 1;
}
export const PLACE_OPTIONS=['Тренажёрный зал','Дом','Улица','Неважно'];
export const EQUIPMENT_OPTIONS=['Полный зал','Свободные веса','Тренажёры','Минимум оборудования','Без оборудования'];
export const PROGRAM_DETAIL_FIELDS=[
{key:'goal',label:'Цель',options:['Набор мышечной массы','Развитие силы','Снижение веса','Выносливость','Поддержание формы','Общая физическая подготовка']},
{key:'duration',label:'Продолжительность',options:['2 недели','4 недели','6 недель','8 недель','12 недель','Без ограничения']},
{key:'frequency',label:'Частота',options:['1 тренировка в неделю','2 тренировки в неделю','3 тренировки в неделю','4 тренировки в неделю','5 тренировок в неделю','6 тренировок в неделю']},
{key:'estimated_time',label:'Время тренировки',options:['До 30 минут','30–45 минут','45–60 минут','60–75 минут','75–90 минут','Более 90 минут']},
{key:'schedule',label:'Расписание',options:['Понедельник, среда, пятница','Вторник, четверг, суббота','Через день','Свободное расписание']},
{key:'rest',label:'Восстановление',options:['Не менее суток между тренировками','2 дня между тренировками','Индивидуально']},
{key:'progression',label:'Прогрессия',options:['Постепенно увеличивать рабочие веса','Добавлять повторения перед увеличением веса','Сохранять вес до уверенного выполнения']},
{key:'warmup',label:'Разминка',options:['5–10 минут лёгкой активности и разминочные подходы','10–15 минут лёгкого кардио и суставная разминка','Разминочные подходы в каждом базовом упражнении']},
{key:'cooldown',label:'После тренировки',options:['5 минут спокойной ходьбы и восстановления дыхания','Растяжка 5–10 минут','Без специальной заминки']}
];
export function normalizeProgramDetails(details) {
  const source=details&&typeof details==='object'&&!Array.isArray(details)?details:{};
  return Object.fromEntries(PROGRAM_DETAIL_FIELDS
    .filter(field=>typeof source[field.key]==='string'&&source[field.key].trim())
    .map(field=>[field.key,source[field.key].trim()]));
}
