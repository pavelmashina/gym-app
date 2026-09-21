# Commercial setup

## Payment provider

The production billing adapter is prepared for YooKassa.

Required Edge Function secrets:

- `YOOKASSA_SHOP_ID`
- `YOOKASSA_SECRET_KEY`
- `YOOKASSA_PRO_PRICE_RUB`
- `YOOKASSA_PREMIUM_PRICE_RUB`

The client invokes `create-checkout-session`. The function creates a server-side YooKassa payment with redirect confirmation, an idempotence key and `save_payment_method=true`.

Configure the YooKassa webhook to call the deployed Supabase function:

`yookassa-webhook`

The webhook does not trust the incoming body alone: it re-fetches the payment from YooKassa before activating the user's plan.

Current billing scope:

- Free / Pro / Premium catalog;
- one checkout per paid 30-day period;
- activation after verified `payment.succeeded`;
- saved provider payment-method metadata;
- cancellation flag / no further renewal intent;
- no card PAN/CVC is stored by the application.

Automatic recurring charging is intentionally not enabled in production yet. Renewal can be added after merchant credentials, recurring-payment terms and production billing rules are finalized.

## Web Push

Required Edge Function secrets:

- `VAPID_PUBLIC_KEY`
- `VAPID_PRIVATE_KEY`
- `VAPID_SUBJECT`
- `NOTIFICATION_CRON_SECRET`

The frontend also needs:

- `VITE_VAPID_PUBLIC_KEY`

`send-workout-reminders` is deployed as the timezone-aware sender. It sends the first scheduled workout of the user's local day around 08:00 and uses `notification_delivery_log` to avoid duplicate sends.

The scheduler must invoke the function hourly and provide `x-cron-secret`. The server-side secret values are not committed to GitHub.

## Production checklist

1. Set YooKassa and VAPID secrets in Supabase.
2. Add `VITE_VAPID_PUBLIC_KEY` to the GitHub Pages build environment.
3. Register the YooKassa webhook.
4. Schedule `send-workout-reminders` hourly with the cron secret.
5. Perform a real low-value payment in YooKassa test mode.
6. Verify `user_subscriptions`, `payment_methods` and `billing_events`.
7. Install the PWA on iPhone and verify browser notification permission and one test notification.
