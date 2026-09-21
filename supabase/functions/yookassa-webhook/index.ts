import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const event = await req.json().catch(() => null);
  const paymentId = event?.object?.id;
  if (!paymentId) return json({ error: "Missing payment id" }, 400);

  const shopId = Deno.env.get("YOOKASSA_SHOP_ID");
  const secretKey = Deno.env.get("YOOKASSA_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!shopId || !secretKey || !supabaseUrl || !serviceKey) return json({ error: "Server is not configured" }, 503);

  // Do not trust webhook body alone: re-fetch payment from YooKassa.
  const credentials = btoa(shopId + ":" + secretKey);
  const verify = await fetch("https://api.yookassa.ru/v3/payments/" + encodeURIComponent(paymentId), {
    headers: { Authorization: "Basic " + credentials },
  });
  const payment = await verify.json().catch(() => ({}));
  if (!verify.ok) return json({ error: "Unable to verify payment" }, 502);

  const userId = payment?.metadata?.user_id;
  const planCode = payment?.metadata?.plan_code;
  if (!userId || !["pro", "premium"].includes(planCode)) return json({ error: "Invalid payment metadata" }, 400);

  const admin = createClient(supabaseUrl, serviceKey);
  const { error: eventError } = await admin.from("billing_events").upsert({
    user_id: userId,
    provider: "yookassa",
    provider_event_id: String(event?.id || paymentId + ":" + event?.event || payment.status),
    event_type: String(event?.event || "payment." + payment.status),
    payload: event,
    processed_at: new Date().toISOString(),
  }, { onConflict: "provider_event_id" });
  if (eventError) return json({ error: "Unable to store billing event" }, 500);

  if (payment.status === "succeeded" && payment.paid === true) {
    const now = new Date();
    const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const { error: subscriptionError } = await admin.from("user_subscriptions").upsert({
      user_id: userId,
      plan_code: planCode,
      status: "active",
      provider: "yookassa",
      current_period_start: now.toISOString(),
      current_period_end: end.toISOString(),
      cancel_at_period_end: false,
      cancelled_at: null,
      updated_at: now.toISOString(),
    }, { onConflict: "user_id" });
    if (subscriptionError) return json({ error: "Unable to activate subscription" }, 500);

    const method = payment.payment_method;
    if (method?.saved && method?.id) {
      await admin.from("payment_methods").upsert({
        user_id: userId,
        provider: "yookassa",
        provider_payment_method_id: method.id,
        brand: method?.card?.card_type || method?.type || null,
        last4: method?.card?.last4 || null,
        exp_month: method?.card?.expiry_month ? Number(method.card.expiry_month) : null,
        exp_year: method?.card?.expiry_year ? Number(method.card.expiry_year) : null,
        is_default: true,
      }, { onConflict: "user_id,provider,provider_payment_method_id", ignoreDuplicates: false }).then(()=>{});
    }
  }

  if (payment.status === "canceled") {
    await admin.from("user_subscriptions").update({
      status: "inactive",
      updated_at: new Date().toISOString(),
    }).eq("user_id", userId).eq("provider", "yookassa");
  }

  return json({ ok: true });
});
