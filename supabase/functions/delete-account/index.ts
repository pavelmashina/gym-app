import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const USER_STORAGE_BUCKETS = ["account-avatars", "exercise-videos", "program-covers"];

async function collectFiles(admin: ReturnType<typeof createClient>, bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = [];
  let offset = 0;
  while (true) {
    const { data, error } = await admin.storage.from(bucket).list(prefix, { limit: 100, offset, sortBy: { column: "name", order: "asc" } });
    if (error) {
      if (String(error.message || "").toLowerCase().includes("bucket not found")) return files;
      throw error;
    }
    const rows = data ?? [];
    for (const item of rows) {
      const path = prefix ? `${prefix}/${item.name}` : item.name;
      if (item.id) files.push(path);
      else files.push(...await collectFiles(admin, bucket, path));
    }
    if (rows.length < 100) break;
    offset += rows.length;
  }
  return files;
}

async function removeUserStorage(admin: ReturnType<typeof createClient>, userId: string) {
  for (const bucket of USER_STORAGE_BUCKETS) {
    const paths = await collectFiles(admin, bucket, userId);
    for (let index = 0; index < paths.length; index += 100) {
      const { error } = await admin.storage.from(bucket).remove(paths.slice(index, index + 100));
      if (error) throw error;
    }
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  let body: { confirm?: boolean } = {};
  try { body = await req.json(); } catch { body = {}; }
  if (body.confirm !== true) {
    return new Response(JSON.stringify({ error: "Deletion confirmation required" }), { status: 400, headers: { "Content-Type": "application/json" } });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Server is not configured" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const token = authHeader.slice(7);
  const { data: { user }, error: userError } = await admin.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401, headers: { "Content-Type": "application/json" } });
  }

  try {
    await removeUserStorage(admin, user.id);
  } catch (storageError) {
    console.error("Unable to delete account storage", storageError);
    return new Response(JSON.stringify({ error: "Unable to delete account storage" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error("Unable to delete auth user", deleteError);
    return new Response(JSON.stringify({ error: "Unable to delete account" }), { status: 500, headers: { "Content-Type": "application/json" } });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { "Content-Type": "application/json" } });
});
