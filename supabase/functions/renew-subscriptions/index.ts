import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const cronSecret = Deno.env.get("BILLING_CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) return json({ error: "Unauthorized" }, 401);

  const shopId = Deno.env.get("YOOKASSA_SHOP_ID");
  const secretKey = Deno.env.get("YOOKASSA_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const proPrice = Deno.env.get("YOOKASSA_PRO_PRICE_RUB");
  const premiumPrice = Deno.env.get("YOOKASSA_PREMIUM_PRICE_RUB");
  if (!shopId || !secretKey || !supabaseUrl || !serviceKey || !proPrice || !premiumPrice) return json({ error: "Billing is not configured" }, 503);

  const admin = createClient(supabaseUrl, serviceKey);
  const now = new Date();
  const windowEnd = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const { data: due, error } = await admin.from("user_subscriptions")
    .select("user_id,plan_code,current_period_end,cancel_at_period_end,status")
    .eq("status", "active")
    .eq("cancel_at_period_end", false)
    .lte("current_period_end", windowEnd.toISOString());
  if (error) return json({ error: "Unable to load subscriptions" }, 500);

  const credentials = btoa(shopId + ":" + secretKey);
  let attempted = 0;
  for (const sub of due || []) {
    const { data: methods } = await admin.from("payment_methods")
      .select("provider_payment_method_id")
      .eq("user_id", sub.user_id)
      .eq("provider", "yookassa")
      .eq("is_default", true)
      .limit(1);
    const methodId = methods?.[0]?.provider_payment_method_id;
    if (!methodId) continue;

    const price = sub.plan_code === "premium" ? premiumPrice : proPrice;
    const response = await fetch("https://api.yookassa.ru/v3/payments", {
      method: "POST",
      headers: {
        Authorization: "Basic " + credentials,
        "Idempotence-Key": crypto.randomUUID(),
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: { value: Number(price).toFixed(2), currency: "RUB" },
        capture: true,
        payment_method_id: methodId,
        description: sub.plan_code === "premium" ? "Продление GYM Premium" : "Продление GYM Pro",
        metadata: { user_id: sub.user_id, plan_code: sub.plan_code, period_days: "30", renewal: "true" },
      }),
    });
    attempted += 1;
    if (!response.ok) {
      await admin.from("user_subscriptions").update({ status: "past_due", updated_at: new Date().toISOString() }).eq("user_id", sub.user_id);
    }
  }
  return json({ ok: true, attempted });
});
