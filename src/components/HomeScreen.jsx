const calendarDays = [
  { label: '30', out: true },
  { label: '1' },
  { label: '2' },
  { label: '3', selected: true },
  { label: '4' },
  { label: '5' },
  { label: '6' },
  { label: '7' },
  { label: '8', workout: true },
  { label: '9' },
  { label: '10' },
  { label: '11', workout: true },
  { label: '12' },
  { label: '13' },
  { label: '14', workout: true },
  { label: '15' },
  { label: '16' },
  { label: '17', workout: true },
  { label: '18' },
  { label: '19' },
  { label: '20' },
  { label: '21' },
  { label: '22', workout: true },
  { label: '23' },
  { label: '24' },
  { label: '25', workout: true },
  { label: '26' },
  { label: '27' },
  { label: '28', workout: true },
  { label: '29' },
  { label: '30' },
  { label: '31', workout: true },
  { label: '1', out: true },
  { label: '2', out: true },
  { label: '3', out: true },
];

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

function CalendarCard() {
  return (
    <section className="calendar-card">
      <div className="month-row">
        <button type="button" aria-label="Предыдущий месяц">
          ←
        </button>
        <div className="month">Октябрь 2024</div>
        <button type="button" aria-label="Следующий месяц">
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
        {calendarDays.map((day, index) => {
          const classNames = [
            'day',
            day.out ? 'out' : '',
            day.workout ? 'workout' : '',
            day.selected ? 'selected' : '',
          ]
            .filter(Boolean)
            .join(' ');

          return (
            <div className={classNames} key={`${day.label}-${index}`}>
              <span>{day.label}</span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function DailySummary() {
  return (
    <section className="date-card">
      <div className="date-row">
        <div className="date-title">3 октября 2024</div>
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
        <section className="summary-col workout">
          <div className="summary-label">Тренировка</div>
          <h3>
            Спина
            <br />и руки
          </h3>
          <p>6 упражнений</p>
          <button className="workout-btn" type="button">
            К тренировке
          </button>
        </section>

        <section className="summary-col food">
          <div className="summary-label">Питание</div>
          <h3>2600</h3>
          <p className="food-caption">ккал на день</p>
          <div className="food-grid">
            <div className="food-stat">
              <strong>140 г</strong>
              <span>Белки</span>
            </div>
            <div className="food-stat">
              <strong>80 г</strong>
              <span>Жиры</span>
            </div>
            <div className="food-stat">
              <strong>260 г</strong>
              <span>Углеводы</span>
            </div>
            <div className="food-stat">
              <strong>0%</strong>
              <span>Выполнено</span>
            </div>
          </div>
        </section>
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

export function HomeScreen({ menuOpen, onOpenMenu, onCloseMenu }) {
  return (
    <div className={`phone${menuOpen ? ' menu-open' : ''}`}>
      <Header menuOpen={menuOpen} onOpenMenu={onOpenMenu} />

      <main className="content">
        <PromoBanner />
        <CalendarCard />
        <DailySummary />
      </main>

      <BottomNav />
      <Drawer onCloseMenu={onCloseMenu} />
    </div>
  );
}
