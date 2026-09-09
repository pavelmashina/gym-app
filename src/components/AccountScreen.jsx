import { useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import '../account-screen.css';

const ACTIVITY_LABELS = { low: 'Низкий', light: 'Лёгкая активность', moderate: 'Средняя активность', high: 'Высокая активность', very_high: 'Очень высокая активность' };
const SEX_LABELS = { male: 'Мужской', female: 'Женский', other: 'Другой' };
const PLAN_LABELS = { free: 'Базовый', pro: 'Pro', premium: 'Premium' };
const AVATAR_BUCKET = 'account-avatars';
const MAX_AVATAR_BYTES = 8 * 1024 * 1024;

function formatDate(value) {
  if (!value) return 'Не указано';
  const date = new Date(`${value}T12:00:00`);
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'long', year: 'numeric' }).format(date);
}
function Row({ label, value }) { return <div className="account-data-row"><span>{label}</span><strong>{value || 'Не указано'}</strong></div>; }
function ArrowIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m9 5 7 7-7 7" /></svg>; }
function BackIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>; }
function PencilIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 20h4l11-11-4-4L4 16v4Z" /><path d="m13.7 6.3 4 4" /></svg>; }
function SettingsIcon() { return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 0-.4 1.1V21H9.6v-.1a1.7 1.7 0 0 0-.4-1.1 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 3.8 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 0-1.1-.4H2V9.6h.1a1.7 1.7 0 0 0 1.1-.4 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 8.2 3.8a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 0 .4-1.1V2h4v.1a1.7 1.7 0 0 0 .4 1.1 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 8.2a1.7 1.7 0 0 0 .6 1 1.7 1.7 0 0 0 1.1.4h.1v4h-.1a1.7 1.7 0 0 0-1.1.4 1.7 1.7 0 0 0-.6 1Z" /></svg>; }

function PlanDetails({ planCode, onBack }) {
  const plan = PLAN_LABELS[planCode] || 'Базовый';
  return <div className="account-screen"><header className="account-topbar"><button type="button" className="account-icon-btn" onClick={onBack} aria-label="Назад"><BackIcon /></button><h1>Мой тариф</h1><span className="account-topbar-spacer" /></header><main className="account-content"><section className="account-plan-hero"><span>Текущий тариф</span><strong>{plan}</strong><p>{planCode === 'free' ? 'Основные функции приложения доступны бесплатно.' : 'Расширенный доступ к функциям приложения.'}</p></section><section className="account-card"><h2>Что входит</h2><div className="account-plan-feature">Тренировочные программы</div><div className="account-plan-feature">Статистика тренировок</div><div className="account-plan-feature">Синхронизация данных</div></section></main></div>;
}
function EditHeader({ title, onBack }) { return <header className="account-topbar"><button type="button" className="account-icon-btn" onClick={onBack} aria-label="Назад"><BackIcon /></button><h1>{title}</h1><span className="account-topbar-spacer" /></header>; }
function Field({ label, children, hint }) { return <label className="account-form-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
function ConfirmModal({ title, text, confirmLabel, danger = false, loading = false, onConfirm, onClose }) { return <div className="account-confirm-modal" role="dialog" aria-modal="true" aria-label={title}><button className="account-delete-scrim" type="button" aria-label="Закрыть" onClick={onClose} disabled={loading} /><section className="account-confirm-sheet"><div className="account-delete-handle" /><h2>{title}</h2><p>{text}</p><button type="button" className={danger ? 'account-delete-confirm' : 'account-confirm-primary'} disabled={loading} onClick={onConfirm}>{loading ? 'Подождите…' : confirmLabel}</button><button type="button" className="account-delete-cancel" disabled={loading} onClick={onClose}>Отмена</button></section></div>; }

export function AccountScreen({ user, profile, loading, onBack, onSignOut, onAccountDeleted, onProfileUpdated }) {
  const [subscreen, setSubscreen] = useState('main');
  const [confirmMode, setConfirmMode] = useState(null);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteError, setDeleteError] = useState('');
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState('');
  const [formSuccess, setFormSuccess] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');
  const [avatarFile, setAvatarFile] = useState(null);
  const [personalDraft, setPersonalDraft] = useState({ name: '', phone: '', email: '', birthDate: '' });
  const [paramsDraft, setParamsDraft] = useState({ height: '', weight: '', sex: '', activity: '' });
  const [emailChangePending, setEmailChangePending] = useState(false);
  const avatarInputRef = useRef(null);

  const displayName = profile?.display_name?.trim() || user?.email?.split('@')[0] || 'Пользователь';
  const initial = displayName.slice(0, 1).toUpperCase();
  const planCode = profile?.plan_code || 'free';
  const phone = profile?.phone || user?.phone || 'Не указано';
  const sex = SEX_LABELS[profile?.sex] || 'Не указано';
  const activity = ACTIVITY_LABELS[profile?.activity_level] || 'Не указано';
  const height = profile?.height_cm ? `${Number(profile.height_cm).toLocaleString('ru-RU')} см` : 'Не указано';
  const weight = profile?.weight_kg ? `${Number(profile.weight_kg).toLocaleString('ru-RU')} кг` : 'Не указано';

  useEffect(() => {
    let active = true;
    async function resolveAvatar() {
      const stored = profile?.avatar_url || user?.user_metadata?.avatar_url || user?.user_metadata?.picture || '';
      if (!stored) { if (active) setAvatarPreview(''); return; }
      if (/^https?:\/\//i.test(stored)) { if (active) setAvatarPreview(stored); return; }
      const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUrl(stored, 3600);
      if (active) setAvatarPreview(error ? '' : data?.signedUrl || '');
    }
    resolveAvatar();
    return () => { active = false; };
  }, [profile?.avatar_url, user?.user_metadata?.avatar_url, user?.user_metadata?.picture]);

  const avatar = useMemo(() => avatarPreview ? <img src={avatarPreview} alt="Фото профиля" /> : <span>{initial}</span>, [avatarPreview, initial]);

  function openPersonalEdit() {
    setPersonalDraft({ name: displayName, phone: profile?.phone || user?.phone || '', email: user?.email || '', birthDate: profile?.birth_date || '' });
    setAvatarFile(null); setFormError(''); setFormSuccess(''); setEmailChangePending(false); setSubscreen('personal-edit');
  }
  function openParamsEdit() {
    setParamsDraft({ height: profile?.height_cm ?? '', weight: profile?.weight_kg ?? '', sex: profile?.sex || '', activity: profile?.activity_level || '' });
    setFormError(''); setFormSuccess(''); setSubscreen('params-edit');
  }

  async function uploadAvatar() {
    if (!avatarFile) return profile?.avatar_url || null;
    if (avatarFile.size > MAX_AVATAR_BYTES) throw new Error('Фото должно быть не больше 8 МБ.');
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'].includes(avatarFile.type)) throw new Error('Поддерживаются JPG, PNG, WEBP и HEIC.');
    const ext = (avatarFile.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '') || 'jpg';
    const path = `${user.id}/avatar.${ext}`;
    const { error } = await supabase.storage.from(AVATAR_BUCKET).upload(path, avatarFile, { upsert: true, contentType: avatarFile.type, cacheControl: '3600' });
    if (error) throw error;
    return path;
  }

  async function savePersonal() {
    if (saving) return;
    const cleanName = personalDraft.name.trim();
    const cleanEmail = personalDraft.email.trim().toLowerCase();
    if (!cleanName) { setFormError('Введите имя.'); return; }
    if (!/^\S+@\S+\.\S+$/.test(cleanEmail)) { setFormError('Введите корректную почту.'); return; }
    setSaving(true); setFormError(''); setFormSuccess('');
    try {
      const avatarPath = await uploadAvatar();
      const updates = { display_name: cleanName, phone: personalDraft.phone.trim() || null, birth_date: personalDraft.birthDate || null, avatar_url: avatarPath };
      const { data: updatedProfile, error: profileError } = await supabase.from('profiles').update(updates).eq('id', user.id).select('*').single();
      if (profileError) throw profileError;
      onProfileUpdated?.(updatedProfile);
      const emailChanged = cleanEmail !== String(user?.email || '').toLowerCase();
      if (emailChanged) {
        const redirectTo = `${window.location.origin}${import.meta.env.BASE_URL || '/'}`;
        const { error: emailError } = await supabase.auth.updateUser({ email: cleanEmail }, { emailRedirectTo: redirectTo });
        if (emailError) throw emailError;
        setEmailChangePending(true);
        setFormSuccess('Мы отправили письмо на новую почту. Подтвердите адрес, после чего нужно будет войти в аккаунт заново.');
      } else setFormSuccess('Личные данные сохранены.');
      setAvatarFile(null);
    } catch (error) {
      console.error('Unable to update personal data:', error);
      setFormError(error?.message || 'Не удалось сохранить данные.');
    } finally { setSaving(false); }
  }

  async function saveParameters() {
    if (saving) return;
    setSaving(true); setFormError(''); setFormSuccess('');
    try {
      const updates = { height_cm: paramsDraft.height === '' ? null : Number(paramsDraft.height), weight_kg: paramsDraft.weight === '' ? null : Number(paramsDraft.weight), sex: paramsDraft.sex || null, activity_level: paramsDraft.activity || null };
      const { data, error } = await supabase.from('profiles').update(updates).eq('id', user.id).select('*').single();
      if (error) throw error;
      onProfileUpdated?.(data); setFormSuccess('Параметры сохранены.');
    } catch (error) { console.error('Unable to update account parameters:', error); setFormError(error?.message || 'Не удалось сохранить параметры.'); }
    finally { setSaving(false); }
  }

  async function deleteAccount() {
    if (deleteLoading) return;
    setDeleteLoading(true); setDeleteError('');
    const { error } = await supabase.functions.invoke('delete-account', { body: { confirm: true } });
    if (error) { setDeleteError('Не удалось удалить аккаунт. Попробуйте ещё раз.'); setDeleteLoading(false); return; }
    await supabase.auth.signOut({ scope: 'local' }); onAccountDeleted?.();
  }
  async function signOutAfterEmailChange() { await supabase.auth.signOut({ scope: 'local' }); }

  if (subscreen === 'plan') return <PlanDetails planCode={planCode} onBack={() => setSubscreen('main')} />;

  if (subscreen === 'personal-edit') return <div className="account-screen"><EditHeader title="Личные данные" onBack={() => setSubscreen('main')} /><main className="account-content"><section className="account-edit-avatar-card"><button type="button" className="account-edit-avatar" onClick={() => avatarInputRef.current?.click()}>{avatar}</button><div><strong>Фото профиля</strong><span>Нажмите, чтобы заменить</span></div><input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" hidden onChange={(event) => { const file = event.target.files?.[0] || null; setAvatarFile(file); if (file) setAvatarPreview(URL.createObjectURL(file)); }} /></section><section className="account-card account-form-card"><Field label="Имя"><input value={personalDraft.name} maxLength={80} onChange={(event) => setPersonalDraft((draft) => ({ ...draft, name: event.target.value }))} /></Field><Field label="Телефон" hint="Подтверждение номера по SMS добавим позже."><input type="tel" inputMode="tel" value={personalDraft.phone} placeholder="+7 900 000-00-00" onChange={(event) => setPersonalDraft((draft) => ({ ...draft, phone: event.target.value }))} /></Field><Field label="Почта" hint="При смене почты нужно подтвердить новый адрес по письму и затем войти заново."><input type="email" inputMode="email" value={personalDraft.email} onChange={(event) => setPersonalDraft((draft) => ({ ...draft, email: event.target.value }))} /></Field><Field label="Дата рождения"><input type="date" value={personalDraft.birthDate} onChange={(event) => setPersonalDraft((draft) => ({ ...draft, birthDate: event.target.value }))} /></Field>{formError && <div className="account-form-error" role="alert">{formError}</div>}{formSuccess && <div className="account-form-success">{formSuccess}</div>}{emailChangePending ? <button type="button" className="account-save-button" onClick={signOutAfterEmailChange}>Перейти ко входу</button> : <button type="button" className="account-save-button" disabled={saving} onClick={savePersonal}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>}</section></main></div>;

  if (subscreen === 'params-edit') return <div className="account-screen"><EditHeader title="Ваши параметры" onBack={() => setSubscreen('main')} /><main className="account-content"><section className="account-card account-form-card"><Field label="Рост, см"><input type="number" min="80" max="260" step="0.1" inputMode="decimal" value={paramsDraft.height} onChange={(event) => setParamsDraft((draft) => ({ ...draft, height: event.target.value }))} /></Field><Field label="Вес, кг"><input type="number" min="20" max="500" step="0.1" inputMode="decimal" value={paramsDraft.weight} onChange={(event) => setParamsDraft((draft) => ({ ...draft, weight: event.target.value }))} /></Field><Field label="Пол"><select value={paramsDraft.sex} onChange={(event) => setParamsDraft((draft) => ({ ...draft, sex: event.target.value }))}><option value="">Не указано</option><option value="male">Мужской</option><option value="female">Женский</option><option value="other">Другой</option></select></Field><Field label="Уровень активности"><select value={paramsDraft.activity} onChange={(event) => setParamsDraft((draft) => ({ ...draft, activity: event.target.value }))}><option value="">Не указано</option>{Object.entries(ACTIVITY_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></Field>{formError && <div className="account-form-error" role="alert">{formError}</div>}{formSuccess && <div className="account-form-success">{formSuccess}</div>}<button type="button" className="account-save-button" disabled={saving} onClick={saveParameters}>{saving ? 'Сохраняем…' : 'Сохранить'}</button></section></main></div>;

  if (subscreen === 'delete-losses') {
    const lossItems = [`Все функции и преимущества тарифа «${PLAN_LABELS[planCode] || 'Базовый'}»`, 'Вся статистика тренировок, история результатов и личные рекорды', 'Избранные и недавно использованные упражнения', 'Замеры тела, вес, фотографии прогресса и сохранённая динамика', 'Индивидуальные тренировочные планы и расписание программ', 'Все созданные вами тренировочные программы и упражнения', 'Результаты выполненных тренировок, подходы, веса, повторения и тоннаж', 'Заметки к упражнениям и тренировкам, предыдущие результаты и лучшие подходы', 'Загруженные видео упражнений, обложки программ и фото профиля', 'Возможность продолжать отслеживать прогресс по накопленной истории', 'Ваш профиль, персональные параметры и все остальные данные аккаунта'];
    return <div className="account-screen account-delete-loss-screen"><EditHeader title="Удаление аккаунта" onBack={() => setSubscreen('main')} /><main className="account-content"><section className="account-delete-loss-hero"><span>Это действие необратимо</span><h2>После удаления восстановить данные не получится</h2><p>Аккаунт будет полностью удалён вместе со связанными с ним данными.</p></section><section className="account-card account-loss-card"><h2>Вы потеряете</h2><ul>{lossItems.map((item) => <li key={item}>{item}</li>)}</ul></section>{deleteError && <div className="account-form-error" role="alert">{deleteError}</div>}<button type="button" className="account-final-delete" disabled={deleteLoading} onClick={deleteAccount}>{deleteLoading ? 'Удаляем аккаунт…' : 'Удалить аккаунт навсегда'}</button><button type="button" className="account-keep-button" disabled={deleteLoading} onClick={() => setSubscreen('main')}>Оставить аккаунт</button></main></div>;
  }

  return <div className="account-screen"><header className="account-topbar"><button type="button" className="account-icon-btn" onClick={onBack} aria-label="Назад"><BackIcon /></button><h1>Личный кабинет</h1><button type="button" className="account-icon-btn account-settings-disabled" disabled aria-label="Настройки пока недоступны" title="Настройки появятся позже"><SettingsIcon /></button></header><main className="account-content"><section className="account-identity"><div className="account-avatar">{avatar}</div><div><h2>{displayName}</h2><span>{user?.email || 'Аккаунт'}</span></div></section><section className="account-card"><div className="account-card-head"><h2>Личные данные</h2><button type="button" className="account-pencil" aria-label="Редактировать личные данные" onClick={openPersonalEdit}><PencilIcon /></button></div><Row label="Телефон" value={phone} /><Row label="Почта" value={user?.email || 'Не указано'} /><Row label="Дата рождения" value={formatDate(profile?.birth_date)} /></section><section className="account-card"><div className="account-card-head"><h2>Ваши параметры</h2><button type="button" className="account-pencil" aria-label="Редактировать параметры" onClick={openParamsEdit}><PencilIcon /></button></div><Row label="Рост" value={height} /><Row label="Вес" value={weight} /><Row label="Пол" value={sex} /><Row label="Уровень активности" value={activity} /></section><section className="account-card account-plan-card"><h2>Мой тариф</h2><button type="button" className="account-plan-link" onClick={() => setSubscreen('plan')}><div><span>Текущий тариф</span><strong>{PLAN_LABELS[planCode] || 'Базовый'}</strong></div><ArrowIcon /></button></section><section className="account-card account-danger-card"><h2>Аккаунт</h2><button type="button" className="account-logout-button" disabled={loading} onClick={() => setConfirmMode('logout')}>Выйти из аккаунта</button><button type="button" className="account-delete-button" onClick={() => setConfirmMode('delete')}>Удалить аккаунт</button></section></main>{confirmMode === 'logout' && <ConfirmModal title="Выйти из аккаунта?" text="Точно хотите выйти? Для возвращения в приложение потребуется снова войти в аккаунт." confirmLabel="Выйти" loading={loading} onClose={() => setConfirmMode(null)} onConfirm={() => { setConfirmMode(null); onSignOut?.(); }} />}{confirmMode === 'delete' && <ConfirmModal title="Удалить аккаунт?" text="Точно хотите удалить аккаунт? Все данные будут удалены без возможности восстановления." confirmLabel="Всё равно удалить" danger onClose={() => setConfirmMode(null)} onConfirm={() => { setConfirmMode(null); setDeleteError(''); setSubscreen('delete-losses'); }} />}</div>;
}
