import { supabase } from './supabase.js';

function base64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = window.atob(normalized);
  return Uint8Array.from([...raw].map((char) => char.charCodeAt(0)));
}

export function pushCapability() {
  const supported = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  const configured = Boolean(import.meta.env.VITE_VAPID_PUBLIC_KEY);
  return { supported, configured, permission: supported ? Notification.permission : 'unsupported' };
}

export async function enablePushForUser(userId) {
  const capability = pushCapability();
  if (!capability.supported) throw new Error('Этот браузер не поддерживает push-уведомления.');
  if (!capability.configured) throw new Error('Push-уведомления ещё не подключены на сервере.');
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Разрешение на push-уведомления не выдано.');
  const registration = await navigator.serviceWorker.register(import.meta.env.BASE_URL + 'sw.js');
  await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  const subscription = existing || await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: base64ToUint8Array(import.meta.env.VITE_VAPID_PUBLIC_KEY) });
  const json = subscription.toJSON();
  const payload = { user_id: userId, endpoint: subscription.endpoint, p256dh: json.keys?.p256dh, auth: json.keys?.auth, user_agent: navigator.userAgent, is_active: true, updated_at: new Date().toISOString() };
  const { error } = await supabase.from('push_subscriptions').upsert(payload, { onConflict: 'user_id,endpoint' });
  if (error) throw error;
  return subscription;
}

export async function disablePushForUser(userId) {
  if (!('serviceWorker' in navigator)) return;
  const registration = await navigator.serviceWorker.getRegistration(import.meta.env.BASE_URL + 'sw.js');
  const subscription = await registration?.pushManager?.getSubscription();
  if (subscription) {
    await supabase.from('push_subscriptions').delete().eq('user_id', userId).eq('endpoint', subscription.endpoint);
    await subscription.unsubscribe();
  }
}
