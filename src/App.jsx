import { useEffect, useMemo, useState } from 'react';
import { AccountScreen } from './components/AccountScreen.jsx';
import { AuthScreen } from './components/AuthScreen.jsx';
import { CreateProgramScreen } from './components/CreateProgramScreen.jsx';
import { ExercisesScreen } from './components/ExercisesScreen.jsx';
import { HomeScreen } from './components/HomeScreen.jsx';
import { FaqScreen, PlanScreen, PrivacyPolicyScreen, SupportScreen } from './components/MenuScreens.jsx';
import { SectionPlaceholder } from './components/SectionPlaceholder.jsx';
import { SettingsScreen } from './components/SettingsScreen.jsx';
import { StatisticsScreen } from './components/StatisticsScreen.jsx';
import { WorkoutSessionScreen } from './components/WorkoutSessionScreen.jsx';
import { isSupabaseConfigured, supabase } from './lib/supabase.js';

const BOTTOM_NAV_SCREENS = ['training', 'statistics', 'home', 'nutrition', 'sportpit'];
const UTILITY_SCREENS = ['settings', 'plan', 'privacy', 'support', 'faq'];

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

function applyCachedAppearance() {
  try {
    const cached = JSON.parse(localStorage.getItem('gym:user-settings') || '{}');
    if (cached.theme) document.documentElement.dataset.theme = cached.theme;
    if (cached.language) document.documentElement.lang = cached.language;
  } catch {}
}

