import { supabase } from './supabase.js';

export async function startCheckout(planCode) {
  if (!['pro','premium'].includes(planCode)) throw new Error('Для бесплатного тарифа оплата не требуется.');
  const returnUrl = window.location.origin + (import.meta.env.BASE_URL || '/');
  const { data, error } = await supabase.functions.invoke('create-checkout-session', {
    body: { planCode, returnUrl },
  });
  if (error) throw new Error('Платёжный провайдер пока не подключён.');
  if (!data?.checkoutUrl) throw new Error('Платёжная ссылка не получена.');
  window.location.assign(data.checkoutUrl);
}

export async function openBillingPortal() {
  const returnUrl = window.location.origin + (import.meta.env.BASE_URL || '/');
  const { data, error } = await supabase.functions.invoke('create-billing-portal', { body: { returnUrl } });
  if (error) throw new Error('Управление оплатой пока недоступно.');
  if (!data?.portalUrl) throw new Error('Ссылка на управление подпиской не получена.');
  window.location.assign(data.portalUrl);
}
