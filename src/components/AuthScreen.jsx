import { useState } from 'react';
import { supabase } from '../lib/supabase.js';

function getErrorMessage(error) {
  if (!error) return '';

  if (error.code === 'invalid_credentials') {
    return 'Неверный email или пароль.';
  }

  if (error.code === 'email_not_confirmed') {
    return 'Сначала подтвердите email по ссылке из письма.';
  }

  if (error.code === 'user_already_exists') {
    return 'Аккаунт с таким email уже существует.';
  }

  if (error.code === 'weak_password') {
    return 'Пароль слишком простой. Используйте более надёжный пароль.';
  }

  return error.message || 'Не удалось выполнить операцию. Попробуйте ещё раз.';
}

export function AuthScreen() {
  const [mode, setMode] = useState('signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isSignUp = mode === 'signup';

  function switchMode(nextMode) {
    setMode(nextMode);
    setErrorMessage('');
    setSuccessMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (isSignUp) {
        const cleanName = displayName.trim();
        const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;

        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              display_name: cleanName || null,
            },
            emailRedirectTo: redirectTo,
          },
        });

        if (error) throw error;

        if (!data.session) {
          setSuccessMessage(
            'Аккаунт создан. Проверьте почту и подтвердите email, затем вернитесь в приложение.',
          );
          setPassword('');
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

        if (error) throw error;
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand" aria-hidden="true">GYM</div>
        <div className="auth-kicker">Персональный тренировочный дневник</div>
        <h1 id="auth-title">{isSignUp ? 'Создать аккаунт' : 'Войти'}</h1>
        <p className="auth-subtitle">
          {isSignUp
            ? 'Создайте аккаунт, чтобы тренировки и прогресс сохранялись между устройствами.'
            : 'Войдите, чтобы продолжить работу со своими тренировками.'}
        </p>

        <div className="auth-tabs" role="tablist" aria-label="Авторизация">
          <button
            className={`auth-tab${!isSignUp ? ' active' : ''}`}
            type="button"
            role="tab"
            aria-selected={!isSignUp}
            onClick={() => switchMode('signin')}
          >
            Войти
          </button>
          <button
            className={`auth-tab${isSignUp ? ' active' : ''}`}
            type="button"
            role="tab"
            aria-selected={isSignUp}
            onClick={() => switchMode('signup')}
          >
            Регистрация
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          {isSignUp && (
            <label className="auth-field">
              <span>Имя</span>
              <input
                type="text"
                autoComplete="name"
                maxLength="80"
                value={displayName}
                onChange={(event) => setDisplayName(event.target.value)}
                placeholder="Как к вам обращаться"
              />
            </label>
          )}

          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              inputMode="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </label>

          <label className="auth-field">
            <span>Пароль</span>
            <input
              type="password"
              autoComplete={isSignUp ? 'new-password' : 'current-password'}
              minLength="6"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Минимум 6 символов"
            />
          </label>

          {errorMessage && <div className="auth-message error" role="alert">{errorMessage}</div>}
          {successMessage && <div className="auth-message success" role="status">{successMessage}</div>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? 'Подождите…' : isSignUp ? 'Создать аккаунт' : 'Войти'}
          </button>
        </form>
      </section>
    </main>
  );
}
