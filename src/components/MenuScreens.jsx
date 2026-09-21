import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import { loadPlanCatalog } from '../lib/subscription.js';
import { openBillingPortal, startCheckout } from '../lib/billing.js';
import '../menu-screens.css';

function BackIcon(){return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7"/></svg>}

function ScreenShell({title,onBack,children}){
  return <div className="menu-screen"><header className="menu-screen-topbar"><button className="menu-screen-back" type="button" onClick={onBack} aria-label="Назад"><BackIcon/></button><h1>{title}</h1><span/></header><main className="menu-screen-content">{children}</main></div>;
}

export function PlanScreen({planCode='free',subscription=null,onBack}){
  const [plans,setPlans]=useState([]);
  const [loading,setLoading]=useState(true);
  const [busy,setBusy]=useState('');
  const [message,setMessage]=useState('');
  useEffect(()=>{let active=true;loadPlanCatalog().then((items)=>{if(active)setPlans(items)}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[]);
  const active=planCode&&planCode!=='free'&&['active','trialing'].includes(subscription?.status||'active');
  const currentLabel=plans.find((item)=>item.code===planCode)?.name || (planCode==='free'?'Бесплатный':planCode);
  async function choosePlan(code){
    if(code==='free'||code===planCode)return;
    setBusy(code);setMessage('');
    try{await startCheckout(code)}catch(error){setMessage(error?.message||'Не удалось начать оплату.')}finally{setBusy('')}
  }
  async function manageBilling(){
    setBusy('portal');setMessage('');
    try{await openBillingPortal()}catch(error){setMessage(error?.message||'Не удалось открыть управление подпиской.')}finally{setBusy('')}
  }
  const featureLabels={workouts:'Тренировки',programs:'Программы',nutrition:'Питание',basic_statistics:'Базовая статистика',advanced_statistics:'Расширенная аналитика',cross_device_sync:'Синхронизация между устройствами',priority_support:'Приоритетная поддержка'};
  return <ScreenShell title="Подписка / Тариф" onBack={onBack}>
    <section className="menu-plan-hero"><span>Текущий тариф</span><strong>{currentLabel}</strong><p>{active?'Подписка активна. Управлять оплатой можно через платёжный кабинет.':'Основные функции доступны без подписки. Платные уровни готовы к подключению через платёжного провайдера.'}</p>{subscription?.currentPeriodEnd&&<small>Текущий период до {new Intl.DateTimeFormat('ru-RU',{day:'numeric',month:'long',year:'numeric'}).format(new Date(subscription.currentPeriodEnd))}</small>}</section>
    {loading?<section className="menu-card"><p>Загружаем тарифы…</p></section>:<section className="menu-plan-grid">{plans.map((plan)=>{const selected=plan.code===planCode;const features=Object.entries(plan.features||{}).filter(([,enabled])=>enabled);return <article className={`menu-card menu-plan-option${selected?' active':''}`} key={plan.code}><div className="menu-plan-option-head"><div><span>{selected?'Текущий':'Тариф'}</span><h2>{plan.name}</h2></div>{selected&&<b>✓</b>}</div><p>{plan.description}</p><div className="menu-plan-features">{features.map(([key])=><div className="menu-feature" key={key}>{featureLabels[key]||key}</div>)}</div>{plan.code!=='free'&&!selected&&<button className="menu-primary" type="button" disabled={Boolean(busy)} onClick={()=>choosePlan(plan.code)}>{busy===plan.code?'Открываем оплату…':'Выбрать тариф'}</button>}</article>})}</section>}
    {message&&<div className="support-status error">{message}</div>}
    {active&&<button className="menu-primary" type="button" disabled={Boolean(busy)} onClick={manageBilling}>{busy==='portal'?'Открываем…':'Управлять подпиской'}</button>}
  </ScreenShell>;
}

export function PrivacyPolicyScreen({onBack}){
  return <ScreenShell title="Политика конфиденциальности" onBack={onBack}><section className="menu-card policy-card"><p className="policy-date">Редакция от 9 сентября 2026 года</p><h2>Какие данные мы обрабатываем</h2><p>Для работы приложения могут обрабатываться данные аккаунта и профиля, контактные данные, настройки приложения, тренировочные программы, упражнения, результаты тренировок, замеры тела, фотографии прогресса, а также файлы, которые пользователь сам загружает в приложение.</p><h2>Для чего нужны данные</h2><p>Данные используются для авторизации, синхронизации между устройствами, отображения статистики и прогресса, работы расписания, сохранения пользовательских программ и упражнений, поддержки и обеспечения безопасности сервиса.</p><h2>Хранение и защита</h2><p>Доступ к персональным данным ограничивается учетной записью пользователя. Для пользовательских данных применяются правила разграничения доступа в базе данных и приватные хранилища файлов.</p><h2>Передача третьим лицам</h2><p>Мы не передаем персональные данные третьим лицам для самостоятельного маркетинга. Отдельные технические поставщики могут обрабатывать данные только в объеме, необходимом для работы инфраструктуры, авторизации, уведомлений, платежей или поддержки.</p><h2>Удаление данных</h2><p>Пользователь может удалить аккаунт из личного кабинета. При окончательном удалении аккаунта удаляются профиль и связанные с ним пользовательские данные, упражнения, программы, тренировочная история и пользовательские файлы в соответствии с реализованной логикой удаления.</p><h2>Уведомления и маркетинг</h2><p>Настройки тренировочных и маркетинговых уведомлений управляются пользователем в разделе «Настройки».</p><h2>Изменения политики</h2><p>Политика может обновляться по мере развития приложения. Актуальная версия всегда отображается в этом разделе.</p></section></ScreenShell>;
}

const TOPICS=['Проблема в приложении','Вопрос по тренировкам','Подписка и оплата','Аккаунт и вход','Предложение по улучшению','Другое'];

export function SupportScreen({user,onBack}){
  const [topic,setTopic]=useState(TOPICS[0]);
  const [email,setEmail]=useState(user?.email||'');
  const [message,setMessage]=useState('');
  const [status,setStatus]=useState('');
  const [sending,setSending]=useState(false);
  const canSend=useMemo(()=>topic&&/^\S+@\S+\.\S+$/.test(email.trim())&&message.trim().length>=3,[topic,email,message]);
  async function submit(event){
    event.preventDefault();
    if(!canSend||sending)return;
    setSending(true);setStatus('');
    const {error}=await supabase.from('support_requests').insert({user_id:user.id,topic:topic.trim(),reply_email:email.trim(),message:message.trim()});
    setSending(false);
    if(error){console.error('Unable to create support request:',error);setStatus('Не удалось отправить обращение. Попробуйте ещё раз.');return}
    setMessage('');setStatus('Обращение отправлено. Мы сохранили его в поддержке.');
  }
  return <ScreenShell title="Поддержка" onBack={onBack}><section className="menu-card support-intro"><h2>Напишите нам</h2><p>Опишите вопрос, проблему или предложение. Ответ придёт на указанную почту.</p></section><form className="menu-card support-form" onSubmit={submit}><label><span>Тема обращения</span><select value={topic} onChange={e=>setTopic(e.target.value)}>{TOPICS.map(item=><option key={item} value={item}>{item}</option>)}</select></label><label><span>Email для ответа</span><input type="email" inputMode="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@example.com"/></label><label><span>Ваш вопрос, проблема или предложение</span><textarea rows="7" maxLength="5000" value={message} onChange={e=>setMessage(e.target.value)} placeholder="Расскажите подробнее, что произошло или что вы хотите предложить"/></label>{status&&<div className={`support-status${status.startsWith('Не удалось')?' error':''}`}>{status}</div>}<button className="menu-primary" type="submit" disabled={!canSend||sending}>{sending?'Отправляем…':'Отправить обращение'}</button></form></ScreenShell>;
}

const FAQS=[
  ['Как перенести пропущенную тренировку?','Откройте нужную дату на главной, нажмите кнопку редактирования рядом с тренировкой и выберите новую дату. Можно перенести только одну тренировку или сдвинуть всё оставшееся расписание программы.'],
  ['Где посмотреть прогресс?','Откройте раздел «Статистика». Там доступны тренировки, показатели тела, фотографии прогресса и графики по выбранным периодам.'],
  ['Можно ли создать своё упражнение?','Да. В базе упражнений откройте «Мои упражнения» и создайте упражнение с названием, группой мышц и оборудованием. Описание и видео можно добавить дополнительно.'],
  ['Как изменить личные данные?','В личном кабинете нажмите карандаш в блоке «Личные данные». Там можно изменить имя, телефон, почту, дату рождения и фото профиля.'],
  ['Как изменить пароль?','Откройте «Настройки» → «Изменить пароль». Пароль можно поменять по старому паролю или запросить ссылку для восстановления на почту.'],
  ['Как управлять уведомлениями?','В «Настройках» можно отдельно включать push-уведомления и письма для напоминаний о тренировках и для акций и предложений.'],
  ['Как изменить единицы веса?','В «Настройках» выберите единицы веса по умолчанию: килограммы или фунты.'],
  ['Как удалить аккаунт?','В личном кабинете откройте блок «Аккаунт» и выберите удаление. Перед окончательным удалением приложение покажет, какие данные будут потеряны.'],
  ['Что происходит с данными после удаления аккаунта?','Удаляются профиль и связанные с ним пользовательские данные, собственные упражнения и программы, тренировочная история и пользовательские файлы, которые относятся к аккаунту.'],
];

export function FaqScreen({onBack}){
  const [open,setOpen]=useState(null);
  return <ScreenShell title="Частые вопросы" onBack={onBack}><section className="faq-list">{FAQS.map(([question,answer],index)=>{const expanded=open===index;return <div className={`faq-item${expanded?' open':''}`} key={question}><button type="button" className="faq-question" aria-expanded={expanded} onClick={()=>setOpen(expanded?null:index)}><span>{question}</span><b aria-hidden="true">{expanded?'−':'+'}</b></button>{expanded&&<div className="faq-answer">{answer}</div>}</div>})}</section></ScreenShell>;
}
