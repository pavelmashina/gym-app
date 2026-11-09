import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };

type TgMessage = {
  message_id?: number;
  text?: string;
  caption?: string;
  media_group_id?: string;
  message_thread_id?: number;
  photo?: Array<{ file_id: string; file_size?: number }>;
  voice?: { file_id: string; file_size?: number; mime_type?: string };
  audio?: { file_id: string; file_size?: number; mime_type?: string; file_name?: string };
  document?: { file_id: string; file_size?: number; mime_type?: string; file_name?: string };
  from?: { id?: number; is_bot?: boolean };
  chat?: { id?: number; type?: string };
};
type TgUpdate = { update_id?: number; message?: TgMessage };
type IssueDraft = {
  title: string;
  problem: string;
  tasks: string[];
  criteria: string[];
  priority: "P0" | "P1" | "P2";
};

const REPO = "pavelmashina/gym-app";
const GITHUB_API = `https://api.github.com/repos/${REPO}/issues`;
const MAX_MESSAGE_LENGTH = 4000;
const MAX_IMAGES = 6;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const BUCKET = "telegram-issue-screenshots";
type ImageRef = { fileId: string; messageId: number; mime: string };
type TaskDraft = {
  chat_id: string;
  batch_id: string;
  description: string;
  images: ImageRef[];
  composing: boolean;
  updated_at: string;
};
type Admin = ReturnType<typeof createClient>;

const json = (body: unknown, status = 200) =>
  Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

function constantTimeEquals(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

const BUTTONS = {
  keyboard: [
    [{ text: "🆕 Новая задача" }, { text: "✅ Отправить" }],
    [{ text: "❌ Отмена" }, { text: "📖 Правила" }],
    [{ text: "🆔 Мой ID" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Описание задачи или скриншот",
};

async function telegramSend(token: string, chatId: number, text: string, threadId?: number) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId, text, disable_web_page_preview: true,
      ...(threadId ? { message_thread_id: threadId } : {}),
      reply_markup: BUTTONS,
    }),
    signal: AbortSignal.timeout(12000),
  });
  if (!res.ok) throw new Error(`Telegram sendMessage HTTP ${res.status}`);
}

function rawDraft(input: string): IssueDraft {
  const title = input.split("\n").find((line) => line.trim())?.trim().slice(0, 120)
    || "Задача из Telegram";
  return {
    title,
    problem: "",
    tasks: [input.trim()],
    criteria: [],
    priority: "P2",
  };
}

