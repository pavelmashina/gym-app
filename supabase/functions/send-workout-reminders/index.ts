import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";
import webpush from "npm:web-push@3.6.7";

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function localParts(timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return { date: `${get("year")}-${get("month")}-${get("day")}`, hour: Number(get("hour")) };
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const cronSecret = Deno.env.get("NOTIFICATION_CRON_SECRET");
  if (!cronSecret || req.headers.get("x-cron-secret") !== cronSecret) return json({ error: "Unauthorized" }, 401);

  const vapidPublic = Deno.env.get("VAPID_PUBLIC_KEY");
  const vapidPrivate = Deno.env.get("VAPID_PRIVATE_KEY");
  const vapidSubject = Deno.env.get("VAPID_SUBJECT") || "mailto:support@example.com";
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!vapidPublic || !vapidPrivate || !supabaseUrl || !serviceKey) return json({ error: "Push sender is not configured" }, 503);

  webpush.setVapidDetails(vapidSubject, vapidPublic, vapidPrivate);
  const admin = createClient(supabaseUrl, serviceKey);

  const { data: subscriptions, error: subscriptionError } = await admin
    .from("push_subscriptions")
    .select("id,user_id,endpoint,p256dh,auth")
    .eq("is_active", true);
  if (subscriptionError) return json({ error: "Unable to load push subscriptions" }, 500);

  const userIds = [...new Set((subscriptions || []).map((item) => item.user_id))];
  if (!userIds.length) return json({ ok: true, sent: 0 });

  const { data: settings } = await admin
    .from("user_app_settings")
    .select("user_id,workout_push,timezone")
    .in("user_id", userIds);
  const settingsByUser = new Map((settings || []).map((item) => [item.user_id, item]));

  let sent = 0;
  for (const userId of userIds) {
    const userSettings = settingsByUser.get(userId);
    if (userSettings && !userSettings.workout_push) continue;
    const timeZone = userSettings?.timezone || "Europe/Moscow";
    const local = localParts(timeZone);
    if (local.hour !== 8) continue;

    const { data: userPrograms } = await admin.from("user_programs").select("id").eq("user_id", userId).eq("status", "active");
    const programIds = (userPrograms || []).map((item) => item.id);
    if (!programIds.length) continue;

    const { data: workouts } = await admin
      .from("scheduled_workouts")
      .select("id,title,scheduled_date,status")
      .in("user_program_id", programIds)
      .eq("status", "scheduled")
      .eq("scheduled_date", local.date)
      .order("sequence_number", { ascending: true })
      .limit(1);
    const workout = workouts?.[0];
    if (!workout) continue;

    const { data: existing } = await admin
      .from("notification_delivery_log")
      .select("id")
      .eq("user_id", userId)
      .eq("scheduled_workout_id", workout.id)
      .eq("notification_type", "workout_today")
      .eq("local_date", local.date)
      .maybeSingle();
    if (existing) continue;

    const targets = (subscriptions || []).filter((item) => item.user_id === userId);
    for (const target of targets) {
      try {
        await webpush.sendNotification({
          endpoint: target.endpoint,
          keys: { p256dh: target.p256dh, auth: target.auth },
        }, JSON.stringify({
          title: "Тренировка сегодня",
          body: workout.title ? `${workout.title} запланирована на сегодня.` : "На сегодня запланирована тренировка.",
          url: "/gym-app/",
        }));
        sent += 1;
      } catch (error) {
        const statusCode = Number((error as { statusCode?: number })?.statusCode || 0);
        if (statusCode === 404 || statusCode === 410) {
          await admin.from("push_subscriptions").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", target.id);
        }
      }
    }

    await admin.from("notification_delivery_log").insert({
      user_id: userId,
      scheduled_workout_id: workout.id,
      notification_type: "workout_today",
      local_date: local.date,
    });
  }

  return json({ ok: true, sent });
});
