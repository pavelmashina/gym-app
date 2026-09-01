import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import '../home-dynamic.css';

const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
const MONTHS_GENITIVE = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
const HOME_SLIDES = [
  { src: 'assets/home-slider-ad-1.webp', alt: 'Рекламный баннер для фитнес-клуба или спортивного бренда' },
  { src: 'assets/home-slider-ad-2.webp', alt: 'Рекламный баннер спортивных турниров, секций и мероприятий' },
  { src: 'assets/home-slider-ad-3.webp', alt: 'Рекламный баннер спортзалов, секций и спортивных брендов' },
];

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromKey(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year, month - 1, day, 12, 0, 0);
}

function startOfMonth(date) { return new Date(date.getFullYear(), date.getMonth(), 1); }
function formatMonth(date) { return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`; }
function formatFullDate(date) { return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]} ${date.getFullYear()}`; }

function buildCalendarDays(monthDate, today, selectedDateKey, workoutDateSet) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
  const todayKey = toDateKey(today);

  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(year, month, index - mondayOffset + 1, 12, 0, 0);
    const key = toDateKey(date);
    return {
      key,
      date,
      label: String(date.getDate()),
      out: date.getMonth() !== month,
      workout: workoutDateSet.has(key),
      today: key === todayKey,
      selected: key === selectedDateKey,
    };
  });
}

function useDeviceDate() {
  const [today, setToday] = useState(() => new Date());
  useEffect(() => {
    const sync = () => setToday(new Date());
    const timer = window.setInterval(sync, 60_000);
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', sync);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', sync);
    };
  }, []);
  return today;
}

function Header({ menuOpen, onOpenMenu }) {
  return <header className="appbar">
    <button className="icon-btn" type="button" aria-label="Открыть меню" aria-expanded={menuOpen} onClick={onOpenMenu}><span className="burger" aria-hidden="true"><span /><span /><span /></span></button>
    <button className="profile-btn" type="button" aria-label="Профиль"><svg className="profile-icon" viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="16" cy="11" r="5" /><path d="M7 27c1.2-5.7 4.2-8.4 9-8.4s7.8 2.7 9 8.4" /></svg></button>
  </header>;
}

function PromoBanner() {
  const [activeSlide, setActiveSlide] = useState(0);
  useEffect(() => {
    const timer = window.setInterval(() => setActiveSlide((current) => (current + 1) % HOME_SLIDES.length), 6000);
    return () => window.clearInterval(timer);
  }, []);
  const changeSlide = (delta) => setActiveSlide((current) => (current + delta + HOME_SLIDES.length) % HOME_SLIDES.length);

  return <section className="banner-wrap" aria-roledescription="carousel" aria-label="Рекламные баннеры">
    <div className="banner-slides">{HOME_SLIDES.map((slide, index) => <img className={`banner banner-slide${index === activeSlide ? ' active' : ''}`} src={`${import.meta.env.BASE_URL}${slide.src}?v=3`} alt={slide.alt} loading="eager" decoding="async" aria-hidden={index === activeSlide ? undefined : 'true'} key={slide.src} />)}</div>
    <button className="carousel-arrow left" type="button" aria-label="Предыдущий баннер" onClick={() => changeSlide(-1)}>‹</button>
    <button className="carousel-arrow right" type="button" aria-label="Следующий баннер" onClick={() => changeSlide(1)}>›</button>
    <div className="dots" aria-label="Выбор баннера">{HOME_SLIDES.map((slide, index) => <button className={`dot${index === activeSlide ? ' active' : ''}`} type="button" key={slide.src} aria-label={`Баннер ${index + 1}`} aria-current={index === activeSlide ? 'true' : undefined} onClick={() => setActiveSlide(index)} />)}</div>
  </section>;
}