async function makeDraft(input: string, screenshotUrls: string[] = []): Promise<IssueDraft> {
  // Claude replaces GPT for all task structuring; never silently call OpenAI for text.
  // Without Anthropic credentials, plain-text Issues continue to work.
  const key = Deno.env.get("ANTHROPIC_API_KEY");
  if (!key) return rawDraft(input);

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["title", "problem", "tasks", "criteria", "priority"],
    properties: {
      title: { type: "string" },
      problem: { type: "string" },
      tasks: { type: "array", items: { type: "string" } },
      criteria: { type: "array", items: { type: "string" } },
      priority: { type: "string", enum: ["P0", "P1", "P2"] },
    },
  };
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2026-10-21",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("ANTHROPIC_MODEL") || "claude-sonnet-5-5",
      max_tokens: 2500,
      output_config: { format: { type: "json_schema", schema } },
      system:
        "Ты создаёшь GitHub Issues для русскоязычного спортивного веб-приложения. " +
        "Сохраняй КАЖДОЕ конкретное требование, название экрана, точный текст интерфейса, " +
        "числовые значения, размер шрифта и ограничения пользователя. " +
        "Не придумывай новых функций, требований, причин ошибок или деталей реализации. " +
        "title: точный короткий заголовок до 120 символов. " +
        "problem: кратко, только если проблема указана. " +
        "tasks: конкретные действия, одно на пункт, ничего не пропускай. " +
        "criteria: проверяемые критерии по требованиям, без добавления новых функций. " +
        "P0 — приложение или ключевая функция заблокированы; " +
        "P1 — серьёзная ошибка; P2 — остальные изменения и улучшения. " +
        "Все поля по заданной JSON-схеме; текст на русском языке.",
      messages: [{
        role: "user",
        content: screenshotUrls.length ? [
          { type: "text", text: input + "\n\nПроанализируй приложенные скриншоты как контекст. " +
            "Перенеси в задачу только наблюдаемые проблемы и требования, не делай предположений." },
          ...screenshotUrls.map((url) => ({
            type: "image", source: { type: "url", url },
          })),
        ] : input,
      }],
    }),
    signal: AbortSignal.timeout(65000),
  });
  if (!res.ok) {
    console.error("Claude issue formatting failed", { status: res.status });
    throw new Error("CLAUDE_API_HTTP_" + res.status);
  }
  const data = await res.json();
  const output = data?.content?.find(
    (block: { type?: string }) => block.type === "text"
  )?.text;
  if (typeof output !== "string") throw new Error("CLAUDE_EMPTY");
  let parsed: IssueDraft;
  try {
    parsed = JSON.parse(output) as IssueDraft;
  } catch {
    throw new Error("CLAUDE_BAD_JSON");
  }
  if (!parsed.title?.trim() || !Array.isArray(parsed.tasks) ||
      !parsed.tasks.some((task) => typeof task === "string" && task.trim())) {
    throw new Error("CLAUDE_INCOMPLETE");
  }
  return {
    title: parsed.title.trim().slice(0, 180),
    problem: typeof parsed.problem === "string" ? parsed.problem.trim() : "",
    tasks: parsed.tasks.filter((item) => typeof item === "string" && item.trim()),
    criteria: Array.isArray(parsed.criteria)
      ? parsed.criteria.filter((item) => typeof item === "string" && item.trim())
      : [],
    priority: ["P0", "P1", "P2"].includes(parsed.priority) ? parsed.priority : "P2",
  };
}

function formatIssue(draft: IssueDraft, marker: string, screenshotUrls: string[] = []) {
  const descriptions: Record<string, string> = {
    P0: "критично (блокирующий дефект)",
    P1: "высокий",
    P2: "функциональность / улучшение",
  };
  const parts: string[] = [];
  if (draft.problem) parts.push(`## Проблема\n${draft.problem}`);
  parts.push("## Что требуется\n" + draft.tasks.map((s) => `- ${s}`).join("\n"));
  if (draft.criteria.length) {
    parts.push("## Критерии готовности\n" +
      draft.criteria.map((s) => `- [ ] ${s}`).join("\n"));
  }
  parts.push(`**Приоритет:** ${draft.priority} — ${descriptions[draft.priority]}.`);
  if (screenshotUrls.length) {
    parts.push("## Скриншоты\n" + screenshotUrls.map((url, index) =>
      "![Скриншот " + (index + 1) + "](" + url + ")"
    ).join("\n\n"));
  }
  parts.push("_Создано через Telegram-бота._");
  parts.push(marker);
  return parts.join("\n\n");
}

async function githubRequest(token: string, path: string, init: RequestInit = {}) {
  return fetch(path, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "gym-app-telegram-issues-bot",
      ...(init.headers || {}),
    },
    signal: AbortSignal.timeout(15000),
  });
}

async function findExisting(token: string, marker: string): Promise<string | null> {
  const res = await githubRequest(
    token,
    `${GITHUB_API}?state=all&sort=created&direction=desc&per_page=100`,
  );
  if (!res.ok) throw new Error(`GitHub duplicate check HTTP ${res.status}`);
  const issues = await res.json();
  if (!Array.isArray(issues)) throw new Error("Unexpected GitHub issues response");
  return issues.find((issue: { body?: string; html_url?: string }) =>
    typeof issue.body === "string" && issue.body.includes(marker)
  )?.html_url || null;
}