function LoadingScreen() {
  return <main className="auth-loading" aria-live="polite"><div className="auth-spinner" aria-hidden="true" /><span>Проверяем сессию…</span></main>;
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [activeScreen, setActiveScreen] = useState('home');
  const [accountReturnScreen, setAccountReturnScreen] = useState('home');
  const [utilityReturnScreen, setUtilityReturnScreen] = useState('home');
  const [reopenMenuOnUtilityBack, setReopenMenuOnUtilityBack] = useState(false);
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

  useEffect(() => { applyCachedAppearance(); }, []);

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
        setEditingProgramId(null);
        setLaunchingProgramId(null);
        setWorkoutScheduledId(null);
        setTrainingInitialTab('recommendations');
        setActiveScreen('home');
        setAccountReturnScreen('home');
        setUtilityReturnScreen('home');
        setReopenMenuOnUtilityBack(false);
      }
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    if (!userId) { setProfile(null); return undefined; }
    let active = true;
    async function loadProfile() {
      const { data, error } = await supabase.from('profiles').select('id, display_name, phone, birth_date, height_cm, weight_kg, sex, activity_level, avatar_url, plan_code, created_at').eq('id', userId).single();
      if (!active) return;
      if (error) { console.error('Unable to load profile:', error); setProfile(null); return; }
      setProfile(data);
    }
    loadProfile();
    return () => { active = false; };
  }, [userId]);

  function closeUtilityScreen() {
    const target = utilityReturnScreen || 'home';
    setActiveScreen(target);
    if (reopenMenuOnUtilityBack && target === 'home') window.setTimeout(() => setMenuOpen(true), 0);
    setReopenMenuOnUtilityBack(false);
  }

  function openUtilityFromMenu(screen) {
    setMenuOpen(false);
    setUtilityReturnScreen('home');
    setReopenMenuOnUtilityBack(true);
    setActiveScreen(screen);
  }

  function openSettingsFromAccount() {
    setUtilityReturnScreen('account');
    setReopenMenuOnUtilityBack(false);
    setActiveScreen('settings');
  }

  function openPlanFromSettings() {
    setUtilityReturnScreen('settings');
    setReopenMenuOnUtilityBack(false);
    setActiveScreen('plan');
  }

  async function shareApp() {
    setMenuOpen(false);
    const shareData = {
      title: 'GYM',
      text: 'Попробуй приложение GYM для тренировок и отслеживания прогресса.',
      url: window.location.origin + (import.meta.env.BASE_URL || '/'),
    };
    try {
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        window.alert('Ссылка на приложение скопирована.');
      }
    } catch (error) {
      if (error?.name !== 'AbortError') console.error('Unable to share app:', error);
    }
  }

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key !== 'Escape') return;
      setMenuOpen(false);
      if (UTILITY_SCREENS.includes(activeScreen)) { closeUtilityScreen(); return; }
      setActiveScreen((current) => {
        if (current === 'account') return accountReturnScreen || 'home';
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
      const drawerLink = event.target.closest('.drawer-link');
      if (drawerLink) {
        const label = drawerLink.textContent.trim();
        const actions = {
          'Подписка': 'plan',
          'Настройки': 'settings',
          'Политика конфиденциальности': 'privacy',
          'Поддержка': 'support',
          'Частые вопросы': 'faq',
        };
        if (label === 'Рассказать о приложении') { shareApp(); return; }
        if (actions[label]) { openUtilityFromMenu(actions[label]); return; }
      }

      if (userId && event.target.closest('.profile-btn')) {
        setMenuOpen(false);
        setAccountReturnScreen(['account', ...UTILITY_SCREENS].includes(activeScreen) ? accountReturnScreen : activeScreen);
        setActiveScreen('account');
        return;
      }
      const navItem = event.target.closest('.bottom-nav .nav-item');
      if (!navItem) return;
      const nextScreen = resolveBottomNavScreen(navItem);
      if (!nextScreen) return;
      setMenuOpen(false);
      setEditingProgramId(null);
      setLaunchingProgramId(null);
      setWorkoutScheduledId(null);
      setActiveScreen(nextScreen);
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleDocumentClick);
    return () => { document.removeEventListener('keydown', handleKeyDown); document.removeEventListener('click', handleDocumentClick); };
  }, [userId, activeScreen, accountReturnScreen, utilityReturnScreen, reopenMenuOnUtilityBack]);

  const authConfigError = useMemo(() => {
    if (isSupabaseConfigured) return null;
    return 'Supabase не настроен: отсутствуют VITE_SUPABASE_URL или VITE_SUPABASE_PUBLISHABLE_KEY.';
  }, []);

  async function handleSignOut() {
    setSignOutLoading(true);
    const { error } = await supabase.auth.signOut({ scope: 'local' });
    if (error) { console.error('Unable to sign out:', error); setSignOutLoading(false); return; }
    setSignOutLoading(false);
    setEditingProgramId(null);
    setLaunchingProgramId(null);
    setWorkoutScheduledId(null);
    setActiveScreen('home');
  }

  function openCreateProgram() {
    setMenuOpen(false); setEditingProgramId(null); setLaunchingProgramId(null); setWorkoutScheduledId(null); setActiveScreen('create-program');
  }
  function openProgramEditor(programId) {
    setMenuOpen(false); setTrainingInitialTab('your-programs'); setLaunchingProgramId(null); setWorkoutScheduledId(null); setEditingProgramId(programId); setActiveScreen('create-program');
  }
  function openProgramLauncher(programId) {
    setMenuOpen(false); setTrainingInitialTab('your-programs'); setEditingProgramId(null); setWorkoutScheduledId(null); setLaunchingProgramId(programId); setActiveScreen('create-program');
  }
  function openWorkout(scheduledWorkoutId) {
    setMenuOpen(false); setWorkoutScheduledId(scheduledWorkoutId); setActiveScreen('workout-session');
  }
  function finishProgramSave() {
    setEditingProgramId(null); setLaunchingProgramId(null); setTrainingInitialTab('your-programs'); setTrainingRefreshKey((value) => value + 1); setActiveScreen('training');
  }
  function closeWorkoutToHome() {
    setWorkoutScheduledId(null);
    setActiveScreen('home');
  }

  function renderActiveScreen() {
    if (activeScreen === 'settings') {
      return <SettingsScreen user={user} planCode={profile?.plan_code || 'free'} onBack={closeUtilityScreen} onOpenPlan={openPlanFromSettings} />;
    }
    if (activeScreen === 'plan') return <PlanScreen planCode={profile?.plan_code || 'free'} onBack={closeUtilityScreen} />;
    if (activeScreen === 'privacy') return <PrivacyPolicyScreen onBack={closeUtilityScreen} />;
    if (activeScreen === 'support') return <SupportScreen user={user} onBack={closeUtilityScreen} />;
    if (activeScreen === 'faq') return <FaqScreen onBack={closeUtilityScreen} />;
    if (activeScreen === 'account') {
      return <AccountScreen user={user} profile={profile} loading={signOutLoading} onBack={() => setActiveScreen(accountReturnScreen || 'home')} onSignOut={handleSignOut} onAccountDeleted={() => setActiveScreen('home')} onProfileUpdated={setProfile} onOpenSettings={openSettingsFromAccount} />;
    }
    if (activeScreen === 'workout-session' && workoutScheduledId) {
      return <WorkoutSessionScreen scheduledWorkoutId={workoutScheduledId} onBack={closeWorkoutToHome} onCompleted={closeWorkoutToHome} />;
    }
    if (activeScreen === 'create-program') {
      return <CreateProgramScreen programId={launchingProgramId ?? editingProgramId} launchOnly={Boolean(launchingProgramId)} onBack={() => { setEditingProgramId(null); setLaunchingProgramId(null); setActiveScreen('training'); }} onCreated={finishProgramSave} />;
    }
    if (activeScreen === 'training') {
      return <ExercisesScreen initialTab={trainingInitialTab} refreshKey={trainingRefreshKey} onCreateProgram={openCreateProgram} onEditProgram={openProgramEditor} onStartProgram={openProgramLauncher} />;
    }
    if (activeScreen === 'statistics') return <StatisticsScreen />;
    if (['nutrition', 'sportpit'].includes(activeScreen)) return <SectionPlaceholder section={activeScreen} />;
    return <HomeScreen menuOpen={menuOpen} onOpenMenu={() => setMenuOpen(true)} onCloseMenu={() => setMenuOpen(false)} onOpenWorkout={openWorkout} />;
  }

  if (authConfigError) return <main className="auth-shell"><section className="auth-card"><div className="auth-brand">GYM</div><h1>Ошибка конфигурации</h1><p className="auth-subtitle">{authConfigError}</p></section></main>;
  if (!authReady) return <LoadingScreen />;
  if (passwordRecoveryActive && session) return <AuthScreen recoveryMode onRecoveryComplete={() => setPasswordRecoveryActive(false)} />;
  if (!session) return <AuthScreen />;

  return renderActiveScreen();
}
