import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const auth = req.headers.get("Authorization");
  if (!auth) return json({ error: "Unauthorized" }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
  const client = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: { user }, error: userError } = await client.auth.getUser();
  if (userError || !user) return json({ error: "Unauthorized" }, 401);

  const { planCode, returnUrl } = await req.json().catch(() => ({}));
  if (!["pro", "premium"].includes(planCode)) return json({ error: "Unknown plan" }, 400);
  if (typeof returnUrl !== "string" || !/^https?:\/\//.test(returnUrl)) return json({ error: "Invalid return URL" }, 400);

  const shopId = Deno.env.get("YOOKASSA_SHOP_ID");
  const secretKey = Deno.env.get("YOOKASSA_SECRET_KEY");
  const proPrice = Deno.env.get("YOOKASSA_PRO_PRICE_RUB");
  const premiumPrice = Deno.env.get("YOOKASSA_PREMIUM_PRICE_RUB");
  if (!shopId || !secretKey || !proPrice || !premiumPrice) return json({ error: "Billing is not configured" }, 503);

  const price = planCode === "pro" ? proPrice : premiumPrice;
  const idempotenceKey = crypto.randomUUID();
  const credentials = btoa(shopId + ":" + secretKey);

  const response = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      Authorization: "Basic " + credentials,
      "Idempotence-Key": idempotenceKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: { value: Number(price).toFixed(2), currency: "RUB" },
      capture: true,
      confirmation: { type: "redirect", return_url: returnUrl },
      save_payment_method: true,
      description: planCode === "pro" ? "GYM Pro — 30 дней" : "GYM Premium — 30 дней",
      metadata: { user_id: user.id, plan_code: planCode, period_days: "30" },
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) return json({ error: "Payment provider error", details: payload }, 502);
  const checkoutUrl = payload?.confirmation?.confirmation_url;
  if (!checkoutUrl) return json({ error: "Provider did not return confirmation URL" }, 502);

  return json({ checkoutUrl, paymentId: payload.id });
});