function CalendarCard({ today, selectedDateKey, workoutDates, onSelectDate }) {
  const selectedDate = useMemo(() => dateFromKey(selectedDateKey), [selectedDateKey]);
  const [displayMonth, setDisplayMonth] = useState(() => startOfMonth(selectedDate));

  useEffect(() => {
    if (selectedDate.getFullYear() !== displayMonth.getFullYear() || selectedDate.getMonth() !== displayMonth.getMonth()) setDisplayMonth(startOfMonth(selectedDate));
  }, [selectedDateKey]);

  const workoutDateSet = useMemo(() => new Set(workoutDates), [workoutDates]);
  const days = useMemo(() => buildCalendarDays(displayMonth, today, selectedDateKey, workoutDateSet), [displayMonth, today, selectedDateKey, workoutDateSet]);
  const changeMonth = (delta) => setDisplayMonth((current) => new Date(current.getFullYear(), current.getMonth() + delta, 1));

  return <section className="calendar-card">
    <div className="month-row"><button type="button" aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)}>←</button><div className="month">{formatMonth(displayMonth)}</div><button type="button" aria-label="Следующий месяц" onClick={() => changeMonth(1)}>→</button></div>
    <div className="weekdays"><div>Пн</div><div>Вт</div><div>Ср</div><div>Чт</div><div>Пт</div><div>Сб</div><div>Вс</div></div>
    <div className="days">{days.map((day) => {
      const className = ['day', day.out ? 'out' : '', day.workout ? 'workout' : '', day.today ? 'today' : '', day.selected ? 'selected' : ''].filter(Boolean).join(' ');
      return <button className={className} type="button" key={day.key} aria-label={`${formatFullDate(day.date)}${day.workout ? ', запланирована тренировка' : ''}`} aria-pressed={day.selected} aria-current={day.today ? 'date' : undefined} onClick={() => { if (day.out) setDisplayMonth(startOfMonth(day.date)); onSelectDate?.(day.key); }}><span>{day.label}</span></button>;
    })}</div>
  </section>;
}

function WorkoutSummary({ workout, status, isToday, onOpenWorkout, onRetry }) {
  if (status === 'loading') return <section className="summary-col workout home-empty-card" aria-live="polite"><div className="summary-label">Тренировка</div><div className="home-empty-copy"><h3>Загружаем…</h3><p>Проверяем расписание на выбранную дату</p></div></section>;
  if (status === 'error' && !workout) return <section className="summary-col workout home-error-card" role="alert"><div className="summary-label">Тренировка</div><div className="home-error-copy"><h3>Не удалось загрузить тренировку</h3><p>Это не означает, что на выбранную дату ничего не запланировано.</p><button className="home-error-retry" type="button" onClick={onRetry}>Повторить</button></div></section>;
  if (!workout) return <section className="summary-col workout home-empty-card"><div className="summary-label">Тренировка</div><div className="home-empty-copy"><h3>Нет тренировки</h3><p>{isToday ? 'На сегодня ничего не запланировано' : 'На эту дату ничего не запланировано'}</p></div></section>;

  const buttonLabel = workout.active ? 'Продолжить тренировку' : (workout.completed ? 'Посмотреть результат' : 'К тренировке');
  return <section className="summary-col workout"><div className="summary-label">{workout.active ? 'Активная тренировка' : 'Тренировка'}</div><h3>{workout.title}</h3><p>{workout.exerciseCount} упражнений</p><button className="workout-btn" type="button" onClick={() => onOpenWorkout?.(workout.id)}>{buttonLabel}</button></section>;
}

function NutritionSummary({ nutritionPlan }) {
  if (!nutritionPlan) return <section className="summary-col food home-empty-card"><div className="summary-label">Питание</div><div className="home-empty-copy"><h3>План не выбран</h3><p>Питание пока не настроено</p></div></section>;
  return <section className="summary-col food"><div className="summary-label">Питание</div><h3>{nutritionPlan.calories}</h3><p className="food-caption">ккал на день</p><div className="food-grid"><div className="food-stat"><strong>{nutritionPlan.protein} г</strong><span>Белки</span></div><div className="food-stat"><strong>{nutritionPlan.fat} г</strong><span>Жиры</span></div><div className="food-stat"><strong>{nutritionPlan.carbs} г</strong><span>Углеводы</span></div><div className="food-stat"><strong>{nutritionPlan.completion ?? 0}%</strong><span>Выполнено</span></div></div></section>;
}

function DailySummary({ date, isToday, workout, workoutStatus, nutritionPlan, onOpenWorkout, onRetry }) {
  return <section className="date-card"><div className="date-row"><div className="date-title">{formatFullDate(date)}</div><svg className="edit-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.7 6.3 4 4" /></svg></div><div className="summary"><WorkoutSummary workout={workout} status={workoutStatus} isToday={isToday} onOpenWorkout={onOpenWorkout} onRetry={onRetry} /><NutritionSummary nutritionPlan={nutritionPlan} /></div></section>;
}