async function createIssue(token: string, draft: IssueDraft, marker: string, screenshotUrls: string[] = []) {
  const res = await githubRequest(token, GITHUB_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: draft.title,
      body: formatIssue(draft, marker, screenshotUrls),
    }),
  });
  if (!res.ok) {
    let reason = "";
    try {
      const payload = await res.json();
      reason = typeof payload?.message === "string" ? payload.message.slice(0, 240) : "";
    } catch { /* GitHub can return an empty/non-JSON error body */ }
    const required = res.headers.get("x-accepted-github-permissions");
    const remaining = res.headers.get("x-ratelimit-remaining");
    console.error("GitHub create issue rejected", {
      status: res.status,
      reason,
      requiredPermissions: required,
      remainingRequests: remaining,
    });
    if (res.status === 403 && (remaining === "0" || /rate limit/i.test(reason))) {
      throw new Error("GITHUB_RATE_LIMIT");
    }
    if (res.status === 403 || res.status === 401) {
      throw new Error("GITHUB_ISSUES_PERMISSION");
    }
    throw new Error(`GitHub create issue HTTP ${res.status}`);
  }
  const issue = await res.json();
  if (!issue.html_url || typeof issue.number !== "number") {
    throw new Error("GitHub returned an invalid issue");
  }
  return { number: issue.number as number, url: issue.html_url as string };
}


