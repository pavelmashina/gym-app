import { supabase } from './supabase.js';

export const PLAN_LABELS = { free: 'Бесплатный', pro: 'Pro', premium: 'Premium' };

export const FALLBACK_PLANS = [
  { code: 'free', name: 'Бесплатный', description: 'Основные функции приложения', features: { workouts: true, programs: true, nutrition: true, basic_statistics: true } },
  { code: 'pro', name: 'Pro', description: 'Расширенные функции и аналитика', features: { workouts: true, programs: true, nutrition: true, basic_statistics: true, advanced_statistics: true, cross_device_sync: true } },
  { code: 'premium', name: 'Premium', description: 'Максимальный набор возможностей', features: { workouts: true, programs: true, nutrition: true, basic_statistics: true, advanced_statistics: true, cross_device_sync: true, priority_support: true } },
];

export async function loadSubscriptionState(fallbackPlanCode = 'free') {
  try {
    const { data, error } = await supabase.rpc('get_my_subscription');
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { planCode: fallbackPlanCode || 'free', status: 'inactive', features: {} };
    return {
      planCode: row.plan_code || 'free',
      status: row.status || 'inactive',
      currentPeriodEnd: row.current_period_end || null,
      cancelAtPeriodEnd: Boolean(row.cancel_at_period_end),
      features: row.features || {},
    };
  } catch (error) {
    console.warn('Subscription RPC unavailable, using profile fallback:', error);
    return { planCode: fallbackPlanCode || 'free', status: fallbackPlanCode && fallbackPlanCode !== 'free' ? 'active' : 'inactive', features: {} };
  }
}

export async function loadPlanCatalog() {
  try {
    const { data, error } = await supabase.from('subscription_plans').select('code,name,description,features,sort_order').eq('is_active', true).order('sort_order', { ascending: true });
    if (error) throw error;
    return data?.length ? data : FALLBACK_PLANS;
  } catch (error) {
    console.warn('Plan catalog unavailable, using fallback plans:', error);
    return FALLBACK_PLANS;
  }
}

export function hasEntitlement(subscription, feature) {
  if (!subscription) return false;
  if (subscription.features && Object.prototype.hasOwnProperty.call(subscription.features, feature)) return Boolean(subscription.features[feature]);
  if (subscription.planCode === 'premium') return true;
  if (subscription.planCode === 'pro') return ['advanced_statistics', 'cross_device_sync'].includes(feature);
  return ['workouts', 'programs', 'nutrition', 'basic_statistics'].includes(feature);
}
