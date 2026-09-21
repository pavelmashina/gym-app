import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(p,'utf8');
const schema=read('supabase/schema/subscription-billing-notifications.sql');
const app=read('src/App.jsx');
const plans=read('src/components/MenuScreens.jsx');
const settings=read('src/components/SettingsScreen.jsx');
const subscription=read('src/lib/subscription.js');
const billing=read('src/lib/billing.js');
const push=read('src/lib/pushNotifications.js');
const sw=read('public/sw.js');

assert.match(schema,/create table if not exists public\.subscription_plans/);
assert.match(schema,/create table if not exists public\.user_subscriptions/);
assert.match(schema,/create table if not exists public\.billing_events/);
assert.match(schema,/revoke all on public\.billing_events from anon, authenticated/);
assert.match(schema,/create table if not exists public\.push_subscriptions/);
assert.match(schema,/get_my_subscription/);
assert.match(schema,/has_entitlement/);

assert.match(app,/loadSubscriptionState/);
assert.match(app,/subscription=\{subscription\}/);
assert.match(subscription,/FALLBACK_PLANS/);
assert.match(subscription,/hasEntitlement/);

assert.match(plans,/loadPlanCatalog/);
assert.match(plans,/startCheckout/);
assert.match(plans,/requestSubscriptionCancellation/);
assert.match(billing,/create-checkout-session/);
assert.match(billing,/request_subscription_cancellation/);

assert.match(settings,/handlePushToggle/);
assert.match(push,/Notification\.requestPermission/);
assert.match(push,/pushManager\.subscribe/);
assert.match(push,/push_subscriptions/);
assert.match(sw,/showNotification/);
assert.match(sw,/notificationclick/);

console.log('Commercial foundation contracts passed.');

const checkoutEdge=read('supabase/functions/create-checkout-session/index.ts');
const webhookEdge=read('supabase/functions/yookassa-webhook/index.ts');
