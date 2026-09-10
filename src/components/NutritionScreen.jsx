import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase.js';
import '../nutrition-screen.css';
import '../meal-plans.css';

const TABS = [
  { id: 'calculator', label: 'Калькулятор КБЖУ', icon: 'calculator' },
  { id: 'recipes', label: 'Рецепты', icon: 'recipes' },
  { id: 'plans', label: 'Готовые рационы', icon: 'plans' },
];

const ACTIVITY = [
  { id: 'low', label: 'Минимальная', factor: 1.2, text: 'Сидячий образ жизни, почти без тренировок' },
  { id: 'light', label: 'Лёгкая', factor: 1.375, text: '1–3 тренировки в неделю' },
  { id: 'moderate', label: 'Средняя', factor: 1.55, text: '3–5 тренировок в неделю' },
  { id: 'high', label: 'Высокая', factor: 1.725, text: '6–7 тренировок в неделю' },
  { id: 'very_high', label: 'Очень высокая', factor: 1.9, text: 'Тяжёлая нагрузка почти каждый день' },
];

const GOALS = [
  { id: 'cut', label: 'Сушка', calorieMultiplier: 0.8, protein: 2.2, fat: 0.8 },
  { id: 'loss', label: 'Похудение', calorieMultiplier: 0.85, protein: 1.8, fat: 0.8 },
  { id: 'maintain', label: 'Поддержание', calorieMultiplier: 1, protein: 1.6, fat: 0.9 },
  { id: 'gain', label: 'Набор', calorieMultiplier: 1.1, protein: 1.8, fat: 1 },
];

function BackIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>;
}

function TabIcon({ type }) {
  if (type === 'calculator') return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="7" y="4" width="18" height="24" rx="3"/><path d="M11 8h10v5H11zM11 18h3M12.5 16.5v3M18 17h4M18 21h4M11 24l3-3M14 24l-3-3"/></svg>;
  if (type === 'recipes') return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 5h14a2 2 0 0 1 2 2v20H9a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z"/><path d="M11 10h9M11 15h8M11 20h10M18 5v-2M22 5V3"/></svg>;
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M6 22h20M8 22c0-7 3-11 8-11s8 4 8 11M16 11V8M13 8h6"/><path d="M5 24h22"/></svg>;
}

function NutritionBottomNav() {
  return <nav className="bottom-nav nutrition-bottom-nav" aria-label="Основная навигация">
    <button className="nav-item" data-screen="training" type="button"><svg viewBox="0 0 32 32" fill="none" strokeWidth="1.8"><path d="m8 20 12-12M7 16l9 9M5 19l8 8M19 5l8 8M16 7l9 9"/><path d="m4 21 7 7M21 4l7 7"/></svg><span>Тренировки</span></button>
    <button className="nav-item" data-screen="statistics" type="button"><svg viewBox="0 0 32 32" fill="none" strokeWidth="1.7"><rect x="5" y="16" width="4" height="10" rx="1"/><rect x="14" y="7" width="4" height="19" rx="1"/><rect x="23" y="12" width="4" height="14" rx="1"/></svg><span>Статистика</span></button>
    <button className="nav-item home" data-screen="home" type="button"><span className="home-circle"><svg viewBox="0 0 32 32" fill="none"><path d="m5 15 11-10 11 10v12H19v-8h-6v8H5V15Z"/></svg></span><span>Главная</span></button>
    <button className="nav-item nutrition-nav-active" type="button"><svg viewBox="0 0 32 32" fill="none" strokeWidth="1.6"><path d="M9 5v9M6 5v6c0 2 1.2 3 3 3s3-1 3-3V5M9 14v13M21 5v22M21 5c4 3 4 9 0 12"/></svg><span>Питание</span></button>
    <button className="nav-item" data-screen="sportpit" type="button"><svg viewBox="0 0 32 32" fill="none" strokeWidth="1.5"><path d="M10 7h12l2 5-2 13H10L8 12l2-5Z"/><path d="M12 7V4h8v3M11 15h10M15 12v6M12 15h6"/></svg><span>СпортПит</span></button>
  </nav>;
}