function adminClient(): Admin {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new Error("Supabase service key unavailable");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function readPending(admin: Admin, chatId: string): Promise<TaskDraft | null> {
  const { data, error } = await admin.from("telegram_issue_drafts")
    .select("chat_id,batch_id,description,images,composing,updated_at")
    .eq("chat_id", String(chatId)).maybeSingle();
  if (error) throw new Error("Draft lookup: " + error.code);
  return data as TaskDraft | null;
}

async function savePending(admin: Admin, chatId: string, values: Partial<TaskDraft>, old?: TaskDraft | null): Promise<TaskDraft> {
  const item: TaskDraft = {
    chat_id: String(chatId),
    batch_id: old?.batch_id || crypto.randomUUID(),
    description: values.description ?? old?.description ?? "",
    images: values.images ?? old?.images ?? [],
    composing: values.composing ?? old?.composing ?? false,
    updated_at: new Date().toISOString(),
  };
  const { error } = await admin.from("telegram_issue_drafts")
    .upsert(item, { onConflict: "chat_id" });
  if (error) throw new Error("Draft save: " + error.code);
  return item;
}

async function clearPending(admin: Admin, item: TaskDraft) {
  // Prevent older requests from deleting more recently updated drafts.
  const { error } = await admin.from("telegram_issue_drafts")
    .delete().eq("chat_id", item.chat_id).eq("updated_at", item.updated_at);
  if (error) throw new Error("Draft cleanup: " + error.code);
}

async function telegramFile(botToken: string, fileId: string, maxSize: number): Promise<Uint8Array> {
  const meta = await fetch("https://api.telegram.org/bot" + botToken +
    "/getFile?file_id=" + encodeURIComponent(fileId), { signal: AbortSignal.timeout(15000) });
  if (!meta.ok) throw new Error("Telegram getFile HTTP " + meta.status);
  const data = await meta.json();
  const path: unknown = data?.result?.file_path;
  const size: unknown = data?.result?.file_size;
  if (typeof size === "number" && size > maxSize) throw new Error("FILE_TOO_LARGE");
  if (typeof path !== "string" || !/^[A-Za-z0-9/_.-]+$/.test(path) || path.includes("..")) {
    throw new Error("Telegram returned invalid file path");
  }
  const res = await fetch("https://api.telegram.org/file/bot" + botToken + "/" + path, {
    signal: AbortSignal.timeout(30000),
  });
  if (!res.ok) throw new Error("Telegram file HTTP " + res.status);
  if (Number(res.headers.get("content-length") || 0) > maxSize) throw new Error("FILE_TOO_LARGE");
  const bytes = new Uint8Array(await res.arrayBuffer());
  if (!bytes.length || bytes.byteLength > maxSize) throw new Error("FILE_TOO_LARGE");
  return bytes;
}

function detectImageType(bytes: Uint8Array): string | null {
  if (bytes.length > 8 && bytes[0] === 137 && bytes[1] === 80 &&
    bytes[2] === 78 && bytes[3] === 71) return "image/png";
  if (bytes.length > 3 && bytes[0] === 255 && bytes[1] === 216 &&
    bytes[2] === 255) return "image/jpeg";
  if (bytes.length > 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
    String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  return null;
}

async function saveScreenshots(admin: Admin, token: string, images: ImageRef[], batch: string): Promise<string[]> {
  const urls: string[] = [];
  for (let i = 0; i < images.length; i++) {
    const bytes = await telegramFile(token, images[i].fileId, MAX_IMAGE_BYTES);
    const mime = detectImageType(bytes);
    if (!mime) throw new Error("IMAGE_UNSUPPORTED");
    const ext = mime === "image/png" ? "png" : mime === "image/webp" ? "webp" : "jpg";
    const path = batch + "/" + images[i].messageId + "-" + i + "." + ext;
    const { error } = await admin.storage.from(BUCKET).upload(path, bytes, {
      contentType: mime, cacheControl: "31536000", upsert: false,
    });
    if (error && !/already exists|duplicate/i.test(error.message)) {
      throw new Error("Screenshot upload failed: " + error.message);
    }
    const url = admin.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    if (!url) throw new Error("No screenshot URL");
    urls.push(url);
  }
  return urls;
}

async function createFromMessage(
  admin: Admin, botToken: string, githubToken: string, chatId: number,
  messageId: number, description: string, pending: TaskDraft | null,
  threadId?: number,
) {
  if (!description.trim()) {
    await telegramSend(botToken, chatId, "Сначала добавь текстовое описание задачи.", threadId);
    return;
  }
  if (description.length > 12000) {
    await telegramSend(botToken, chatId, "Описание слишком длинное. Максимум 12000 символов.", threadId);
    return;
  }
  const digest = await crypto.subtle.digest("SHA-256",
    new TextEncoder().encode(String(chatId) + ":" + messageId));
  const fingerprint = Array.from(new Uint8Array(digest))
    .map((x) => x.toString(16).padStart(2, "0")).join("");
  const marker = pending
    ? "<!-- gym-telegram-task:" + pending.batch_id + " -->"
    : "<!-- gym-telegram-task:" + fingerprint + " -->";
  const already = await findExisting(githubToken, marker);
  if (already) {
    if (pending) await clearPending(admin, pending);
    await telegramSend(botToken, chatId, "Эта задача уже существует: " + already, threadId);
    return;
  }
  const screenshots = pending?.images?.length
    ? await saveScreenshots(admin, botToken, pending.images, pending.batch_id)
    : [];
  // Claude sees image URLs and the description, while GitHub Issue embeds images.
  const draft = await makeDraft(description, screenshots);
  const created = await createIssue(githubToken, draft, marker, screenshots);
  if (pending) await clearPending(admin, pending);
  await telegramSend(botToken, chatId,
    "✅ Issue #" + created.number + " создан\n\n" + draft.title +
    (screenshots.length ? "\n📎 Скриншотов: " + screenshots.length : "") +
    "\n\n" + created.url, threadId);
}


type ChatType = "private" | "supergroup";
type BoundTopic = { chat_id: string; thread_id: number };
const RULES = [
  "🏋️ GymAppEditBot — задачи спортивного приложения",
  "",
  "Все задачи попадают в GitHub Issues: pavelmashina/gym-app.",
  "",
  "🆕 Новая задача — начать сбор материалов.",
  "📝 Пришли текст и до 6 скриншотов в любом порядке.",
  "✅ Отправить — создать Issue и получить ссылку.",
  "❌ Отмена — удалить незавершённый черновик.",
  "📖 Правила — показать эту памятку.",
  "🆔 Мой ID — узнать свой числовой Telegram ID.",
  "",
  "В личном чате текст можно отправлять сразу — без кнопки «Новая задача».",
  "В групповом топике сначала нажми «Новая задача», затем «Отправить».",
  "Данные разных пользователей не смешиваются.",
  "",
  "⚠️ Репозиторий публичный. Скриншоты в Issues доступны всем по ссылке; не отправляй личные данные.",
  "",
  "Администратору: /bind — привязать этот топик, /unbind — отвязать.",
  "/allow ID — разрешить пользователю, /revoke ID — убрать доступ, /users — список.",
].join("\n");

function normalizedCommand(raw: string): string {
  const text = raw.trim();
  const lookup: Record<string, string> = {
    "🆕 Новая задача": "/new",
    "✅ Отправить": "/create",
    "❌ Отмена": "/cancel",
    "📖 Правила": "/rules",
    "🆔 Мой ID": "/id",
    "Новая задача": "/new",
    "Отправить": "/create",
    "Отмена": "/cancel",
    "Правила": "/rules",
    "Мой ID": "/id",
  };
  if (lookup[text]) return lookup[text];
  const match = /^\/([a-z_]+)(?:@([A-Za-z0-9_]+))?(\s+.*)?$/i.exec(text);
  if (match) {
    // Don't respond to commands addressed to another bot in a group.
    if (match[2] && match[2].toLowerCase() !== "gymappeditbot") return "__ignore__";
    return "/" + match[1].toLowerCase() + (match[3] || "");
  }
  return text;
}

async function boundTopic(admin: Admin, chatId: number): Promise<BoundTopic | null> {
  const { data, error } = await admin.from("telegram_issue_bound_topics")
    .select("chat_id,thread_id").eq("chat_id", String(chatId)).maybeSingle();
  if (error) throw new Error("Topic lookup failed " + error.code);
  return data as BoundTopic | null;
}

async function userAllowed(admin: Admin, sender: number, ownerId: string): Promise<boolean> {
  if (String(sender) === ownerId) return true;
  const { data, error } = await admin.from("telegram_issue_authorized_users")
    .select("telegram_id").eq("telegram_id", String(sender)).maybeSingle();
  if (error) throw new Error("User permission lookup failed " + error.code);
  return Boolean(data);
}

async function processMessage(
  message: TgMessage, botToken: string, githubToken: string, ownerId: string,
) {
  const chatId = message.chat!.id!;
  const senderId = message.from!.id!;
  const chatType = message.chat!.type as ChatType;
  const threadId = chatType === "supergroup" ? message.message_thread_id : undefined;
  const original = message.text?.trim() || "";
  const command = normalizedCommand(original);
  if (command === "__ignore__") return;
  const owner = String(senderId) === ownerId;
  const admin = adminClient();
  const send = (text: string) => telegramSend(botToken, chatId, text, threadId);

  if (chatType === "supergroup") {
    // A bot is a group member, not a member of just one topic. The owner binds
    // exactly the desired forum topic from inside that topic with /bind.
    if (command === "/bind") {
      if (!owner) return;
      if (!threadId || threadId <= 0) {
        await send("Открой существующий топик группы и отправь /bind именно в нём.");
        return;
      }
      const { error } = await admin.from("telegram_issue_bound_topics").upsert({
        chat_id: String(chatId),
        thread_id: threadId,
        bound_by: ownerId,
        bound_at: new Date().toISOString(),
      }, { onConflict: "chat_id" });
      if (error) throw new Error("Topic bind failed " + error.code);
      await send("✅ Этот топик привязан к GymAppEditBot. \n\n" + RULES);
      return;
    }
    const bound = await boundTopic(admin, chatId);
    // Ignore all messages in other topics, including commands, so no accidental
    // Issues or unnecessary replies appear in the rest of the group.
    if (!bound || bound.thread_id !== threadId) return;
    if (command === "/unbind") {
      if (!owner) return;
      const { error } = await admin.from("telegram_issue_bound_topics")
        .delete().eq("chat_id", String(chatId)).eq("thread_id", threadId);
      if (error) throw new Error("Topic unbind failed " + error.code);
      await send("🔒 Топик отвязан. Для повторного подключения отправь здесь /bind.");
      return;
    }
  }

  // /id is safe for any person in the bound topic or in a private chat.
  // Unauthorized users need their ID to request access from the owner.
  if (command === "/id") {
    await send("🆔 Твой Telegram ID: " + senderId +
      (owner ? "\nТы администратор." : ""));
    return;
  }

  const authorized = await userAllowed(admin, senderId, ownerId);
  if (!authorized) {
    if (chatType === "private" && (command === "/start" || command === "/help" ||
      command === "/rules")) {
      await send("Доступ к созданию задач пока не выдан.\n" +
        "Твой Telegram ID: " + senderId +
        "\nПопроси администратора отправить /allow " + senderId + " своему боту.");
    }
    // Do not let unapproved group members see task details or create Issues.
    return;
  }

  if (command.startsWith("/allow ") || command.startsWith("/revoke ")) {
    if (!owner) {
      await send("Только администратор может менять доступ пользователей.");
      return;
    }
    const parts = command.split(/\s+/);
    if (parts.length !== 2 || !/^[0-9]{1,20}$/.test(parts[1])) {
      await send("Формат: /allow 123456789 или /revoke 123456789");
      return;
    }
    if (parts[1] === ownerId) {
      await send("Администратор всегда имеет доступ.");
      return;
    }
    if (parts[0] === "/allow") {
      const { error } = await admin.from("telegram_issue_authorized_users").upsert({
        telegram_id: parts[1], added_by: ownerId,
      }, { onConflict: "telegram_id" });
      if (error) throw new Error("Grant access failed " + error.code);
      await send("✅ Доступ разрешён пользователю " + parts[1] +
        ". Теперь он может создавать Issues в этом топике или в личном чате с ботом.");
    } else {
      const { error } = await admin.from("telegram_issue_authorized_users")
        .delete().eq("telegram_id", parts[1]);
      if (error) throw new Error("Revoke access failed " + error.code);
      await send("🔒 Доступ пользователя " + parts[1] + " отозван.");
    }
    return;
  }
  if (command === "/users") {
    if (!owner) return;
    const { data, error } = await admin.from("telegram_issue_authorized_users")
      .select("telegram_id").order("added_at", { ascending: true }).limit(50);
    if (error) throw new Error("User list failed " + error.code);
    await send("👥 Разрешённые пользователи:\n" + ownerId + " (администратор)" +
      ((data?.length || 0)
        ? "\n" + data!.map((u: { telegram_id: string }) => u.telegram_id).join("\n")
        : "\nДругих пользователей пока нет."));
    return;
  }
  if (command === "/start" || command === "/help" || command === "/rules") {
    await send(RULES);
    return;
  }
  if (command === "/bind" || command === "/unbind") {
    await send("Привязка доступна только администратору из топика супергруппы.");
    return;
  }
  if (command === "/allow" || command === "/revoke") {
    await send("Формат: /allow 123456789 или /revoke 123456789");
    return;
  }

  // Keep the original private-chat draft key for backwards compatibility.
  // Group drafts belong to a specific user in a specific topic.
  const scopeId = chatType === "private"
    ? String(chatId)
    : String(chatId) + ":" + String(threadId) + ":" + String(senderId);
  const pending = await readPending(admin, scopeId);

  if (command === "/cancel") {
    if (pending) await clearPending(admin, pending);
    await send("❌ Черновик задачи удалён.");
    return;
  }
  if (command === "/new") {
    if (pending) {
      if (!pending.composing) await savePending(admin, scopeId, { composing: true }, pending);
      await send("📝 Черновик открыт. Отправляй текст и скриншоты, затем нажми «✅ Отправить».");
      return;
    }
    await savePending(admin, scopeId, { composing: true });
    await send("🆕 Новая задача! Отправь текст и до 6 скриншотов. Затем нажми «✅ Отправить».");
    return;
  }
  if (command === "/create") {
    if (!pending) {
      await send("Нет черновика. Нажми «🆕 Новая задача».");
      return;
    }
    await createFromMessage(admin, botToken, githubToken, chatId,
      message.message_id!, pending.description, pending, threadId);
    return;
  }
  if (original.startsWith("/")) {
    await send("Неизвестная команда. Нажми «📖 Правила».");
    return;
  }

  if (chatType !== "private" && !pending) {
    // In a shared topic, ordinary chat must not become an Issue by accident.
    await send("Чтобы добавить задачу, сначала нажми «🆕 Новая задача».");
    return;
  }

  const photo = message.photo?.[message.photo.length - 1];
  const document = message.document;
  const imageDocument = document && (
    ["image/jpeg", "image/png", "image/webp"].includes(document.mime_type || "") ||
    /\.(png|jpe?g|webp)$/i.test(document.file_name || "")
  );
  if (photo || imageDocument) {
    const file = photo || document!;
    if (file.file_size && file.file_size > MAX_IMAGE_BYTES) {
      await send("Скриншот больше 8 МБ. Пришли файл меньшего размера.");
      return;
    }
    if ((pending?.images?.length || 0) >= MAX_IMAGES) {
      await send("Лимит — 6 скриншотов на одну задачу.");
      return;
    }
    const image: ImageRef = {
      fileId: file.file_id, messageId: message.message_id!,
      mime: photo ? "image/jpeg" : document?.mime_type || "image/png",
    };
    const { data: appended, error: appendError } = await admin.rpc("gym_telegram_append_image", {
      p_chat_id: scopeId,
      p_message_id: message.message_id!,
      p_file_id: image.fileId,
      p_mime: image.mime,
      p_caption: message.caption?.trim() || "",
    });
    if (appendError?.message?.includes("TOO_MANY_IMAGES")) {
      await send("Лимит — 6 скриншотов на одну задачу.");
      return;
    }
    if (appendError || !appended) {
      throw new Error("Photo queue failed " + (appendError?.code || "empty"));
    }
    const updated = appended as TaskDraft;
    if (chatType === "private" && message.caption?.trim() &&
      !message.media_group_id && !updated.composing) {
      await createFromMessage(admin, botToken, githubToken, chatId, message.message_id!,
        updated.description, updated, threadId);
    } else if (!message.media_group_id) {
      await send("📎 Скриншот добавлен (" + updated.images.length + "/6). " +
        (updated.composing
          ? "Пришли следующие материалы и нажми «✅ Отправить»."
          : "Теперь отправь описание текстом."));
    }
    return;
  }

  if (message.voice || message.audio) {
    await send("🎙 Голосовые сообщения пока не поддерживаются. Пожалуйста, отправь описание задачи текстом. Скриншоты можно прикреплять отдельно.");
    return;
  }

  if (original) {
    if (original.length > MAX_MESSAGE_LENGTH) {
      await send("Слишком длинное сообщение. Максимум " + MAX_MESSAGE_LENGTH + " символов.");
      return;
    }
    if (pending?.composing) {
      const saved = await savePending(admin, scopeId, {
        description: [pending.description, original].filter(Boolean).join("\n\n"),
      }, pending);
      await send("📝 Текст добавлен. Скриншотов: " + saved.images.length +
        ". Для создания нажми «✅ Отправить».");
    } else {
      await createFromMessage(admin, botToken, githubToken, chatId, message.message_id!,
        [pending?.description || "", original].filter(Boolean).join("\n\n"), pending, threadId);
    }
    return;
  }
  await send("Принимаю текстовые задачи и скриншоты JPG/PNG/WebP. Голосовые пока отключены. Нажми «📖 Правила».");
}

Deno.serve(async (req: Request) => {
  if (req.method === "GET") return json({ ok: true, service: "telegram-github-issues" });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const webhookSecret = Deno.env.get("TELEGRAM_WEBHOOK_SECRET");
  const botToken = Deno.env.get("TELEGRAM_BOT_TOKEN");
  const githubToken = Deno.env.get("GITHUB_ISSUES_TOKEN");
  const allowedId = Deno.env.get("TELEGRAM_ALLOWED_USER_ID");
  if (!webhookSecret || !botToken || !githubToken || !allowedId ||
      !/^\d+$/.test(allowedId)) {
    return json({ error: "Not configured" }, 503);
  }
  const received = req.headers.get("x-telegram-bot-api-secret-token") || "";
  if (!constantTimeEquals(received, webhookSecret)) {
    return json({ error: "Forbidden" }, 403);
  }

  let update: TgUpdate;
  try {
    update = await req.json() as TgUpdate;
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  const msg = update?.message;
  if (!msg?.chat?.id || !msg?.from?.id || !msg?.message_id || msg.from.is_bot ||
      !["private", "supergroup"].includes(msg.chat.type || "") ||
      (msg.chat.type === "private" && msg.chat.id !== msg.from.id)) {
    return json({ ok: true, ignored: true });
  }

  // Telegram gets a 2xx immediately. Long-running OpenAI/GitHub requests are
  // completed in the background, with a user-visible success or error message.
  EdgeRuntime.waitUntil((async () => {
    try {
      await processMessage(msg, botToken, githubToken, allowedId);
    } catch (error) {
      console.error("Telegram GitHub Issue failed:", String(error));
      try {
        const detail = String(error);
        const message = detail.includes("GITHUB_ISSUES_PERMISSION")
          ? "❌ GitHub отклонил создание Issue. Проверь GITHUB_ISSUES_TOKEN в Supabase: выбран репозиторий pavelmashina/gym-app и разрешение Issues → Read and write. После исправления отправь задачу снова."
          : detail.includes("GITHUB_RATE_LIMIT")
            ? "❌ GitHub временно ограничил запросы. Попробуй ещё раз позже."
                  : detail.includes("FILE_TOO_LARGE")
                    ? "❌ Файл слишком большой: скриншоты до 8 МБ."
                    : detail.includes("IMAGE_UNSUPPORTED")
                      ? "❌ Изображение должно быть PNG, JPEG или WebP."
                      : detail.includes("CLAUDE_API_HTTP_401") || detail.includes("CLAUDE_API_HTTP_403")
                        ? "❌ Claude API не разрешил запрос. Проверь ANTHROPIC_API_KEY в Supabase."
                        : detail.includes("CLAUDE_API_HTTP_402")
                          ? "❌ На счёте Claude API недостаточно средств. Проверь баланс Anthropic Console."
                          : detail.includes("CLAUDE_API_HTTP_429")
                            ? "❌ Достигнут лимит Claude API. Попробуй позже или проверь лимиты Anthropic."
                            : detail.includes("CLAUDE_")
                              ? "❌ Claude не смог оформить задачу. Проверь модель ANTHROPIC_MODEL и лимиты Claude API."
                              : "❌ Не удалось создать Issue. Проверь настройки или повтори сообщение.";
        await telegramSend(botToken, msg.chat!.id!, message, msg.message_thread_id);
      } catch (notifyError) {
        console.error("Telegram notification failed:", String(notifyError));
      }
    }
  })());
  return json({ ok: true });
});
