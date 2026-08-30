import { useEffect, useMemo, useState } from 'react';
import { AuthScreen } from './components/AuthScreen.jsx';
import { CreateProgramScreen } from './components/CreateProgramScreen.jsx';
import { ExercisesScreen } from './components/ExercisesScreen.jsx';
import { HomeScreen } from './components/HomeScreen.jsx';
import { SectionPlaceholder } from './components/SectionPlaceholder.jsx';
import { WorkoutSessionScreen } from './components/WorkoutSessionScreen.jsx';
import { isSupabaseConfigured, supabase } from './lib/supabase.js';

const BOTTOM_NAV_SCREENS = ['training', 'statistics', 'home', 'nutrition', 'sportpit'];

function resolveBottomNavScreen(navItem) {
  const explicitScreen = navItem?.dataset?.screen;
  if (BOTTOM_NAV_SCREENS.includes(explicitScreen)) return explicitScreen;

  const nav = navItem?.closest('.bottom-nav');
  if (!nav) return null;
  const items = Array.from(nav.querySelectorAll('.nav-item'));
  const screen = BOTTOM_NAV_SCREENS[items.indexOf(navItem)] ?? null;
  if (screen) navItem.dataset.screen = screen;
  return screen;
}

function isPasswordRecoveryUrl() {
  if (typeof window === 'undefined') return false;
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const searchParams = new URLSearchParams(window.location.search);
  return hashParams.get('type') === 'recovery' || searchParams.get('type') === 'recovery';
}

function LoadingScreen() {
  return (
    <main className="auth-loading" aria-live="polite">
      <div className="auth-spinner" aria-hidden="true" />
      <span>Проверяем сессию…</span>
    </main>
  );
}