function BottomNav() {
  return <nav className="bottom-nav" aria-label="Основная навигация">
    <button className="nav-item" data-screen="training" type="button"><svg viewBox="0 0 32 32" fill="none" strokeWidth="1.8"><path d="m8 20 12-12M7 16l9 9M5 19l8 8M19 5l8 8M16 7l9 9" /><path d="m4 21 7 7M21 4l7 7" /></svg><span>Тренировки</span></button>
    <button className="nav-item" data-screen="statistics" type="button"><svg viewBox="0 0 32 32" fill="none" strokeWidth="1.7"><rect x="5" y="16" width="4" height="10" rx="1" /><rect x="14" y="7" width="4" height="19" rx="1" /><rect x="23" y="12" width="4" height="14" rx="1" /></svg><span>Статистика</span></button>
    <button className="nav-item home" data-screen="home" type="button"><span className="home-circle"><svg viewBox="0 0 32 32" fill="none"><path d="m5 15 11-10 11 10v12H19v-8h-6v8H5V15Z" /></svg></span><span>Главная</span></button>
    <button className="nav-item" data-screen="nutrition" type="button"><svg viewBox="0 0 32 32" fill="none" strokeWidth="1.6"><path d="M9 5v9M6 5v6c0 2 1.2 3 3 3s3-1 3-3V5M9 14v13M21 5v22M21 5c4 3 4 9 0 12" /></svg><span>Питание</span></button>
    <button className="nav-item" data-screen="sportpit" type="button"><svg viewBox="0 0 32 32" fill="none" strokeWidth="1.5"><path d="M10 7h12l2 5-2 13H10L8 12l2-5Z" /><path d="M12 7V4h8v3M11 15h10M15 12v6M12 15h6" /></svg><span>СпортПит</span></button>
  </nav>;
}

function Drawer({ onCloseMenu }) {
  return <><button className="scrim" type="button" aria-label="Закрыть меню" onClick={onCloseMenu} /><aside className="drawer" aria-label="Боковое меню"><div className="drawer-head"><div className="drawer-title">Меню</div><button className="close-button" type="button" aria-label="Закрыть меню" onClick={onCloseMenu}>×</button></div><div className="drawer-profile"><div className="avatar">Д</div><div><strong>Дмитрий</strong><span>Мой профиль</span></div></div><nav><button className="drawer-link" type="button">Подписка</button><button className="drawer-link" type="button">Настройки</button><button className="drawer-link" type="button">Политика конфиденциальности</button><button className="drawer-link" type="button">Поддержка</button><button className="drawer-link" type="button">Частые вопросы</button><button className="drawer-link" type="button">Рассказать о приложении</button><button className="drawer-link" type="button">Оценить приложение</button></nav><div className="version">Prototype v0.3.3 · React migration</div></aside></>;
}

async function loadWorkoutCard(dateKey) {
  const { data: activeRows, error: activeError } = await supabase.from('workout_sessions').select('id, scheduled_workout_id').eq('status', 'active').limit(1);
  if (activeError) throw activeError;

  let workoutRow = null;
  let active = false;

  if (activeRows?.[0]?.scheduled_workout_id) {
    const response = await supabase
      .from('scheduled_workouts')
      .select('id, workout_name, scheduled_date, status, user_programs!inner(status)')
      .eq('id', activeRows[0].scheduled_workout_id)
      .eq('user_programs.status', 'active')
      .single();
    if (response.error && response.error.code !== 'PGRST116') throw response.error;
    if (response.data?.scheduled_date === dateKey) { workoutRow = response.data; active = true; }
  }

  if (!workoutRow) {
    const response = await supabase
      .from('scheduled_workouts')
      .select('id, workout_name, scheduled_date, status, sequence_number, user_programs!inner(status)')
      .eq('scheduled_date', dateKey)
      .eq('user_programs.status', 'active')
      .neq('status', 'cancelled')
      .order('sequence_number', { ascending: true })
      .limit(1);
    if (response.error) throw response.error;
    workoutRow = response.data?.[0] ?? null;
  }

  if (!workoutRow) return null;
  const { count, error } = await supabase.from('scheduled_workout_exercises').select('id', { count: 'exact', head: true }).eq('scheduled_workout_id', workoutRow.id);
  if (error) throw error;
  return { id: workoutRow.id, title: workoutRow.workout_name, exerciseCount: count ?? 0, active, completed: workoutRow.status === 'completed' };
}

