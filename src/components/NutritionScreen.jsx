import { useEffect, useMemo, useRef, useState } from 'react';
import { RootSectionHeader } from './RootSectionHeader.jsx';
import { nutritionImageSrc } from '../lib/nutritionImages.js';
import { calculateNutrition } from '../lib/nutritionCalculator.js';
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
  { id: 'cut', label: 'Сушка', defaultPercent: '20' },
  { id: 'loss', label: 'Похудение', defaultPercent: '15' },
  { id: 'maintain', label: 'Поддержание', defaultPercent: '0' },
  { id: 'gain', label: 'Набор', defaultPercent: '10' },
];

const EMPTY_RECIPE_FILTERS = { mealType: '', goal: '', minCalories: '', maxCalories: '' };
const EMPTY_PLAN_FILTERS = { goal: '', minCalories: '', maxCalories: '' };

function BackIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="m15 5-7 7 7 7" /></svg>;
}

function FilterIcon() {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M4 6h16M7 12h10M10 18h4" /></svg>;
}

function HeartIcon({ filled = false }) {
  return <svg viewBox="0 0 24 24" fill={filled ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="1.8" aria-hidden="true"><path d="M20.8 4.9a5.4 5.4 0 0 0-7.6 0L12 6.1l-1.2-1.2a5.4 5.4 0 1 0-7.6 7.6L12 21l8.8-8.5a5.4 5.4 0 0 0 0-7.6Z" /></svg>;
}

function TabIcon({ type }) {
  if (type === 'calculator') return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="7" y="4" width="18" height="24" rx="3"/><path d="M11 8h10v5H11zM11 18h3M12.5 16.5v3M18 17h4M18 21h4M11 24l3-3M14 24l-3-3"/></svg>;
  if (type === 'recipes') return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M9 5h14a2 2 0 0 1 2 2v20H9a3 3 0 0 1-3-3V8a3 3 0 0 1 3-3Z"/><path d="M11 10h9M11 15h8M11 20h10M18 5v-2M22 5V3"/></svg>;
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><path d="M6 22h20M8 22c0-7 3-11 8-11s8 4 8 11M16 11V8M13 8h6"/><path d="M5 24h22"/></svg>;
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

function caloriesMatch(value, min, max) {
  const calories = Number(value);
  return (!min || calories >= Number(min)) && (!max || calories <= Number(max));
}

function FavoriteButton({ active, onClick, label }) {
  return <button type="button" className={`catalog-card-favorite${active ? ' active' : ''}`} aria-label={active ? `Убрать из избранного: ${label}` : `Добавить в избранное: ${label}`} aria-pressed={active} onClick={onClick}><HeartIcon filled={active} /></button>;
}

function NutritionPhoto({ url, alt = '', loading = 'lazy' }) {
  const resolved = nutritionImageSrc(url);
  const [source, setSource] = useState(resolved);
  useEffect(() => setSource(resolved), [resolved]);
  return source
    ? <img src={source} alt={alt} loading={loading} decoding="async" onError={() => setSource(null)} />
    : <span className="recipe-image-placeholder" aria-hidden="true" />;
}

function RecipeCard({ recipe, onOpen, favorite, onToggleFavorite }) {
  return <div className="recipe-card-shell">
    <button type="button" className="recipe-card" onClick={() => onOpen(recipe)}>
      <span className="recipe-card-image"><NutritionPhoto url={recipe.image_url} /></span>
      <span className="recipe-card-copy"><strong>{recipe.title}</strong><span className="recipe-tags"><b>{recipe.meal_type}</b><b>{recipe.goal}</b><b>{recipe.calories} ккал</b></span><small>Б {Number(recipe.protein_g)} · Ж {Number(recipe.fat_g)} · У {Number(recipe.carbs_g)}</small></span>
    </button>
    <FavoriteButton active={favorite} label={recipe.title} onClick={() => onToggleFavorite('recipe', recipe.id)} />
  </div>;
}

function RecipeDetails({ recipe, onBack }) {
  const ingredients = Array.isArray(recipe.ingredients) ? recipe.ingredients : [];
  const steps = Array.isArray(recipe.steps) ? recipe.steps : [];
  return <div className="nutrition-screen recipe-detail-screen">
    <header className="recipe-detail-topbar"><button type="button" className="recipe-detail-back" onClick={onBack} aria-label="Назад к рецептам"><BackIcon /></button><strong>Рецепт</strong><span /></header>
    <main className="recipe-detail-content">
      <div className="recipe-hero-image"><NutritionPhoto url={recipe.image_url} alt={recipe.title} loading="eager" /></div>
      <div className="recipe-detail-title"><span>{recipe.meal_type} · {recipe.prep_minutes ? `${recipe.prep_minutes} мин` : 'быстрый рецепт'}</span><h1>{recipe.title}</h1></div>
      <section className="recipe-macros"><div><strong>{recipe.calories}</strong><span>ккал</span></div><div><strong>{Number(recipe.protein_g)} г</strong><span>Белки</span></div><div><strong>{Number(recipe.fat_g)} г</strong><span>Жиры</span></div><div><strong>{Number(recipe.carbs_g)} г</strong><span>Углеводы</span></div></section>
      <section className="nutrition-card recipe-section"><h2>Ингредиенты</h2><ul>{ingredients.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul></section>
      <section className="nutrition-card recipe-section"><h2>Приготовление</h2><ol>{steps.map((item, index) => <li key={`${index}-${item}`}><span>{index + 1}</span><p>{item}</p></li>)}</ol></section>
    </main>
  </div>;
}

function MealPlanCard({ plan, onOpen, favorite, onToggleFavorite }) {
  return <div className="meal-plan-card-shell">
    <button type="button" className="meal-plan-card" onClick={() => onOpen(plan)}>
      <span className="meal-plan-card-image"><NutritionPhoto url={plan.image_url} /></span>
      <span className="meal-plan-card-copy"><strong>{plan.title}</strong><span className="meal-plan-tags"><b>{plan.goal}</b><b>{plan.calories_per_day} ккал / день</b></span></span>
    </button>
    <FavoriteButton active={favorite} label={plan.title} onClick={() => onToggleFavorite('meal_plan', plan.id)} />
  </div>;
}

export function mealSwipeTarget(startX, startY, endX, endY, count, index) {
  const deltaX = endX - startX;
  const deltaY = Math.abs(endY - startY);
  if (count < 2 || Math.abs(deltaX) < 55 || Math.abs(deltaX) < deltaY * 1.25) return index;
  return Math.min(count - 1, Math.max(0, index + (deltaX < 0 ? 1 : -1)));
}

function MealPlanDetails({ plan, meals, onBack }) {
  const [index, setIndex] = useState(0);
  const swipeStart = useRef(null);
  useEffect(() => setIndex(0), [plan.id]);

  function onMealImageTouchStart(event) {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    // Give the application's left-edge Back gesture precedence.
    const screenLeft = event.currentTarget.closest('.meal-plan-detail-screen')?.getBoundingClientRect().left ?? 0;
    swipeStart.current = touch.clientX - screenLeft <= 48 ? null : { x: touch.clientX, y: touch.clientY };
  }
  function onMealImageTouchEnd(event) {
    const start = swipeStart.current;
    swipeStart.current = null;
    if (!start || event.changedTouches.length !== 1) return;
    const touch = event.changedTouches[0];
    setIndex(current => mealSwipeTarget(start.x, start.y, touch.clientX, touch.clientY, meals.length, current));
  }
  const meal = meals[index];
  if (!meal) return <div className="nutrition-screen meal-plan-detail-screen"><header className="recipe-detail-topbar"><button type="button" className="recipe-detail-back" onClick={onBack}><BackIcon /></button><strong>{plan.title}</strong><span /></header><main className="meal-plan-detail-content"><div className="recipe-state">В этом рационе пока нет блюд.</div></main></div>;
  const ingredients = Array.isArray(meal.ingredients) ? meal.ingredients : [];
  const steps = Array.isArray(meal.steps) ? meal.steps : [];
  return <div className="nutrition-screen meal-plan-detail-screen">
    <header className="recipe-detail-topbar"><button type="button" className="recipe-detail-back" onClick={onBack} aria-label="Назад к рационам"><BackIcon /></button><strong>{plan.title}</strong><span /></header>
    <main className="meal-plan-detail-content">
      <div className="meal-plan-progress"><span>Приём пищи {index + 1} из {meals.length}</span><div><i style={{ width: `${((index + 1) / meals.length) * 100}%` }} /></div></div>
      <div className="recipe-hero-image meal-plan-swipe-image" onTouchStart={onMealImageTouchStart} onTouchEnd={onMealImageTouchEnd} onTouchCancel={() => { swipeStart.current = null; }} aria-label="Фото блюда. Листайте влево и вправо, чтобы переключать приёмы пищи"><NutritionPhoto url={meal.image_url} alt={meal.title} loading="eager" /></div>
      <div className="recipe-detail-title"><span>{meal.meal_type}</span><h1>{meal.title}</h1></div>
      <section className="recipe-macros"><div><strong>{meal.calories}</strong><span>ккал</span></div><div><strong>{Number(meal.protein_g)} г</strong><span>Белки</span></div><div><strong>{Number(meal.fat_g)} г</strong><span>Жиры</span></div><div><strong>{Number(meal.carbs_g)} г</strong><span>Углеводы</span></div></section>
      <section className="nutrition-card recipe-section"><h2>Ингредиенты</h2><ul>{ingredients.map((item, ingredientIndex) => <li key={`${ingredientIndex}-${item}`}>{item}</li>)}</ul></section>
      <section className="nutrition-card recipe-section"><h2>Приготовление</h2><ol>{steps.map((item, stepIndex) => <li key={`${stepIndex}-${item}`}><span>{stepIndex + 1}</span><p>{item}</p></li>)}</ol></section>
      <div className="meal-plan-step-nav"><button type="button" className="secondary" disabled={index === 0} onClick={() => setIndex((current) => Math.max(0, current - 1))}>← Предыдущий</button><button type="button" className="primary" disabled={index === meals.length - 1} onClick={() => setIndex((current) => Math.min(meals.length - 1, current + 1))}>Следующий →</button></div>
      <div className="meal-plan-meal-dots" aria-label="Приёмы пищи">{meals.map((item, mealIndex) => <button key={item.id} type="button" className={mealIndex === index ? 'active' : ''} onClick={() => setIndex(mealIndex)} aria-label={`Открыть ${item.meal_type}`}>{mealIndex + 1}</button>)}</div>
    </main>
  </div>;
}

function CatalogToolbar({ filterOpen, setFilterOpen, favoritesOnly, setFavoritesOnly, activeFilterCount }) {
  return <div className="catalog-toolbar">
    <button type="button" className={`catalog-tool-button${filterOpen || activeFilterCount ? ' active' : ''}`} title="Фильтры" aria-label={`Фильтры${activeFilterCount ? `, применено: ${activeFilterCount}` : ''}`} onClick={() => setFilterOpen((value) => !value)} aria-expanded={filterOpen}><FilterIcon /></button>
    <button type="button" className={`catalog-tool-button${favoritesOnly ? ' active' : ''}`} title="Избранное" aria-label="Только избранное" onClick={() => setFavoritesOnly((value) => !value)} aria-pressed={favoritesOnly}><HeartIcon filled={favoritesOnly} /></button>
  </div>;
}

function RecipeFilters({ value, onChange, mealTypes, goals, onReset }) {
  return <section className="catalog-filter-panel">
    <label><span>Приём пищи</span><select value={value.mealType} onChange={(event) => onChange({ ...value, mealType: event.target.value })}><option value="">Все</option>{mealTypes.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <label><span>Цель</span><select value={value.goal} onChange={(event) => onChange({ ...value, goal: event.target.value })}><option value="">Все</option>{goals.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <div className="catalog-calorie-row"><label><span>Ккал от</span><input inputMode="numeric" type="number" min="0" placeholder="0" value={value.minCalories} onChange={(event) => onChange({ ...value, minCalories: event.target.value })} /></label><label><span>Ккал до</span><input inputMode="numeric" type="number" min="0" placeholder="Без лимита" value={value.maxCalories} onChange={(event) => onChange({ ...value, maxCalories: event.target.value })} /></label></div>
    <button type="button" className="catalog-filter-reset" onClick={onReset}>Сбросить фильтры</button>
  </section>;
}

function MealPlanFilters({ value, onChange, goals, onReset }) {
  return <section className="catalog-filter-panel">
    <label><span>Цель</span><select value={value.goal} onChange={(event) => onChange({ ...value, goal: event.target.value })}><option value="">Все</option>{goals.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
    <div className="catalog-calorie-row"><label><span>Ккал от</span><input inputMode="numeric" type="number" min="0" placeholder="0" value={value.minCalories} onChange={(event) => onChange({ ...value, minCalories: event.target.value })} /></label><label><span>Ккал до</span><input inputMode="numeric" type="number" min="0" placeholder="Без лимита" value={value.maxCalories} onChange={(event) => onChange({ ...value, maxCalories: event.target.value })} /></label></div>
    <button type="button" className="catalog-filter-reset" onClick={onReset}>Сбросить фильтры</button>
  </section>;
}

export function NutritionScreen({ user, profile, refreshKey = 0 }) {
  const [tab, setTab] = useState('calculator');
  const [form, setForm] = useState({ sex: '', height: '', weight: '', activity: '', goal: '', age: '', adjustmentPercent: '0', proteinPercent: '25', fatPercent: '25', carbsPercent: '50' });
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
  const [favorites, setFavorites] = useState(() => new Set());
  const [favoriteBusy, setFavoriteBusy] = useState(() => new Set());
  const [recipeFilterOpen, setRecipeFilterOpen] = useState(false);
  const [planFilterOpen, setPlanFilterOpen] = useState(false);
  const [recipeFavoritesOnly, setRecipeFavoritesOnly] = useState(false);
  const [planFavoritesOnly, setPlanFavoritesOnly] = useState(false);
  const [recipeFilters, setRecipeFilters] = useState(EMPTY_RECIPE_FILTERS);
  const [planFilters, setPlanFilters] = useState(EMPTY_PLAN_FILTERS);

  useEffect(() => {
    const profileAge = ageFromBirthDate(profile?.birth_date);
    setForm((current) => ({ ...current, sex: profile?.sex || current.sex, height: profile?.height_cm ? String(profile.height_cm) : current.height, weight: profile?.weight_kg ? String(profile.weight_kg) : current.weight, activity: profile?.activity_level || current.activity, age: profileAge ? String(profileAge) : current.age }));
  }, [profile?.sex, profile?.height_cm, profile?.weight_kg, profile?.activity_level, profile?.birth_date]);

  useEffect(() => {
    if (!user?.id) return undefined;
    let active = true;
    supabase.from('nutrition_favorites').select('entity_type,entity_id').eq('user_id', user.id).then(({ data, error }) => {
      if (!active) return;
      if (error) console.error('Unable to load nutrition favorites:', error);
      else setFavorites(new Set((data || []).map((row) => `${row.entity_type}:${row.entity_id}`)));
    });
    return () => { active = false; };
  }, [user?.id, refreshKey]);

  useEffect(() => {
    if (tab !== 'recipes') return undefined;
    let active = true;
    if (!recipes.length) setRecipesLoading(true);
    setRecipesError('');
    supabase.from('recipes').select('id,slug,title,image_url,meal_type,goal,calories,protein_g,fat_g,carbs_g,prep_minutes,ingredients,steps,sort_order').eq('is_active', true).order('sort_order', { ascending: true }).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error('Unable to load recipes:', error);
        setRecipesError('Не удалось загрузить рецепты.');
      } else {
        setRecipes(data || []);
        setSelectedRecipe(current => current ? (data || []).find(row => row.id === current.id) || current : null);
      }
      setRecipesLoading(false);
      if (refreshKey > 0) window.dispatchEvent(new CustomEvent('gym-nutrition-refresh-complete', { detail: { refreshKey } }));
    });
    return () => { active = false; };
  }, [tab, refreshKey]);

  useEffect(() => {
    if (tab !== 'plans') return undefined;
    let active = true;
    if (!mealPlans.length) setMealPlansLoading(true);
    setMealPlansError('');
    supabase.from('meal_plans').select('id,slug,title,image_url,goal,calories_per_day,short_description,sort_order').eq('is_active', true).order('sort_order', { ascending: true }).then(({ data, error }) => {
      if (!active) return;
      if (error) {
        console.error('Unable to load meal plans:', error);
        setMealPlansError('Не удалось загрузить готовые рационы.');
      } else {
        setMealPlans(data || []);
        setSelectedMealPlan(current => current ? (data || []).find(row => row.id === current.id) || current : null);
      }
      setMealPlansLoading(false);
      if (refreshKey > 0) window.dispatchEvent(new CustomEvent('gym-nutrition-refresh-complete', { detail: { refreshKey } }));
    });
    return () => { active = false; };
  }, [tab, refreshKey]);

  useEffect(() => {
    if (tab === 'calculator' && refreshKey > 0) {
      window.dispatchEvent(new CustomEvent('gym-nutrition-refresh-complete', { detail: { refreshKey } }));
    }
  }, [tab, refreshKey]);

  // An open meal-plan detail remains mounted while its meal data is refreshed.
  useEffect(() => {
    if (!selectedMealPlan?.id || refreshKey === 0) return undefined;
    let active = true;
    supabase.from('meal_plan_meals')
      .select('id,meal_order,meal_type,title,image_url,calories,protein_g,fat_g,carbs_g,ingredients,steps')
      .eq('meal_plan_id', selectedMealPlan.id).order('meal_order', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return;
        if (error) console.error('Unable to refresh meal plan meals:', error);
        else setSelectedMealPlanMeals(data || []);
      });
    return () => { active = false; };
  }, [refreshKey]);

  const macroShareTotal = Number(form.proteinPercent) + Number(form.fatPercent) + Number(form.carbsPercent);
  const calculationPreview = useMemo(() => {
    const factor = ACTIVITY.find((item) => item.id === form.activity)?.factor;
    if (!factor || !form.sex || !form.height || !form.weight || !form.age || !form.goal) return null;
    if (form.goal !== 'maintain' && form.adjustmentPercent === '') return null;
    if ([form.proteinPercent, form.fatPercent, form.carbsPercent].some((value) => value === '')) return null;
    return calculateNutrition({ ...form, activityFactor: factor });
  }, [form]);
  const canCalculate = Boolean(calculationPreview);
  const recipeMealTypes = useMemo(() => [...new Set(recipes.map((item) => item.meal_type).filter(Boolean))], [recipes]);
  const recipeGoals = useMemo(() => [...new Set(recipes.map((item) => item.goal).filter(Boolean))], [recipes]);
  const planGoals = useMemo(() => [...new Set(mealPlans.map((item) => item.goal).filter(Boolean))], [mealPlans]);
  const recipeFilterCount = [recipeFilters.mealType, recipeFilters.goal, recipeFilters.minCalories || recipeFilters.maxCalories].filter(Boolean).length;
  const planFilterCount = [planFilters.goal, planFilters.minCalories || planFilters.maxCalories].filter(Boolean).length;
  const filteredRecipes = useMemo(() => recipes.filter((recipe) => {
    if (recipeFavoritesOnly && !favorites.has(`recipe:${recipe.id}`)) return false;
    if (recipeFilters.mealType && recipe.meal_type !== recipeFilters.mealType) return false;
    if (recipeFilters.goal && recipe.goal !== recipeFilters.goal) return false;
    return caloriesMatch(recipe.calories, recipeFilters.minCalories, recipeFilters.maxCalories);
  }), [recipes, recipeFavoritesOnly, favorites, recipeFilters]);
  const filteredMealPlans = useMemo(() => mealPlans.filter((plan) => {
    if (planFavoritesOnly && !favorites.has(`meal_plan:${plan.id}`)) return false;
    if (planFilters.goal && plan.goal !== planFilters.goal) return false;
    return caloriesMatch(plan.calories_per_day, planFilters.minCalories, planFilters.maxCalories);
  }), [mealPlans, planFavoritesOnly, favorites, planFilters]);

  function update(key, value) {
    setForm((current) => key === 'goal'
      ? { ...current, goal: value, adjustmentPercent: GOALS.find((item) => item.id === value)?.defaultPercent ?? '0' }
      : { ...current, [key]: value });
    setResult(null);
    setMessage('');
  }
  function runCalculation() {
    setResult(calculationPreview);
    setMessage(calculationPreview ? '' : 'Проверьте введённые данные и сумму долей БЖУ (должно быть 100%).');
  }

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

  async function toggleFavorite(entityType, entityId) {
    if (!user?.id) return;
    const key = `${entityType}:${entityId}`;
    if (favoriteBusy.has(key)) return;
    setFavoriteBusy((current) => new Set(current).add(key));
    const isFavorite = favorites.has(key);
    const response = isFavorite
      ? await supabase.from('nutrition_favorites').delete().eq('user_id', user.id).eq('entity_type', entityType).eq('entity_id', entityId)
      : await supabase.from('nutrition_favorites').insert({ user_id: user.id, entity_type: entityType, entity_id: entityId });
    if (response.error) console.error('Unable to update nutrition favorite:', response.error);
    else setFavorites((current) => { const next = new Set(current); if (isFavorite) next.delete(key); else next.add(key); return next; });
    setFavoriteBusy((current) => { const next = new Set(current); next.delete(key); return next; });
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
    <RootSectionHeader title="Питание" />
    <main className="nutrition-content">
      <div className="nutrition-tabs" role="tablist" aria-label="Разделы питания">{TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? 'active' : ''} onClick={() => changeTab(item.id)}><span className="nutrition-tab-icon"><TabIcon type={item.icon} /></span><span className="nutrition-tab-label">{item.label}</span></button>)}</div>

      {tab === 'calculator' && <section className="nutrition-calculator">
        <section className="nutrition-card"><h2>Ваши данные</h2><div className="nutrition-segment"><button type="button" className={form.sex === 'male' ? 'active' : ''} onClick={() => update('sex', 'male')}>Мужской</button><button type="button" className={form.sex === 'female' ? 'active' : ''} onClick={() => update('sex', 'female')}>Женский</button></div><div className="nutrition-grid"><label>Рост, см<input type="number" min="120" max="230" value={form.height} onChange={(e) => update('height', e.target.value)} /></label><label>Вес, кг<input type="number" min="30" max="350" step="0.1" value={form.weight} onChange={(e) => update('weight', e.target.value)} /></label></div><label className="nutrition-field">Возраст<input type="number" min="16" max="100" value={form.age} onChange={(e) => update('age', e.target.value)} /><small>{profile?.birth_date ? 'Подставлен автоматически из даты рождения. Можно изменить для этого расчёта.' : 'Возраст нужен для корректного расчёта основного обмена.'}</small></label><label className="nutrition-field">Дневная активность<select value={form.activity} onChange={(e) => update('activity', e.target.value)}><option value="">Выберите активность</option>{ACTIVITY.map((item) => <option key={item.id} value={item.id}>{item.label} — {item.text}</option>)}</select></label></section>
        <section className="nutrition-card"><h2>Цель</h2><div className="nutrition-goals">{GOALS.map((item) => <button type="button" key={item.id} className={form.goal === item.id ? 'active' : ''} onClick={() => update('goal', item.id)}>{item.label}</button>)}</div>{form.goal && form.goal !== 'maintain' && <label className="nutrition-field">{form.goal === 'gain' ? 'Профицит, %' : 'Дефицит, %'}<input type="number" min="0" max={form.goal === 'gain' ? '200' : '99'} step="0.5" value={form.adjustmentPercent} onChange={(event) => update('adjustmentPercent', event.target.value)} /><small>Процент изменения от суточного расхода калорий, как в Excel-калькуляторе.</small></label>}</section>
        <section className="nutrition-card"><h2>Распределение БЖУ</h2><div className="nutrition-macro-share-grid">{[['proteinPercent', 'Белки, %'], ['fatPercent', 'Жиры, %'], ['carbsPercent', 'Углеводы, %']].map(([key, label]) => <label key={key}>{label}<input type="number" min="0" max="100" step="0.5" value={form[key]} onChange={(event) => update(key, event.target.value)} /></label>)}</div><small className={Math.abs(macroShareTotal - 100) < 0.00001 ? 'nutrition-macro-share-hint' : 'nutrition-macro-share-hint invalid'}>Сумма: {macroShareTotal.toLocaleString('ru-RU')}% из 100%. По умолчанию — 25% / 25% / 50%, как в таблице.</small></section>
        {!result && <button className="nutrition-calc-button" type="button" disabled={!canCalculate} onClick={runCalculation}>Рассчитать</button>}
        {result && <section className="nutrition-result"><span className="nutrition-result-kicker">Ваша дневная цель</span><strong className="nutrition-calories">{result.calories}<small> ккал</small></strong><div className="nutrition-macros"><div><strong>{result.protein} г</strong><span>Белки</span></div><div><strong>{result.fat} г</strong><span>Жиры</span></div><div><strong>{result.carbs} г</strong><span>Углеводы</span></div></div><p>Основной обмен: {Math.round(result.bmr)} ккал · С учётом активности: {Math.round(result.maintenance)} ккал.</p><p>Расчёт — ориентир, а не медицинская рекомендация. Фактическая потребность может отличаться.</p><button type="button" className="nutrition-save" disabled={saving} onClick={saveResult}>{saving ? 'Сохраняем…' : 'Сохранить КБЖУ'}</button><button type="button" className="nutrition-reset" onClick={() => { setResult(null); setMessage(''); }}>Не сохранять и пересчитать</button></section>}
        {message && <div className="nutrition-message" role="status">{message}</div>}
      </section>}

      {tab === 'recipes' && <section className="recipe-catalog"><CatalogToolbar filterOpen={recipeFilterOpen} setFilterOpen={setRecipeFilterOpen} favoritesOnly={recipeFavoritesOnly} setFavoritesOnly={setRecipeFavoritesOnly} activeFilterCount={recipeFilterCount} />{recipeFilterOpen && <RecipeFilters value={recipeFilters} onChange={setRecipeFilters} mealTypes={recipeMealTypes} goals={recipeGoals} onReset={() => setRecipeFilters(EMPTY_RECIPE_FILTERS)} />}{recipesLoading && <div className="recipe-state">Загружаем рецепты…</div>}{recipesError && <div className="recipe-state error">{recipesError}</div>}{!recipesLoading && !recipesError && filteredRecipes.length === 0 && <div className="recipe-state">{recipeFavoritesOnly ? 'В избранном пока нет рецептов.' : 'По выбранным фильтрам рецептов нет.'}</div>}<div className="recipe-list">{filteredRecipes.map((recipe) => <RecipeCard key={recipe.id} recipe={recipe} onOpen={setSelectedRecipe} favorite={favorites.has(`recipe:${recipe.id}`)} onToggleFavorite={toggleFavorite} />)}</div></section>}

      {tab === 'plans' && <section className="meal-plan-catalog"><CatalogToolbar filterOpen={planFilterOpen} setFilterOpen={setPlanFilterOpen} favoritesOnly={planFavoritesOnly} setFavoritesOnly={setPlanFavoritesOnly} activeFilterCount={planFilterCount} />{planFilterOpen && <MealPlanFilters value={planFilters} onChange={setPlanFilters} goals={planGoals} onReset={() => setPlanFilters(EMPTY_PLAN_FILTERS)} />}{mealPlansLoading && <div className="recipe-state">Загружаем рационы…</div>}{mealPlansError && <div className="recipe-state error">{mealPlansError}</div>}{!mealPlansLoading && !mealPlansError && filteredMealPlans.length === 0 && <div className="recipe-state">{planFavoritesOnly ? 'В избранном пока нет рационов.' : 'По выбранным фильтрам рационов нет.'}</div>}<div className="meal-plan-list">{filteredMealPlans.map((plan) => <MealPlanCard key={plan.id} plan={plan} onOpen={openMealPlan} favorite={favorites.has(`meal_plan:${plan.id}`)} onToggleFavorite={toggleFavorite} />)}</div></section>}
    </main>
    
  </div>;
}