function ageFromBirthDate(value) {
  if (!value) return null;
  const birth = new Date(`${value}T12:00:00`);
  if (Number.isNaN(birth.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday = now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age > 0 ? age : null;
}

function calculateMacros({ sex, height, weight, activity, goal, age }) {
  const activityData = ACTIVITY.find((item) => item.id === activity);
  const goalData = GOALS.find((item) => item.id === goal);
  const w = Number(weight); const h = Number(height); const a = Number(age);
  if (!activityData || !goalData || !w || !h || !a) return null;
  const bmr = 10 * w + 6.25 * h - 5 * a + (sex === 'male' ? 5 : -161);
  const maintenance = bmr * activityData.factor;
  const calories = Math.max(1200, Math.round(maintenance * goalData.calorieMultiplier));
  const protein = Math.round(w * goalData.protein);
  const fat = Math.round(w * goalData.fat);
  const carbs = Math.max(0, Math.round((calories - protein * 4 - fat * 9) / 4));
  return { calories, protein, fat, carbs };
}

function RecipeCard({ recipe, onOpen }) {
  return <button type="button" className="recipe-card" onClick={() => onOpen(recipe)}>
    <span className="recipe-card-image">{recipe.image_url ? <img src={recipe.image_url} alt="" loading="lazy" /> : <span className="recipe-image-placeholder" />}</span>
    <span className="recipe-card-copy"><strong>{recipe.title}</strong><span className="recipe-tags"><b>{recipe.meal_type}</b><b>{recipe.goal}</b><b>{recipe.calories} ккал</b></span><small>Б {Number(recipe.protein_g)} · Ж {Number(recipe.fat_g)} · У {Number(recipe.carbs_g)}</small></span>
    <span className="recipe-card-arrow" aria-hidden="true">›</span>
  </button>;
}

function RecipeDetails({ recipe, onBack }) {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  return <div className="nutrition-screen recipe-detail-screen">
    <header className="recipe-detail-topbar"><button type="button" className="recipe-detail-back" onClick={onBack} aria-label="Назад к рецептам"><BackIcon /></button><strong>Рецепт</strong><span /></header>
    <main className="recipe-detail-content">
      <div className="recipe-hero-image">{recipe.image_url ? <img src={recipe.image_url} alt={recipe.title} /> : <span className="recipe-image-placeholder" />}</div>
      <div className="recipe-detail-title"><span>{recipe.meal_type} · {recipe.prep_minutes ? `${recipe.prep_minutes} мин` : 'быстрый рецепт'}</span><h1>{recipe.title}</h1></div>
      <section className="recipe-macros"><div><strong>{recipe.calories}</strong><span>ккал</span></div><div><strong>{Number(recipe.protein_g)} г</strong><span>Белки</span></div><div><strong>{Number(recipe.fat_g)} г</strong><span>Жиры</span></div><div><strong>{Number(recipe.carbs_g)} г</strong><span>Углеводы</span></div></section>
      <section className="nutrition-card recipe-section"><h2>Ингредиенты</h2><ul>{ingredients.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></section>
      <section className="nutrition-card recipe-section"><h2>Приготовление</h2><ol>{steps.map((item, index) => <li key={`${index}-${item}`}><span>{index + 1}</span><p>{item}</p></li>)}</ol></section>
    </main>
  </div>;
}

function MealPlanCard({ plan, onOpen }) {
  return <button type="button" className="meal-plan-card" onClick={() => onOpen(plan)}>
    <span className="meal-plan-card-image">{plan.image_url ? <img src={plan.image_url} alt="" loading="lazy" /> : <span className="recipe-image-placeholder" />}</span>
    <span className="meal-plan-card-copy"><strong>{plan.title}</strong><span className="meal-plan-tags"><b>{plan.goal}</b><b>{plan.calories_per_day} ккал / день</b></span><small>{plan.short_description}</small></span>
    <span className="meal-plan-card-arrow" aria-hidden="true">›</span>
  </button>;
}

function MealPlanDetails({ plan, meals, onBack }) {
  const [index, setIndex] = useState(0);
  useEffect(() => setIndex(0), [plan.id]);
  const meal = meals[index];
  if (!meal) return <div className="nutrition-screen meal-plan-detail-screen"><header className="recipe-detail-topbar"><button type="button" className="recipe-detail-back" onClick={onBack}><BackIcon /></button><strong>{plan.title}</strong><span /></header><main className="meal-plan-detail-content"><div className="recipe-state">В этом рационе пока нет блюд.</div></main></div>;
  const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : [];
  const steps = Array.isArray(meal.steps) ? meal.steps : [];
  return <div className="nutrition-screen meal-plan-detail-screen">
    <header className="recipe-detail-topbar"><button type="button" className="recipe-detail-back" onClick={onBack} aria-label="Назад к рационам"><BackIcon /></button><strong>{plan.title}</strong><span /></header>
    <main className="meal-plan-detail-content">
      <div className="meal-plan-progress"><span>Приём пищи {index + 1} из {meals.length}</span><div><i style={{ width: `${((index + 1) / meals.length) * 100}%` }} /></div></div>
      <div className="recipe-hero-image">{meal.image_url ? <img src={meal.image_url} alt={meal.title} /> : <span className="recipe-image-placeholder" />}</div>
      <div className="recipe-detail-title"><span>{meal.meal_type}</span><h1>{meal.title}</h1></div>
      <section className="recipe-macros"><div><strong>{meal.calories}</strong><span>ккал</span></div><div><strong>{Number(meal.protein_g)} г</strong><span>Белки</span></div><div><strong>{Number(meal.fat_g)} г</strong><span>Жиры</span></div><div><strong>{Number(meal.carbs_g)} г</strong><span>Углеводы</span></div></section>
      <section className="nutrition-card recipe-section"><h2>Ингредиенты</h2><ul>{ingredients.map((item, ingredientIndex) => <li key={`${ingredientIndex}-${item}`}>{item}</li>)}</ul></section>
      <section className="nutrition-card recipe-section"><h2>Приготовление</h2><ol>{steps.map((item, stepIndex) => <li key={`${stepIndex}-${item}`}><span>{stepIndex + 1}</span><p>{item}</p></li>)}</ol></section>
      <div className="meal-plan-step-nav"><button type="button" className="secondary" disabled={index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}>← Предыдущий</button><button type="button" className="primary" disabled={index === meals.length - 1} onClick={() => setIndex((current) => Math.min(meals.length - 1, current + 1))}>Следующий →</button></div>
      <div className="meal-plan-meal-dots" aria-label="Приёмы пищи">{meals.map((item, mealIndex) => <button key={item.id} type="button" className={mealIndex === index ? 'active' : ''} onClick={() => setIndex(mealIndex)} aria-label={`Открыть ${item.meal_type}`}>{mealIndex + 1}</button>)}</div>
    </main>
  </div>;
}

export function NutritionScreen({ user, profile }) {
  const [tab, setTab] = useState('calculator');
  const [form, setForm] = useState({ sex: '', height: '', weight: '', activity: '', goal: '', age: '' });
  const [result, setResult] = useState(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [recipes, setRecipes] = useState([]);
  const [recipesLoading, setRecipesLoading] = useState(false);
  const [recipesError, setRecipesError] = useState('');
  const [selectedRecipe, setSelectedRecipe] = useState(null);
  const [mealPlans, setMealPlans] = useState([]);
  const [mealPlansLoading, setMealPlansLoading] = useState(false);
  const [mealPlansError, setMealPlansError] = useState('');
  const [selectedMealPlan, setSelectedMealPlan] = useState(null);
  const [selectedMealPlanMeals, setSelectedMealPlanMeals] = useState([]);

  useEffect(() => {
    const profileAge = ageFromBirthDate(profile?.birth_date);
    setForm((current) => ({ ...current, sex: profile?.sex || current.sex, height: profile?.height_cm ? String(profile.height_cm) : current.height, weight: profile?.weight_kg ? String(profile.weight_kg) : current.weight, activity: profile?.activity_level || current.activity, age: profileAge ? String(profileAge) : current.age }));
  }, [profile?.sex, profile?.height_cm, profile?.weight_kg, profile?.activity_level, profile?.birth_date]);

  useEffect(() => {
    if (tab !== 'recipes' || recipes.length > 0) return undefined;
    let active = true; setRecipesLoading(true); setRecipesError('');
    supabase.from('recipes').select('id,slug,title,image_url,meal_type,goal,calories,protein_g,fat_g,carbs_g,prep_minutes,ingredients,steps,sort_order').eq('is_active', true).order('sort_order', { ascending: true }).then(({ data, error }) => {
      if (!active) return;
      if (error) { console.error('Unable to load recipes:', error); setRecipesError('Не удалось загрузить рецепты.'); } else setRecipes(data || []);
      setRecipesLoading(false);
    });
    return () => { active = false; };
  }, [tab, recipes.length]);

  useEffect(() => {
    if (tab !== 'plans' || mealPlans.length > 0) return undefined;
    let active = true; setMealPlansLoading(true); setMealPlansError('');
    supabase.from('meal_plans').select('id,slug,title,image_url,goal,calories_per_day,short_description,sort_order').eq('is_active', true).order('sort_order', { ascending: true }).then(({ data, error }) => {
      if (!active) return;
      if (error) { console.error('Unable to load meal plans:', error); setMealPlansError('Не удалось загрузить готовые рационы.'); } else setMealPlans(data || []);
      setMealPlansLoading(false);
    });
    return () => { active = false; };
  }, [tab, mealPlans.length]);

  const canCalculate = useMemo(() => Boolean(['male', 'female'].includes(form.sex) && Number(form.height) > 0 && Number(form.weight) > 0 && Number(form.age) > 0 && form.activity && form.goal), [form]);

  function update(key, value) { setForm((current) => ({ ...current, [key]: value })); setResult(null); setMessage(''); }
  function runCalculation() { const next = calculateMacros(form); setResult(next); setMessage(next ? '' : 'Заполните все поля для расчёта.'); }

  async function saveResult() {
    if (!result || saving) return;
    setSaving(true); setMessage('');
    const payload = { user_id: user.id, sex: form.sex, height_cm: Number(form.height), weight_kg: Number(form.weight), age: Number(form.age), activity_level: form.activity, goal: form.goal, calories: result.calories, protein_g: result.protein, fat_g: result.fat, carbs_g: result.carbs, is_active: true, updated_at: new Date().toISOString() };
    const { error } = await supabase.from('nutrition_targets').upsert(payload, { onConflict: 'user_id' });
    setSaving(false);
    if (error) { console.error('Unable to save nutrition target:', error); setMessage('Не удалось сохранить расчёт.'); return; }
    window.dispatchEvent(new CustomEvent('gym-nutrition-updated', { detail: payload }));
    setMessage('КБЖУ сохранены. Они уже доступны на Главной.');
  }

  async function openMealPlan(plan) {
    setMealPlansError('');
    const { data, error } = await supabase.from('meal_plan_meals').select('id,meal_order,meal_type,title,image_url,calories,protein_g,fat_g,carbs_g,ingredients,steps').eq('meal_plan_id', plan.id).order('meal_order', { ascending: true });
    if (error) { console.error('Unable to load meal plan meals:', error); setMealPlansError('Не удалось открыть рацион.'); return; }
    setSelectedMealPlanMeals(data || []);
    setSelectedMealPlan(plan);
  }

  function changeTab(next) { setTab(next); setSelectedRecipe(null); setSelectedMealPlan(null); }

  if (selectedRecipe) return <RecipeDetails recipe={selectedRecipe} onBack={() => setSelectedRecipe(null)} />;
  if (selectedMealPlan) return <MealPlanDetails plan={selectedMealPlan} meals={selectedMealPlanMeals} onBack={() => { setSelectedMealPlan(null); setSelectedMealPlanMeals([]); }} />;

  return <div className="nutrition-screen">
    <header className="nutrition-topbar"><div className="nutrition-brand">Питание</div><span className="nutrition-topbar-spacer" /></header>
    <main className="nutrition-content">
      <div className="nutrition-tabs" role="tablist" aria-label="Разделы питания">{TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => changeTab(item.id)}><span className="nutrition-tab-icon"><TabIcon type={item.icon} /></span><span className="nutrition-tab-label">{item.label}</span></button>)}</div>

      {tab === 'calculator' && <section className="nutrition-calculator"><div className="nutrition-intro"><span>Персональный расчёт</span><h1>Калькулятор КБЖУ</h1><p>Помогает оценить суточную потребность в калориях, белках, жирах и углеводах с учётом параметров тела, активности и вашей цели.</p></div>
        <section className="nutrition-card"><h2>Ваши данные</h2><div className="nutrition-segment"><button type="button" className={form.sex === 'male' ? 'active' : ''} onClick={() => update('sex', 'male')}>Мужской</button><button type="button" className={form.sex === 'female' ? 'active' : ''} onClick={() => update('sex', 'female')}>Женский</button></div><div className="nutrition-grid"><label>Рост, см<input type="number" min="120" max="230" value={form.height} onChange={(e) => update('height', e.target.value)} /></label><label>Вес, кг<input type="number" min="30" max="350" step="0.1" value={form.weight} onChange={(e) => update('weight', e.target.value)} /></label></div><label className="nutrition-field">Возраст<input type="number" min="16" max="100" value={form.age} onChange={(e) => update('age', e.target.value)} /><small>{profile?.birth_date ? 'Подставлен автоматически из даты рождения. Можно изменить для этого расчёта.' : 'Возраст нужен для корректного расчёта основного обмена.'}</small></label><label className="nutrition-field">Дневная активность<select value={form.activity} onChange={(e) => update('activity', e.target.value)}><option value="">Выберите активность</option>{ACTIVITY.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.text}</option>)}</select></label></section>
        <section className="nutrition-card"><h2>Цель</h2><div className="nutrition-goals">{GOALS.map((item) => <button type="button" key={item.id} className={form.goal === item.id ? 'active' : ''} onClick={() => update('goal', item.id)}>{item.label}</button>)}</div></section>
        {!result && <button className="nutrition-calc-button" type="button" disabled={!canCalculate} onClick={runCalculation}>Рассчитать</button>}
        {result && <section className="nutrition-result"><span className="nutrition-result-kicker">Ваша дневная цель</span><strong className="nutrition-calories">{result.calories}<small> ккал</small></strong><div className="nutrition-macros"><div><strong>{result.protein} г</strong><span>Белки</span></div><div><strong>{result.fat} г</strong><span>Жиры</span></div><div><strong>{result.carbs} г</strong><span>Углеводы</span></div></div><p>Расчёт — ориентир, а не медицинская рекомендация. Фактическая потребность может отличаться.</p><button type="button" className="nutrition-save" disabled={saving} onClick={saveResult}>{saving ? 'Сохраняем…' : 'Сохранить КБЖУ'}</button><button type="button" className="nutrition-reset" onClick={() => { setResult(null); setMessage(''); }}>Не сохранять и пересчитать</button></section>}
        {message && <div className="nutrition-message" role="status">{message}</div>}
      </section>}

      {tab === 'recipes' && <section className="recipe-catalog"><div className="recipe-catalog-head"><div><span>Каталог</span><h1>Рецепты</h1></div><strong>{recipes.length}</strong></div>{recipesLoading && <div className="recipe-state">Загружаем рецепты…</div>}{recipesError && <div className="recipe-state error">{recipesError}</div>}{!recipesLoading && !recipesError && recipes.length === 0 && <div className="recipe-state">Рецептов пока нет.</div>}<div className="recipe-list">{recipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} onOpen={setSelectedRecipe} />)}</div></section>}

      {tab === 'plans' && <section className="meal-plan-catalog"><div className="meal-plan-catalog-head"><div><span>Каталог</span><h1>Готовые рационы</h1></div><strong>{mealPlans.length}</strong></div>{mealPlansLoading && <div className="recipe-state">Загружаем рационы…</div>}{mealPlansError && <div className="recipe-state error">{mealPlansError}</div>}{!mealPlansLoading && !mealPlansError && mealPlans.length === 0 && <div className="recipe-state">Рационов пока нет.</div>}<div className="meal-plan-list">{mealPlans.map((plan) => <MealPlanCard key={plan.id} plan={plan} onOpen={openMealPlan} />)}</div></section>}
    </main>
    <NutritionBottomNav />
  </div>;
}