export function HomeScreen({ menuOpen, onOpenMenu, onCloseMenu, onOpenWorkout, workoutDates = [], todaysWorkout = null, nutritionPlan = null }) {
  const today = useDeviceDate();
  const todayKey = toDateKey(today);
  const [selectedDateKey, setSelectedDateKey] = useState(todayKey);
  const [selectionPinned, setSelectionPinned] = useState(false);
  const [scheduledWorkoutDates, setScheduledWorkoutDates] = useState([]);
  const [calendarStatus, setCalendarStatus] = useState('loading');
  const [loadedWorkout, setLoadedWorkout] = useState(null);
  const [loadedWorkoutDateKey, setLoadedWorkoutDateKey] = useState(null);
  const [workoutStatus, setWorkoutStatus] = useState('loading');
  const [workoutStatusDateKey, setWorkoutStatusDateKey] = useState(todayKey);
  const [reloadKey, setReloadKey] = useState(0);
  const workoutCacheRef = useRef(new Map());

  useEffect(() => { if (!selectionPinned) setSelectedDateKey(todayKey); }, [todayKey, selectionPinned]);
  useEffect(() => {
    const refresh = () => { workoutCacheRef.current.clear(); setReloadKey((value) => value + 1); };
    const visible = () => { if (document.visibilityState === 'visible') refresh(); };
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, []);

  useEffect(() => {
    let alive = true;
    supabase
      .from('scheduled_workouts')
      .select('scheduled_date, status, user_programs!inner(status)')
      .eq('user_programs.status', 'active')
      .neq('status', 'cancelled')
      .order('scheduled_date', { ascending: true })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error) { console.error('Unable to load home calendar:', error); setCalendarStatus('error'); return; }
        setScheduledWorkoutDates([...new Set((data ?? []).map((row) => row.scheduled_date).filter(Boolean))]);
        setCalendarStatus('success');
      });
    return () => { alive = false; };
  }, [reloadKey]);

  useEffect(() => {
    let alive = true;
    const cached = workoutCacheRef.current.get(selectedDateKey);
    setWorkoutStatusDateKey(selectedDateKey);
    if (workoutCacheRef.current.has(selectedDateKey)) {
      setLoadedWorkout(cached ?? null); setLoadedWorkoutDateKey(selectedDateKey); setWorkoutStatus('success');
    } else {
      setLoadedWorkout(null); setLoadedWorkoutDateKey(null); setWorkoutStatus('loading');
    }

    loadWorkoutCard(selectedDateKey).then((card) => {
      if (!alive) return;
      workoutCacheRef.current.set(selectedDateKey, card);
      setLoadedWorkout(card); setLoadedWorkoutDateKey(selectedDateKey); setWorkoutStatus('success');
    }).catch((error) => {
      console.error(`Unable to load home workout for ${selectedDateKey}:`, error);
      if (!alive) return;
      if (workoutCacheRef.current.has(selectedDateKey)) { setLoadedWorkout(workoutCacheRef.current.get(selectedDateKey) ?? null); setLoadedWorkoutDateKey(selectedDateKey); }
      else { setLoadedWorkout(null); setLoadedWorkoutDateKey(null); }
      setWorkoutStatus('error');
    });
    return () => { alive = false; };
  }, [selectedDateKey, reloadKey]);

  const selectedDate = useMemo(() => dateFromKey(selectedDateKey), [selectedDateKey]);
  const isTodaySelected = selectedDateKey === todayKey;
  const effectiveWorkoutDates = useMemo(() => [...new Set([...workoutDates, ...scheduledWorkoutDates])], [workoutDates, scheduledWorkoutDates]);
  const loadedForSelectedDate = loadedWorkoutDateKey === selectedDateKey ? loadedWorkout : null;
  const propTodayWorkout = isTodaySelected ? todaysWorkout : null;
  const effectiveWorkout = propTodayWorkout ?? loadedForSelectedDate;
  const effectiveWorkoutStatus = propTodayWorkout ? 'success' : (workoutStatusDateKey === selectedDateKey ? workoutStatus : 'loading');
  const hasRefreshError = calendarStatus === 'error' || (effectiveWorkoutStatus === 'error' && Boolean(effectiveWorkout));

  function selectDate(value) { setSelectedDateKey(value); setSelectionPinned(value !== todayKey); }
  function retryHomeData() { workoutCacheRef.current.delete(selectedDateKey); setReloadKey((value) => value + 1); }

  return <div className={`phone${menuOpen ? ' menu-open' : ''}`}>
    <Header menuOpen={menuOpen} onOpenMenu={onOpenMenu} />
    <main className="content">
      <PromoBanner />
      {hasRefreshError && <section className="home-data-alert" role="alert"><div><strong>Не удалось обновить данные</strong><span>Проверьте соединение. Ниже показана последняя успешная версия данных для выбранной даты.</span></div><button type="button" onClick={retryHomeData}>Повторить</button></section>}
      <CalendarCard today={today} selectedDateKey={selectedDateKey} workoutDates={effectiveWorkoutDates} onSelectDate={selectDate} />
      <DailySummary date={selectedDate} isToday={isTodaySelected} workout={effectiveWorkout} workoutStatus={effectiveWorkoutStatus} nutritionPlan={nutritionPlan} onOpenWorkout={onOpenWorkout} onRetry={retryHomeData} />
    </main>
    <BottomNav />
    <Drawer onCloseMenu={onCloseMenu} />
  </div>;
}
