import '../section-placeholder.css';

const SECTION_COPY = {
  statistics: {
    eyebrow: 'Аналитика',
    title: 'Статистика',
    text: 'Здесь появятся прогресс, история тренировок, лучшие подходы и сравнение результатов.',
  },
  nutrition: {
    eyebrow: 'Рацион',
    title: 'Питание',
    text: 'Здесь появятся КБЖУ, дневник питания и связанные с рационом инструменты.',
  },
  sportpit: {
    eyebrow: 'Справочник',
    title: 'СпортПит',
    text: 'Здесь появится справочный раздел по спортивному питанию.',
  },
};

function ProfileIcon() {
  return (
    <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
      <circle cx="16" cy="11" r="5" />
      <path d="M7 27c1.2-5.7 4.2-8.4 9-8.4s7.8 2.7 9 8.4" />
    </svg>
  );
}

function PlaceholderBottomNav({ activeSection }) {
  return (
    <nav className="bottom-nav placeholder-bottom-nav" aria-label="Основная навигация">
      <button className={`nav-item${activeSection === 'training' ? ' placeholder-active' : ''}`} type="button" data-screen="training">
        <svg viewBox="0 0 32 32" fill="none" strokeWidth="1.8">
          <path d="m8 20 12-12M7 16l9 9M5 19l8 8M19 5l8 8M16 7l9 9" />
          <path d="m4 21 7 7M21 4l7 7" />
        </svg>
        <span>Тренировки</span>
      </button>

      <button className={`nav-item${activeSection === 'statistics' ? ' placeholder-active' : ''}`} type="button" data-screen="statistics">
        <svg viewBox="0 0 32 32" fill="none" strokeWidth="1.7">
          <rect x="5" y="16" width="4" height="10" rx="1" />
          <rect x="14" y="7" width="4" height="19" rx="1" />
          <rect x="23" y="12" width="4" height="14" rx="1" />
        </svg>
        <span>Статистика</span>
      </button>

      <button className="nav-item home" type="button" data-screen="home">
        <span className="home-circle">
          <svg viewBox="0 0 32 32" fill="none">
            <path d="m5 15 11-10 11 10v12H19v-8h-6v8H5V15Z" />
          </svg>
        </span>
        <span>Главная</span>
      </button>

      <button className={`nav-item${activeSection === 'nutrition' ? ' placeholder-active' : ''}`} type="button" data-screen="nutrition">
        <svg viewBox="0 0 32 32" fill="none" strokeWidth="1.6">
          <path d="M9 5v9M6 5v6c0 2 1.2 3 3 3s3-1 3-3V5M9 14v13M21 5v22M21 5c4 3 4 9 0 12" />
        </svg>
        <span>Питание</span>
      </button>

      <button className={`nav-item${activeSection === 'sportpit' ? ' placeholder-active' : ''}`} type="button" data-screen="sportpit">
        <svg viewBox="0 0 32 32" fill="none" strokeWidth="1.5">
          <path d="M10 7h12l2 5-2 13H10L8 12l2-5Z" />
          <path d="M12 7V4h8v3M11 15h10M15 12v6M12 15h6" />
        </svg>
        <span>СпортПит</span>
      </button>
    </nav>
  );
}

export function SectionPlaceholder({ section }) {
  const copy = SECTION_COPY[section] ?? SECTION_COPY.statistics;

  return (
    <div className="phone section-placeholder-phone">
      <header className="placeholder-appbar">
        <div>
          <span>{copy.eyebrow}</span>
          <h1>{copy.title}</h1>
        </div>
        <button className="profile-btn" type="button" aria-label="Профиль">
          <ProfileIcon />
        </button>
      </header>

      <main className="placeholder-content">
        <section className="placeholder-card">
          <div className="placeholder-mark">—</div>
          <h2>Раздел пока пуст</h2>
          <p>{copy.text}</p>
        </section>
      </main>

      <PlaceholderBottomNav activeSection={section} />
    </div>
  );
}
