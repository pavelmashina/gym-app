import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import '../settings-screen.css';

function BackIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m15 5-7 7 7 7"/></svg>}
function ArrowIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m9 5 7 7-7 7"/></svg>}
function Switch({checked,onChange}){return <button type="button" className={`settings-switch${checked?' on':''}`} aria-pressed={checked} onClick={()=>onChange(!checked)}><span/></button>}

const DEFAULTS={workout_push:true,workout_email:false,promos_push:false,promos_email:false,weight_unit:'kg',theme:'light',language:'ru',region:'RU'};

export function SettingsScreen({user,planCode,onBack,onOpenPlan}){
  const [settings,setSettings]=useState(DEFAULTS);
  const [methods,setMethods]=useState([]);
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [message,setMessage]=useState('');
  const [passwordMode,setPasswordMode]=useState(false);
  const [oldPassword,setOldPassword]=useState('');
  const [newPassword,setNewPassword]=useState('');
  const [repeatPassword,setRepeatPassword]=useState('');

  useEffect(()=>{let active=true;(async()=>{
    const [{data:s,error:se},{data:p,error:pe}]=await Promise.all([
      supabase.from('user_app_settings').select('*').eq('user_id',user.id).maybeSingle(),
      supabase.from('payment_methods').select('id,brand,last4,exp_month,exp_year,is_default').order('is_default',{ascending:false})
    ]);
    if(!active)return;
    if(se) console.error(se); if(pe) console.error(pe);
    const next=s?{...DEFAULTS,...s}:DEFAULTS;
    setSettings(next); setMethods(p||[]); setLoading(false);
    applyLocalSettings(next);
  })();return()=>{active=false}},[user.id]);

  function applyLocalSettings(next){
    document.documentElement.dataset.theme=next.theme;
    document.documentElement.lang=next.language;
    localStorage.setItem('gym:user-settings',JSON.stringify({weight_unit:next.weight_unit,theme:next.theme,language:next.language,region:next.region}));
    window.dispatchEvent(new CustomEvent('gym-settings-changed',{detail:next}));
  }

  async function persist(patch){
    const next={...settings,...patch}; setSettings(next); applyLocalSettings(next); setSaving(true); setMessage('');
    const {error}=await supabase.from('user_app_settings').upsert({user_id:user.id,...next,updated_at:new Date().toISOString()},{onConflict:'user_id'});
    setSaving(false); if(error){console.error(error);setMessage('Не удалось сохранить настройки.')} else setMessage('Сохранено');
  }

  async function changePassword(){
    if(newPassword.length<8){setMessage('Новый пароль должен содержать минимум 8 символов.');return}
    if(newPassword!==repeatPassword){setMessage('Новые пароли не совпадают.');return}
    setSaving(true);setMessage('');
    const {error:verifyError}=await supabase.auth.signInWithPassword({email:user.email,password:oldPassword});
    if(verifyError){setSaving(false);setMessage('Старый пароль указан неверно.');return}
    const {error}=await supabase.auth.updateUser({password:newPassword});
    setSaving(false); if(error){setMessage('Не удалось изменить пароль.');return}
    setOldPassword('');setNewPassword('');setRepeatPassword('');setPasswordMode(false);setMessage('Пароль изменён.');
  }

  async function resetPassword(){
    setSaving(true);setMessage('');
    const redirectTo=`${window.location.origin}${import.meta.env.BASE_URL||'/'}`;
    const {error}=await supabase.auth.resetPasswordForEmail(user.email,{redirectTo});
    setSaving(false);setMessage(error?'Не удалось отправить письмо.':'Письмо для смены пароля отправлено на почту.');
  }

  async function removeMethod(id){
    const {error}=await supabase.from('payment_methods').delete().eq('id',id);
    if(error){setMessage('Не удалось отвязать карту.');return}
    setMethods((items)=>items.filter((item)=>item.id!==id));setMessage('Карта отвязана.');
  }

  return <div className="settings-screen"><header className="settings-topbar"><button type="button" className="settings-icon" onClick={onBack} aria-label="Назад"><BackIcon/></button><h1>Настройки</h1><span/></header><main className="settings-content">
    {message&&<div className="settings-message">{message}</div>}

    <section className="settings-card"><h2>Безопасность</h2><button className="settings-link" type="button" onClick={()=>setPasswordMode(v=>!v)}><span><strong>Изменить пароль</strong><small>По старому паролю или через почту</small></span><ArrowIcon/></button>{passwordMode&&<div className="settings-password"><label>Старый пароль<input type="password" value={oldPassword} onChange={e=>setOldPassword(e.target.value)}/></label><label>Новый пароль<input type="password" value={newPassword} onChange={e=>setNewPassword(e.target.value)}/></label><label>Повторите новый пароль<input type="password" value={repeatPassword} onChange={e=>setRepeatPassword(e.target.value)}/></label><button type="button" className="settings-primary" disabled={saving||!oldPassword||!newPassword||!repeatPassword} onClick={changePassword}>Изменить пароль</button><button type="button" className="settings-secondary" disabled={saving} onClick={resetPassword}>Не помню старый пароль</button></div>}</section>

    <section className="settings-card"><h2>Способы оплаты</h2>{methods.length===0?<p className="settings-empty">Способы оплаты не добавлены.</p>:methods.map(m=><div className="payment-row" key={m.id}><div><strong>{m.brand||'Карта'} •••• {m.last4||'••••'}</strong><small>{m.exp_month&&m.exp_year?`до ${String(m.exp_month).padStart(2,'0')}/${String(m.exp_year).slice(-2)}`:''}{m.is_default?' · Основная':''}</small></div><button type="button" onClick={()=>removeMethod(m.id)}>Отвязать</button></div>)}<button type="button" className="settings-secondary" onClick={()=>setMessage('Добавление новой карты будет подключено через платёжного провайдера. Данные карты приложение хранить не будет.')}>+ Добавить новую карту</button></section>

    <section className="settings-card"><h2>Уведомления</h2><div className="settings-group-title">Напоминания о тренировках</div><div className="toggle-row"><span>Пуш-уведомления</span><Switch checked={settings.workout_push} onChange={v=>persist({workout_push:v})}/></div><div className="toggle-row"><span>Уведомления по почте</span><Switch checked={settings.workout_email} onChange={v=>persist({workout_email:v})}/></div><div className="settings-group-title second">Акции и предложения</div><div className="toggle-row"><span>Пуш-уведомления</span><Switch checked={settings.promos_push} onChange={v=>persist({promos_push:v})}/></div><div className="toggle-row"><span>Уведомления по почте</span><Switch checked={settings.promos_email} onChange={v=>persist({promos_email:v})}/></div></section>

    <section className="settings-card"><h2>Приложение</h2><button className="settings-link" type="button" onClick={onOpenPlan}><span><strong>Подписка / Тариф</strong><small>{!planCode||planCode==='free'?'Тариф не подключен':planCode}</small></span><ArrowIcon/></button><label className="settings-select"><span>Единицы веса</span><select value={settings.weight_unit} onChange={e=>persist({weight_unit:e.target.value})}><option value="kg">Килограммы (кг)</option><option value="lb">Фунты (lb)</option></select></label><label className="settings-select"><span>Тема</span><select value={settings.theme} onChange={e=>persist({theme:e.target.value})}><option value="light">Светлая</option><option value="dark">Тёмная</option><option value="system">Как в системе</option></select></label><label className="settings-select"><span>Язык</span><select value={settings.language} onChange={e=>persist({language:e.target.value})}><option value="ru">Русский</option><option value="en">English</option></select></label><label className="settings-select"><span>Регион</span><select value={settings.region} onChange={e=>persist({region:e.target.value})}><option value="RU">Россия</option><option value="RS">Сербия</option><option value="KZ">Казахстан</option><option value="AE">ОАЭ</option><option value="US">США</option></select></label></section>
    {loading&&<div className="settings-loading">Загружаем настройки…</div>}{saving&&<div className="settings-saving">Сохраняем…</div>}
  </main></div>
}
