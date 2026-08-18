import { useEffect, useMemo, useState } from 'react';
import { AuthScreen } from './components/AuthScreen.jsx';
import { HomeScreen } from './components/HomeScreen.jsx';
import { isSupabaseConfigured, supabase } from './lib/supabase.js';

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
      <button
        className="account-popover-scrim"
        type="button"
        aria-label="Закрыть профиль"
        onClick={onClose}
      />
      <section className="account-popover" aria-label="Профиль пользователя">
        <div className="account-popover-head">
          <div className="account-popover-avatar" aria-hidden="true">{initial}</div>
          <div className="account-popover-copy">
            <strong>{displayName}</strong>
            <span>{user?.email}</span>
          </div>
        </div>
        <button className="account-logout" type="button" disabled={loading} onClick={onSignOut}>
          {loading ? 'Выходим…' : 'Выйти из аккаунта'}
        </button>
      </section>
    </>
  );
}

export default function App() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authReady, setAuthReady] = useState(!isSupabaseConfigured);
  const [signOutLoading, setSignOutLoading] = useState(false);

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

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      setSession(nextSession ?? null);
      setAuthReady(true);
      if (!nextSession) {
        setProfile(null);
        setMenuOpen(false);
        setAccountOpen(false);
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!userId) {
      setProfile(null);
      return undefined;
    }

    let active = true;

    async function loadProfile() {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, display_name, created_at')
        .eq('id', userId)
        .single();

      if (!active) return;

      if (error) {
        console.error('Unable to load profile:', error);
        setProfile(null);
        return;
      }

      setProfile(data);
    }

    loadProfile();

    return () => {
      active = false;
    };
  }, [userId]);

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setAccountOpen(false);
      }
    }

    function handleProfileButton(event) {
      if (!userId) return;
      if (event.target.closest('.profile-btn')) {
        setAccountOpen((current) => !current);
      }
    }

    document.addEventListener('keydown', handleKeyDown);
    document.addEventListener('click', handleProfileButton);

    return () => {
      document.removeEventListener('keydown', handleKeyDown);
      document.removeEventListener('click', handleProfileButton);
    };
  }, [userId]);

  const authConfigError = useMemo(() => {
    if (isSupabaseConfigured) return null;
    return 'Supabase не настроен: отсутствуют VITE_SUPABASE_URL или VITE_SUPABASE_PUBLISHABLE_KEY.';
  }, []);

  async function handleSignOut() {
    setSignOutLoading(true);

    const { error } = await supabase.auth.signOut({ scope: 'local' });

    if (error) {
      console.error('Unable to sign out:', error);
      setSignOutLoading(false);
      return;
    }

    setSignOutLoading(false);
    setAccountOpen(false);
  }

  if (authConfigError) {
    return (
      <main className="auth-shell">
        <section className="auth-card">
          <div className="auth-brand">GYM</div>
          <h1>Ошибка конфигурации</h1>
          <p className="auth-subtitle">{authConfigError}</p>
        </section>
      </main>
    );
  }

  if (!authReady) return <LoadingScreen />;
  if (!session) return <AuthScreen />;

  return (
    <>
      <HomeScreen
        menuOpen={menuOpen}
        onOpenMenu={() => setMenuOpen(true)}
        onCloseMenu={() => setMenuOpen(false)}
      />
      {accountOpen && (
        <AccountPopover
          user={user}
          profile={profile}
          loading={signOutLoading}
          onClose={() => setAccountOpen(false)}
          onSignOut={handleSignOut}
        />
      )}
    </>
  );
}
