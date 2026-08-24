import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import '../home-dynamic.css';

const MONTHS = [
  'Январь',
  'Февраль',
  'Март',
  'Апрель',
  'Май',
  'Июнь',
  'Июль',
  'Август',
  'Сентябрь',
  'Октябрь',
  'Ноябрь',
  'Декабрь',
];

const MONTHS_GENITIVE = [
  'января',
  'февраля',
  'марта',
  'апреля',
  'мая',
  'июня',
  'июля',
  'августа',
  'сентября',
  'октября',
  'ноября',
  'декабря',
];

function toDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function startOfMonth(date) {
  return new Date(date.getFullYear(), date.getMonth(), 1);
}

function formatMonth(date) {
  return `${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

function formatFullDate(date) {
  return `${date.getDate()} ${MONTHS_GENITIVE[date.getMonth()]} ${date.getFullYear()}`;
}

function buildCalendarDays(monthDate, today, workoutDateSet) {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const mondayOffset = (firstDay.getDay() + 6) % 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
  const todayKey = toDateKey(today);

  return Array.from({ length: totalCells }, (_, index) => {
    const date = new Date(year, month, index - mondayOffset + 1);
    const key = toDateKey(date);

    return {
      key,
      label: String(date.getDate()),
      out: date.getMonth() !== month,
      workout: workoutDateSet.has(key),
      today: key === todayKey,
    };
  });
}

function useDeviceDate() {
  const [today, setToday] = useState(() => new Date());

  useEffect(() => {
    const syncWithDevice = () => setToday(new Date());
    const intervalId = window.setInterval(syncWithDevice, 60_000);

    window.addEventListener('focus', syncWithDevice);
    document.addEventListener('visibilitychange', syncWithDevice);

    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', syncWithDevice);
      document.removeEventListener('visibilitychange', syncWithDevice);
    };
  }, []);

  return today;
}

function Header({ menuOpen, onOpenMenu }) {
  return (
    <header className="appbar">
      <button
        className="icon-btn"
        type="button"
        aria-label="Открыть меню"
        aria-expanded={menuOpen}
        onClick={onOpenMenu}
      >
        <span className="burger" aria-hidden="true">
          <span />
          <span />
          <span />
        </span>
      </button>

      <button className="profile-btn" type="button" aria-label="Профиль">
        <svg
          className="profile-icon"
          viewBox="0 0 32 32"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <circle cx="16" cy="11" r="5" />
          <path d="M7 27c1.2-5.7 4.2-8.4 9-8.4s7.8 2.7 9 8.4" />
        </svg>
      </button>
    </header>
  );
}

function PromoBanner() {
  return (
    <section className="banner-wrap">
      <img
        className="banner"
        src={`${import.meta.env.BASE_URL}assets/fitness-club-banner.webp`}
        alt="Fitness Club"
      />
      <button className="carousel-arrow left" type="button" aria-label="Предыдущий баннер">
        ‹
      </button>
      <button className="carousel-arrow right" type="button" aria-label="Следующий баннер">
        ›
      </button>
      <div className="dots" aria-hidden="true">
        <span className="dot active" />
        <span className="dot" />
      </div>
    </section>
  );
}

function CalendarCard({ today, workoutDates }) {
  const [displayMonth, setDisplayMonth] = useState(() => startOfMonth(today));

  useEffect(() => {
    setDisplayMonth(startOfMonth(today));
  }, [today.getFullYear(), today.getMonth()]);

  const workoutDateSet = useMemo(() => new Set(workoutDates), [workoutDates]);
  const calendarDays = useMemo(
    () => buildCalendarDays(displayMonth, today, workoutDateSet),
    [displayMonth, today, workoutDateSet],
  );

  function changeMonth(delta) {
    setDisplayMonth(
      (current) => new Date(current.getFullYear(), current.getMonth() + delta, 1),
    );
  }

  return (
    <section className="calendar-card">
      <div className="month-row">
        <button type="button" aria-label="Предыдущий месяц" onClick={() => changeMonth(-1)}>
          ←
        </button>
        <div className="month">{formatMonth(displayMonth)}</div>
        <button type="button" aria-label="Следующий месяц" onClick={() => changeMonth(1)}>
          →
        </button>
      </div>

      <div className="weekdays">
        <div>Пн</div>
        <div>Вт</div>
        <div>Ср</div>
        <div>Чт</div>
        <div>Пт</div>
        <div>Сб</div>
        <div>Вс</div>
      </div>

      <div className="days">
        {calendarDays.map((day) => {
          const classNames = [
            'day',
            day.out ? 'out' : '',
            day.workout ? 'workout' : '',
            day.today ? 'today' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div
              className={classNames}
              key={day.key}
              aria-current={day.today ? 'date' : undefined}
            >
              <span>{day.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function WorkoutSummary({ workout }) {
  if (!workout) {
    return (
      <section className="summary-col workout home-empty-card">
        <div className="summary-label">Тренировка</div>
        <div className="home-empty-copy">
          <h3>Нет тренировки</h3>
          <p>На сегодня ничего не запланировано</p>
        </div>
      </section>
    );
  }

  return (
    <section className="summary-col workout">
      <div className="summary-label">Тренировка</div>
      <h3>{workout.title}</h3>
      <p>{workout.exerciseCount} упражнений</p>
      <button className="workout-btn" type="button">
        К тренировке
      </button>
    </section>
  );
}

function NutritionSummary({ nutritionPlan }) {
  if (!nutritionPlan) {
    return (
      <section className="summary-col food home-empty-card">
        <div className="summary-label">Питание</div>
        <div className="home-empty-copy">
          <h3>План не выбран</h3>
          <p>Питание пока не настроено</p>
        </div>
      </section>
    );
  }

  return (
    <section className="summary-col food">
      <div className="summary-label">Питание</div>
      <h3>{nutritionPlan.calories}</h3>
      <p className="food-caption">ккал на день</p>
      <div className="food-grid">
        <div className="food-stat">
          <strong>{nutritionPlan.protein} г</strong>
          <span>Белки</span>
        </div>
        <div className="food-stat">
          <strong>{nutritionPlan.fat} г</strong>
          <span>Жиры</span>
        </div>
        <div className="food-stat">
          <strong>{nutritionPlan.carbs} г</strong>
          <span>Углеводы</span>
        </div>
        <div className="food-stat">
          <strong>{nutritionPlan.completion ?? 0}%</strong>
          <span>Выполнено</span>
        </div>
      </div>
    </section>
  );
}

function DailySummary({ today, workout, nutritionPlan }) {
  return (
    <section className="date-card">
      <div className="date-row">
        <div className="date-title">{formatFullDate(today)}</div>
        <svg
          className="edit-icon"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          aria-hidden="true"
        >
          <path d="M4 20h4l11-11-4-4L4 16v4Z" />
          <path d="m13.7 6.3 4 4" />
        </svg>
      </div>

      <div className="summary">
        <WorkoutSummary workout={workout} />
        <NutritionSummary nutritionPlan={nutritionPlan} />
      </div>
    </section>
  );
}

function BottomNav() {
  return (
    <nav className="bottom-nav" aria-label="Основная навигация">
      <button className="nav-item" type="button">
        <svg viewBox="0 0 32 32" fill="none" strokeWidth="1.8">
          <path d="m8 20 12-12M7 16l9 9M5 19l8 8M19 5l8 8M16 7l9 9" />
          <path d="m4 21 7 7M21 4l7 7" />
        </svg>
        <span>Тренировки</span>
      </button>

      <button className="nav-item" type="button">
        <svg viewBox="0 0 32 32" fill="none" strokeWidth="1.7">
          <rect x="5" y="16" width="4" height="10" rx="1" />
          <rect x="14" y="7" width="4" height="19" rx="1" />
          <rect x="23" y="12" width="4" height="14" rx="1" />
        </svg>
        <span>Статистика</span>
      </button>

      <button className="nav-item home" type="button">
        <span className="home-circle">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="m5 15 11-10 11 10v12H19v-8h-6v8H5V15Z" />
          </svg>
        </span>
        <span>Главная</span>
      </button>

      <button className="nav-item" type="button">
        <svg viewBox="0 0 32 32" fill="none" strokeWidth="1.6">
          <path d="M9 5v9M6 5v6c0 2 1.2 3 3 3s3-1 3-3V5M9 14v13M21 5v22M21 5c4 3 4 9 0 12" />
        </svg>
        <span>Питание</span>
      </button>

      <button className="nav-item" type="button">
        <svg viewBox="0 0 32 32" fill="none" strokeWidth="1.5">
          <path d="M10 7h12l2 5-2 13H10L8 12l2-5Z" />
          <path d="M12 7V4h8v3M11 15h10M15 12v6M12 15h6" />
        </svg>
        <span>СпортПит</span>
      </button>
    </nav>
  );
}

function Drawer({ onCloseMenu }) {
  return (
    <>
      <button className="scrim" type="button" aria-label="Закрыть меню" onClick={onCloseMenu} />

      <aside className="drawer" aria-label="Боковое меню">
        <div className="drawer-head">
          <div className="drawer-title">Меню</div>
          <button className="close-button" type="button" aria-label="Закрыть меню" onClick={onCloseMenu}>
            ×
          </button>
        </div>

        <div className="drawer-profile">
          <div className="avatar">Д</div>
          <div>
            <strong>Дмитрий</strong>
            <span>Мой профиль</span>
          </div>
        </div>

        <nav>
          <button className="drawer-link" type="button">Подписка</button>
          <button className="drawer-link" type="button">Настройки</button>
          <button className="drawer-link" type="button">Политика конфиденциальности</button>
          <button className="drawer-link" type="button">Поддержка</button>
          <button className="drawer-link" type="button">Частые вопросы</button>
          <button className="drawer-link" type="button">Рассказать о приложении</button>
          <button className="drawer-link" type="button">Оценить приложение</button>
        </nav>

        <div className="version">Prototype v0.3.3 · React migration</div>
      </aside>
    </>
  );
}

export function HomeScreen({
  menuOpen,
  onOpenMenu,
  onCloseMenu,
  workoutDates = [],
  todaysWorkout = null,
  nutritionPlan = null,
}) {
  const today = useDeviceDate();
  const [scheduledWorkoutDates, setScheduledWorkoutDates] = useState([]);

  useEffect(() => {
    let active = true;

    async function loadScheduledWorkoutDates() {
      const { data, error } = await supabase
        .from('scheduled_workouts')
        .select('scheduled_date, status')
        .neq('status', 'cancelled')
        .order('scheduled_date', { ascending: true });

      if (!active) return;

      if (error) {
        console.error('Unable to load home calendar workout dates:', error);
        setScheduledWorkoutDates([]);
        return;
      }

      setScheduledWorkoutDates([
        ...new Set((data ?? []).map((row) => row.scheduled_date).filter(Boolean)),
      ]);
    }

    loadScheduledWorkoutDates();

    function refreshOnFocus() {
      loadScheduledWorkoutDates();
    }

    window.addEventListener('focus', refreshOnFocus);
    document.addEventListener('visibilitychange', refreshOnFocus);

    return () => {
      active = false;
      window.removeEventListener('focus', refreshOnFocus);
      document.removeEventListener('visibilitychange', refreshOnFocus);
    };
  }, []);

  const effectiveWorkoutDates = useMemo(
    () => [...new Set([...workoutDates, ...scheduledWorkoutDates])],
    [workoutDates, scheduledWorkoutDates],
  );

  return (
    <div className={`phone${menuOpen ? ' menu-open' : ''}`}>
      <Header menuOpen={menuOpen} onOpenMenu={onOpenMenu} />

      <main className="content">
        <PromoBanner />
        <CalendarCard today={today} workoutDates={effectiveWorkoutDates} />
        <DailySummary
          today={today}
          workout={todaysWorkout}
          nutritionPlan={nutritionPlan}
        />
      </main>

      <BottomNav />
      <Drawer onCloseMenu={onCloseMenu} />
    </div>
  );
}
