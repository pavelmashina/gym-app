import { useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import '../account-screen.css';

const ACTIVITY_LABELS = {
  low: 'Низкий',
  light: 'Лёгкая активность',
  moderate: 'Средняя активность',
  high: 'Высокая активность',
  very_high: 'Очень высокая активность',
};

const SEX_LABELS = { male: 'Мужской', female: 'Женский', other: 'Другой' };
const PLAN_LABELS = { free: 'Базовый', pro: 'Pro', premium: 'Premium' };

function formatDate(value) {
  if (!value) return 'Не указано';
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}
function Row({ label, value }) { return <div className="account-data-row"><span>{label}</span><strong>{value || 'Не указано'}</strong></div>; }
function ArrowIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>; }
function BackIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>; }
function SettingsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 3.8 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2V9.6h.1a1.7 1.7 0 0 0 1.1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.2 3.8a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2h4v.1a1.7 1.7 0 0 0 .4 1.1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8.2a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.1.4 1.7 1.7 0 0 0-.6 1Z" /></svg>; }

function PlanDetails({ planCode, onBack }) {
  const plan = PLAN_LABELS[planCode] || 'Базовый';
  return <div className="account-screen"><header className="account-topbar"><button type="button" className="account-icon-btn" onClick={onBack} aria-label="Назад"><BackIcon /></button><h1>Мой тариф</h1><span className="account-topbar-spacer" /></header><main className="account-content"><section className="account-plan-hero"><span>Текущий тариф</span><strong>{plan}</strong><p>{planCode === 'free' ? 'Основные функции приложения доступны бесплатно.' : 'Расширенный доступ к функциям приложения.'}</p></section><section className="account-card"><h2>Что входит</h2><div className="account-plan-feature">Тренировочные программы</div><div className="account-plan-feature">Статистика тренировок</div><div className="account-plan-feature">Синхронизация данных</div></section></main></div>;
}

export function AccountScreen({ user, profile, loading, onBack, onSignOut, onAccountDeleted }) {
  const [subscreen, setSubscreen] = useState('main');
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState('');
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const displayName = profile?.display_name?.trim() || user?.email?.split('@')[0] || 'Пользователь';
  const initial = displayName.slice(0, 1).toUpperCase();
  const planCode = profile?.plan_code || 'free';
  const avatarUrl = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '';
  const phone = profile?.phone || user?.phone || 'Не указано';
  const sex = SEX_LABELS[profile?.sex] || 'Не указано';
  const activity = ACTIVITY_LABELS[profile?.activity_level] || 'Не указано';
  const height = profile?.height_cm ? `${Number(profile.height_cm).toLocaleString('ru-RU')} см` : 'Не указано';
  const weight = profile?.weight_kg ? `${Number(profile.weight_kg).toLocaleString('ru-RU')} кг` : 'Не указано';
  const avatar = useMemo(() => avatarUrl ? <img src={avatarUrl} alt="Фото профиля" /> : <span>{initial}</span>, [avatarUrl, initial]);

  async function deleteAccount() {
    if (deleteConfirm.trim().toUpperCase() !== 'УДАЛИТЬ' || deleteLoading) return;
    setDeleteLoading(true); setDeleteError('');
    const { error } = await supabase.functions.invoke('delete-account', { body: {} });
    if (error) { setDeleteError('Не удалось удалить аккаунт. Попробуйте ещё раз.'); setDeleteLoading(false); return; }
    await supabase.auth.signOut({ scope: 'local' });
    onAccountDeleted?.();
  }

  if (subscreen === 'plan') return <PlanDetails planCode={planCode} onBack={() => setSubscreen('main')} />;
  return <div className="account-screen"><header className="account-topbar"><button type="button" className="account-icon-btn" onClick={onBack} aria-label="Назад"><BackIcon /></button><h1>Личный кабинет</h1><button type="button" className="account-icon-btn account-settings-disabled" disabled aria-label="Настройки пока недоступны" title="Настройки появятся позже"><SettingsIcon /></button></header><main className="account-content"><section className="account-identity"><div className="account-avatar">{avatar}</div><div><h2>{displayName}</h2><span>{user?.email || 'Аккаунт'}</span></div></section><section className="account-card"><h2>Личные данные</h2><Row label="Телефон" value={phone} /><Row label="Почта" value={user?.email || 'Не указано'} /><Row label="Дата рождения" value={formatDate(profile?.birth_date)} /></section><section className="account-card"><h2>Ваши параметры</h2><Row label="Рост" value={height} /><Row label="Вес" value={weight} /><Row label="Пол" value={sex} /><Row label="Уровень активности" value={activity} /></section><section className="account-card account-plan-card"><h2>Мой тариф</h2><button type="button" className="account-plan-link" onClick={() => setSubscreen('plan')}><div><span>Текущий тариф</span><strong>{PLAN_LABELS[planCode] || 'Базовый'}</strong></div><ArrowIcon /></button></section><section className="account-card account-danger-card"><h2>Аккаунт</h2><button type="button" className="account-logout-button" disabled={loading} onClick={onSignOut}>{loading ? 'Выходим…' : 'Выйти из аккаунта'}</button><button type="button" className="account-delete-button" onClick={() => { setDeleteOpen(true); setDeleteConfirm(''); setDeleteError(''); }}>Удалить аккаунт</button></section></main>{deleteOpen && <div className="account-delete-modal" role="dialog" aria-modal="true" aria-label="Удалить аккаунт"><button className="account-delete-scrim" type="button" aria-label="Закрыть" onClick={() => !deleteLoading && setDeleteOpen(false)} /><section className="account-delete-sheet"><div className="account-delete-handle" /><h2>Удалить аккаунт?</h2><p>Будут удалены профиль и связанные с аккаунтом данные. Это действие нельзя отменить.</p><label><span>Введите «УДАЛИТЬ» для подтверждения</span><input value={deleteConfirm} onChange={(event) => setDeleteConfirm(event.target.value)} autoComplete="off" /></label>{deleteError && <div className="account-delete-error">{deleteError}</div>}<button type="button" className="account-delete-confirm" disabled={deleteConfirm.trim().toUpperCase() !== 'УДАЛИТЬ' || deleteLoading} onClick={deleteAccount}>{deleteLoading ? 'Удаляем…' : 'Удалить навсегда'}</button><button type="button" className="account-delete-cancel" disabled={deleteLoading} onClick={() => setDeleteOpen(false)}>Отмена</button></section></div>}</div>;
}
