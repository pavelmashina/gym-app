import { useEffect, useState } from 'react';
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

  if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
    return 'Слишком много запросов. Попробуйте отправить письмо немного позже.';
  }

  if (error.code === 'same_password') {
    return 'Новый пароль должен отличаться от текущего.';
  }

  return error.message || 'Не удалось выполнить операцию. Попробуйте ещё раз.';
}

export function AuthScreen({ recoveryMode = false, onRecoveryComplete }) {
  const [mode, setMode] = useState(recoveryMode ? 'update-password' : 'signin');
  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  const isSignUp = mode === 'signup';
  const isResetRequest = mode === 'reset-request';
  const isUpdatePassword = mode === 'update-password';
  const isStandardAuth = !isResetRequest && !isUpdatePassword;

  useEffect(() => {
    if (recoveryMode) {
      setMode('update-password');
      setErrorMessage('');
      setSuccessMessage('');
    }
  }, [recoveryMode]);

  function switchMode(nextMode) {
    setMode(nextMode);
    setPassword('');
    setPasswordConfirm('');
    setErrorMessage('');
    setSuccessMessage('');
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setErrorMessage('');
    setSuccessMessage('');

    try {
      if (isResetRequest) {
        const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL}`;
        const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });

        if (error) throw error;

        setSuccessMessage(
          'Если аккаунт с таким email существует, мы отправили письмо со ссылкой для восстановления пароля.',
        );
        return;
      }

      if (isUpdatePassword) {
        if (password !== passwordConfirm) {
          setErrorMessage('Пароли не совпадают.');
          return;
        }

        const { error } = await supabase.auth.updateUser({ password });
        if (error) throw error;

        const cleanUrl = `${window.location.origin}${import.meta.env.BASE_URL}`;
        window.history.replaceState({}, document.title, cleanUrl);
        setPassword('');
        setPasswordConfirm('');
        onRecoveryComplete?.();
        return;
      }

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

  const title = isUpdatePassword
    ? 'Новый пароль'
    : isResetRequest
      ? 'Восстановление пароля'
      : isSignUp
        ? 'Создать аккаунт'
        : 'Войти';

  const subtitle = isUpdatePassword
    ? 'Придумайте новый пароль для вашего аккаунта.'
    : isResetRequest
      ? 'Введите email аккаунта. Мы отправим ссылку для создания нового пароля.'
      : isSignUp
        ? 'Создайте аккаунт, чтобы тренировки и прогресс сохранялись между устройствами.'
        : 'Войдите, чтобы продолжить работу со своими тренировками.';

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="auth-title">
        <div className="auth-brand" aria-hidden="true">GYM</div>
        <div className="auth-kicker">Персональный тренировочный дневник</div>
        <h1 id="auth-title">{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>

        {isStandardAuth && (
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
        )}

        <form className={`auth-form${!isStandardAuth ? ' auth-form-standalone' : ''}`} onSubmit={handleSubmit}>
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

          {!isUpdatePassword && (
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
          )}

          {!isResetRequest && (
            <div className="auth-password-group">
              <label className="auth-field">
                <span>{isUpdatePassword ? 'Новый пароль' : 'Пароль'}</span>
                <input
                  type="password"
                  autoComplete={isSignUp || isUpdatePassword ? 'new-password' : 'current-password'}
                  minLength="6"
                  required
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  placeholder="Минимум 6 символов"
                />
              </label>

              {!isSignUp && !isUpdatePassword && (
                <button className="auth-forgot" type="button" onClick={() => switchMode('reset-request')}>
                  Забыли пароль?
                </button>
              )}
            </div>
          )}

          {isUpdatePassword && (
            <label className="auth-field">
              <span>Повторите пароль</span>
              <input
                type="password"
                autoComplete="new-password"
                minLength="6"
                required
                value={passwordConfirm}
                onChange={(event) => setPasswordConfirm(event.target.value)}
                placeholder="Введите новый пароль ещё раз"
              />
            </label>
          )}

          {errorMessage && <div className="auth-message error" role="alert">{errorMessage}</div>}
          {successMessage && <div className="auth-message success" role="status">{successMessage}</div>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading
              ? 'Подождите…'
              : isResetRequest
                ? 'Отправить ссылку'
                : isUpdatePassword
                  ? 'Сохранить новый пароль'
                  : isSignUp
                    ? 'Создать аккаунт'
                    : 'Войти'}
          </button>

          {isResetRequest && (
            <button className="auth-back-link" type="button" onClick={() => switchMode('signin')}>
              Вернуться ко входу
            </button>
          )}
        </form>
      </section>
    </main>
  );
}