function AccountPopover({ user, profile, loading, onClose, onSignOut }) {
  const displayName = profile?.display_name?.trim() || user?.email?.split('@')[0] || 'Пользователь';
  const initial = displayName.slice(0, 1).toUpperCase();
  return (
    <>
      <button className="account-popover-scrim" type="button" aria-label="Закрыть профиль" onClick={onClose} />
      <section className="account-popover" aria-label="Профиль пользователя">
        <div className="account-popover-head">
          <div className="account-popover-avatar" aria-hidden="true">{initial}</div>
          <div className="account-popover-copy"><strong>{displayName}</strong><span>{user?.email}</span></div>
        </div>
        <button className="account-logout" type="button" disabled={loading} onClick={onSignOut}>{loading ? 'Выходим…' : 'Выйти из аккаунта'}</button>
      </section>
    </>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [activeScreen, setActiveScreen] = useState('home');
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [signOutLoading, setSignOutLoading] = useState(false);
  const [passwordRecoveryActive, setPasswordRecoveryActive] = useState(isPasswordRecoveryUrl);
  const [editingProgramId, setEditingProgramId] = useState(null);
  const [launchingProgramId, setLaunchingProgramId] = useState(null);
  const [workoutScheduledId, setWorkoutScheduledId] = useState(null);
  const [trainingInitialTab, setTrainingInitialTab] = useState('recommendations');
  const [trainingRefreshKey, setTrainingRefreshKey] = useState(0);

  const user = session?.user ?? null;
  const userId = user?.id ?? null;

  useEffect(() => {
    if (!isSupabaseConfigured) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      if (error) console.error('Unable to restore Supabase session:', error);
      setSession(data.session ?? null);
      setAuthReady(true);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active) return;
      if (event === 'PASSWORD_RECOVERY') setPasswordRecoveryActive(true);
      if (event === 'SIGNED_OUT') setPasswordRecoveryActive(false);
      setSession(nextSession ?? null);
      setAuthReady(true);
      if (!nextSession) {
        setProfile(null);
        setMenuOpen(false);
        setAccountOpen(false);
        setEditingProgramId(null);
        setLaunchingProgramId(null);
        setWorkoutScheduledId(null);
        setTrainingInitialTab('recommendations');
        setActiveScreen('home');
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!userId) { setProfile(null); return undefined; }
    let active = true;
    async function loadProfile() {
      const { data, error } = await supabase.from('profiles').select('id, display_name, created_at').eq('id', userId).single();
      if (!active) return;
      if (error) { console.error('Unable to load profile:', error); setProfile(null); return; }
      setProfile(data);
    }
    loadProfile();
    return () => { active = false; };
  }, [userId]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      setAccountOpen(false);
      setActiveScreen((current) => {
        if (current === 'create-program') {
          setEditingProgramId(null);
          setLaunchingProgramId(null);
          return 'training';
        }
        if (current === 'workout-session') {
          setWorkoutScheduledId(null);
          return 'home';
        }
        return current;
      });
    }

    function handleDocumentClick(event) {
      if (userId && event.target.closest('.profile-btn')) {
        setAccountOpen((current) => !current);
        return;
      }
      const navItem = event.target.closest('.bottom-nav .nav-item');
      if (!navItem) return;
      const nextScreen = resolveBottomNavScreen(navItem);
      if (!nextScreen) return;
      setMenuOpen(false);
      setAccountOpen(false);
      setEditingProgramId(null);
      setLaunchingProgramId(null);
      setWorkoutScheduledId(null);
      setActiveScreen(nextScreen);
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleDocumentClick);
    return () => { document.removeEventListener('keydown', handleKeyDown); document.removeEventListener('click', handleDocumentClick); };
  }, [userId]);

  const authConfigError = useMemo(() => {
    if (isSupabaseConfigured) return null;
    return 'Supabase не настроен: отсутствуют VITE_SUPABASE_URL или VITE_SUPABASE_PUBLISHABLE_KEY.';
  }, []);

  async function handleSignOut() {
    setSignOutLoading(true);
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) { console.error('Unable to sign out:', error); setSignOutLoading(false); return; }
    setSignOutLoading(false);
    setAccountOpen(false);
    setEditingProgramId(null);
    setLaunchingProgramId(null);
    setWorkoutScheduledId(null);
    setActiveScreen('home');
  }

  function openCreateProgram() {
    setMenuOpen(false); setAccountOpen(false); setEditingProgramId(null); setLaunchingProgramId(null); setWorkoutScheduledId(null); setActiveScreen('create-program');
  }
  function openProgramEditor(programId) {
    setMenuOpen(false); setAccountOpen(false); setTrainingInitialTab('your-programs'); setLaunchingProgramId(null); setWorkoutScheduledId(null); setEditingProgramId(programId); setActiveScreen('create-program');
  }
  function openProgramLauncher(programId) {
    setMenuOpen(false); setAccountOpen(false); setTrainingInitialTab('your-programs'); setEditingProgramId(null); setWorkoutScheduledId(null); setLaunchingProgramId(programId); setActiveScreen('create-program');
  }
  function openWorkout(scheduledWorkoutId) {
    setMenuOpen(false); setAccountOpen(false); setWorkoutScheduledId(scheduledWorkoutId); setActiveScreen('workout-session');
  }
  function finishProgramSave() {
    setEditingProgramId(null); setLaunchingProgramId(null); setTrainingInitialTab('your-programs'); setTrainingRefreshKey((value) => value + 1); setActiveScreen('training');
  }
  function closeWorkoutToHome() {
    setWorkoutScheduledId(null);
    setActiveScreen('home');
  }

  function renderActiveScreen() {
    if (activeScreen === 'workout-session' && workoutScheduledId) {
      return <WorkoutSessionScreen scheduledWorkoutId={workoutScheduledId} onBack={closeWorkoutToHome} onCompleted={closeWorkoutToHome} />;
    }

    if (activeScreen === 'create-program') {
      return (
        <CreateProgramScreen
          programId={launchingProgramId ?? editingProgramId}
          launchOnly={Boolean(launchingProgramId)}
          onBack={() => { setEditingProgramId(null); setLaunchingProgramId(null); setActiveScreen('training'); }}
          onCreated={finishProgramSave}
        />
      );
    }

    if (activeScreen === 'training') {
      return <ExercisesScreen initialTab={trainingInitialTab} refreshKey={trainingRefreshKey} onCreateProgram={openCreateProgram} onEditProgram={openProgramEditor} onStartProgram={openProgramLauncher} />;
    }

    if (['statistics', 'nutrition', 'sportpit'].includes(activeScreen)) return <SectionPlaceholder section={activeScreen} />;

    return <HomeScreen menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} onCloseMenu={() => setMenuOpen(false)} onOpenWorkout={openWorkout} />;
  }

  if (authConfigError) {
    return <main className="auth-shell"><section className="auth-card"><div className="auth-brand">GYM</div><h1>Ошибка конфигурации</h1><p className="auth-subtitle">{authConfigError}</p></section></main>;
  }
  if (!authReady) return <LoadingScreen />;
  if (passwordRecoveryActive && session) return <AuthScreen recoveryMode onRecoveryComplete={() => setPasswordRecoveryActive(false)} />;
  if (!session) return <AuthScreen />;

  return (
    <>
      {renderActiveScreen()}
      {accountOpen && <AccountPopover user={user} profile={profile} loading={signOutLoading} onClose={() => setAccountOpen(false)} onSignOut={handleSignOut} />}
    </>
  );
}
