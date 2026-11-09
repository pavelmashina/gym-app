import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.111.0";

declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };

type TgMessage = {
  message_id?: number;
  text?: string;
  caption?: string;
  media_group_id?: string;
  photo?: Array<{ file_id: string; file_size?: number }>;
  voice?: { file_id: string; file_size?: number; mime_type?: string };
  audio?: { file_id: string; file_size?: number; mime_type?: string; file_name?: string };
  document?: { file_id: string; file_size?: number; mime_type?: string; file_name?: string };
  from?: { id?: number };
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
const MAX_AUDIO_BYTES = 20 * 1024 * 1024;
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

async function telegramSend(token: string, chatId: number, text: string) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
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

async function makeDraft(input: string): Promise<IssueDraft> {
  const key = Deno.env.get("OPENAI_API_KEY");
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
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: Deno.env.get("OPENAI_MODEL") || "gpt-4.1-mini",
      temperature: 0,
      response_format: {
        type: "json_schema",
        json_schema: { name: "github_issue", strict: true, schema },
      },
      messages: [
        {
          role: "system",
          content:
            "Ты создаёшь GitHub Issues для русскоязычного спортивного веб-приложения. " +
            "Сохраняй КАЖДОЕ конкретное требование, название экрана, текст интерфейса, " +
            "числовое значение, размер шрифта и ограничение пользователя. " +
            "Не придумывай новых функций, требований или технических причин. " +
            "title: точный короткий заголовок до 120 символов. " +
            "problem: кратко, только если проблема указана. " +
            "tasks: конкретные действия, одно на пункт; не теряй ни одного. " +
            "criteria: проверяемые критерии, вытекающие из tasks, без добавления функций. " +
            "P0 — приложение или ключевая функция заблокированы; " +
            "P1 — серьёзная ошибка; P2 — остальные изменения и улучшения. " +
            "Верни только JSON по схеме.",
        },
        { role: "user", content: input },
      ],
      max_completion_tokens: 2500,
    }),
    signal: AbortSignal.timeout(35000),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}`);
  const data = await res.json();
  const output = data?.choices?.[0]?.message?.content;
  if (typeof output !== "string") throw new Error("OpenAI returned no content");
  const parsed = JSON.parse(output) as IssueDraft;
  if (!parsed.title?.trim() || !Array.isArray(parsed.tasks) ||
      !parsed.tasks.some((task) => typeof task === "string" && task.trim())) {
    throw new Error("OpenAI produced an incomplete issue");
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

async function readPending(admin: Admin, chatId: number): Promise<TaskDraft | null> {
  const { data, error } = await admin.from("telegram_issue_drafts")
    .select("chat_id,batch_id,description,images,composing,updated_at")
    .eq("chat_id", String(chatId)).maybeSingle();
  if (error) throw new Error("Draft lookup: " + error.code);
  return data as TaskDraft | null;
}

async function savePending(admin: Admin, chatId: number, values: Partial<TaskDraft>, old?: TaskDraft | null): Promise<TaskDraft> {
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

async function speechToText(botToken: string, fileId: string, mimeType: string): Promise<string> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) throw new Error("AUDIO_KEY_MISSING");
  const bytes = await telegramFile(botToken, fileId, MAX_AUDIO_BYTES);
  const mime = mimeType === "audio/mpeg" ? "audio/mpeg" :
    mimeType === "audio/mp4" ? "audio/mp4" : "audio/ogg";
  const extension = mime === "audio/mpeg" ? "mp3" : mime === "audio/mp4" ? "m4a" : "ogg";
  const form = new FormData();
  form.append("file", new Blob([bytes], { type: mime }), "task." + extension);
  form.append("model", Deno.env.get("OPENAI_TRANSCRIPTION_MODEL") || "gpt-transcribe");
  form.append("prompt", "Русский язык. Термины спортивного веб-приложения: тренировки, подходы, повторения, GitHub, Supabase, UI, карточки.");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST", headers: { Authorization: "Bearer " + key }, body: form,
    signal: AbortSignal.timeout(70000),
  });
  if (!res.ok) throw new Error("AUDIO_API_HTTP_" + res.status);
  const response = await res.json();
  if (typeof response?.text !== "string" || !response.text.trim()) throw new Error("AUDIO_EMPTY");
  return response.text.trim();
}

async function createFromMessage(
  admin: Admin, botToken: string, githubToken: string, chatId: number,
  messageId: number, description: string, pending: TaskDraft | null,
) {
  if (!description.trim()) {
    await telegramSend(botToken, chatId, "Сначала добавь описание текстом или голосом.");
    return;
  }
  if (description.length > 12000) {
    await telegramSend(botToken, chatId, "Описание слишком длинное. Максимум 12000 символов.");
    return;
  }
  const marker = pending
    ? "<!-- gym-telegram-task:" + pending.batch_id + " -->"
    : "<!-- gym-telegram-task:" + crypto.randomUUID() + ":" + messageId + " -->";
  const already = await findExisting(githubToken, marker);
  if (already) {
    if (pending) await clearPending(admin, pending);
    await telegramSend(botToken, chatId, "Эта задача уже существует: " + already);
    return;
  }
  const draft = await makeDraft(description);
  const screenshots = pending?.images?.length
    ? await saveScreenshots(admin, botToken, pending.images, pending.batch_id)
    : [];
  const created = await createIssue(githubToken, draft, marker, screenshots);
  if (pending) await clearPending(admin, pending);
  await telegramSend(botToken, chatId,
    "✅ Issue #" + created.number + " создан\n\n" + draft.title +
    (screenshots.length ? "\n📎 Скриншотов: " + screenshots.length : "") +
    "\n\n" + created.url);
}

async function processMessage(message: TgMessage, botToken: string, githubToken: string) {
  const chatId = message.chat!.id!;
  const text = message.text?.trim() || "";
  const admin = adminClient();
  if (text === "/start" || text === "/help") {
    await telegramSend(botToken, chatId,
      "Отправь текст или голосовое — создам GitHub Issue.\n" +
      "📎 Можно прислать до 6 скриншотов перед описанием задачи.\n" +
      "/new — собирать задачу из нескольких сообщений;\n" +
      "/create — создать её;\n" +
      "/cancel — отменить.\n" +
      "Фото с подписью (не альбом) создаёт задачу сразу.\n" +
      "⚠️ Прикреплённые скриншоты будут публично доступны.");
    return;
  }
  if (text === "/id") {
    await telegramSend(botToken, chatId, "Твой Telegram ID: " + chatId);
    return;
  }
  const pending = await readPending(admin, chatId);
  if (text === "/cancel") {
    if (pending) await clearPending(admin, pending);
    await telegramSend(botToken, chatId, "Черновик очищен.");
    return;
  }
  if (text === "/new") {
    if (pending) {
      await telegramSend(botToken, chatId,
        "Черновик уже есть. Пришли остальные материалы и отправь /create либо /cancel.");
      return;
    }
    await savePending(admin, chatId, { composing: true });
    await telegramSend(botToken, chatId,
      "📝 Начали задачу. Присылай текст, голосовые и до 6 скриншотов в любом порядке. " +
      "Затем отправь /create.");
    return;
  }
  if (text === "/create") {
    if (!pending) {
      await telegramSend(botToken, chatId, "Нет черновика. Отправь описание задачи.");
      return;
    }
    await createFromMessage(admin, botToken, githubToken, chatId, message.message_id!,
      pending.description, pending);
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
      await telegramSend(botToken, chatId, "Скриншот больше 8 МБ. Пришли файл меньшего размера.");
      return;
    }
    if ((pending?.images?.length || 0) >= MAX_IMAGES) {
      await telegramSend(botToken, chatId, "Лимит — 6 скриншотов на одну задачу.");
      return;
    }
    const image: ImageRef = { fileId: file.file_id, messageId: message.message_id!,
      mime: photo ? "image/jpeg" : document?.mime_type || "image/png" };
    const updated = await savePending(admin, chatId, {
      images: [...(pending?.images || []), image],
      description: [pending?.description || "", message.caption?.trim() || ""]
        .filter(Boolean).join("\n\n"),
    }, pending);
    if (message.caption?.trim() && !message.media_group_id && !updated.composing) {
      await createFromMessage(admin, botToken, githubToken, chatId, message.message_id!,
        updated.description, updated);
    } else if (!message.media_group_id) {
      await telegramSend(botToken, chatId,
        "📎 Скриншот добавлен (" + updated.images.length + "/6). " +
        (updated.composing ? "Пришли материалы, затем /create."
          : "Теперь отправь задачу текстом или голосом."));
    }
    return;
  }

  const voice = message.voice || message.audio;
  if (voice) {
    if (voice.file_size && voice.file_size > MAX_AUDIO_BYTES) {
      await telegramSend(botToken, chatId, "Голосовое слишком большое. Максимум 20 МБ.");
      return;
    }
    const transcript = await speechToText(botToken, voice.file_id,
      message.voice ? "audio/ogg" : voice.mime_type || "audio/ogg");
    if (pending?.composing) {
      const saved = await savePending(admin, chatId, {
        description: [pending.description, transcript].filter(Boolean).join("\n\n"),
      }, pending);
      await telegramSend(botToken, chatId, "🎙 Распознано:\n" +
        transcript.slice(0, 1300) + "\n\nЧерновик сохранён. Скриншотов: " +
        saved.images.length + ". Для создания отправь /create.");
    } else {
      await createFromMessage(admin, botToken, githubToken, chatId, message.message_id!,
        [pending?.description || "", transcript].filter(Boolean).join("\n\n"), pending);
    }
    return;
  }

  if (text) {
    if (text.length > MAX_MESSAGE_LENGTH) {
      await telegramSend(botToken, chatId,
        "Слишком длинное сообщение. Максимум " + MAX_MESSAGE_LENGTH + " символов.");
      return;
    }
    if (pending?.composing) {
      const saved = await savePending(admin, chatId, {
        description: [pending.description, text].filter(Boolean).join("\n\n"),
      }, pending);
      await telegramSend(botToken, chatId,
        "📝 Текст добавлен. Скриншотов: " + saved.images.length + ". Для создания отправь /create.");
    } else {
      await createFromMessage(admin, botToken, githubToken, chatId, message.message_id!,
        [pending?.description || "", text].filter(Boolean).join("\n\n"), pending);
    }
    return;
  }
  await telegramSend(botToken, chatId,
    "Принимаю текст, голосовые сообщения и скриншоты JPG/PNG/WebP.");
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
  if (!msg?.chat?.id || !msg?.from?.id || !msg?.message_id ||
      msg.chat.type !== "private" || msg.chat.id !== msg.from.id ||
      String(msg.from.id) !== allowedId) {
    return json({ ok: true, ignored: true });
  }

  // Telegram gets a 2xx immediately. Long-running OpenAI/GitHub requests are
  // completed in the background, with a user-visible success or error message.
  EdgeRuntime.waitUntil((async () => {
    try {
      await processMessage(msg, botToken, githubToken);
    } catch (error) {
      console.error("Telegram GitHub Issue failed:", String(error));
      try {
        const detail = String(error);
        const message = detail.includes("GITHUB_ISSUES_PERMISSION")
          ? "❌ GitHub отклонил создание Issue. Проверь GITHUB_ISSUES_TOKEN в Supabase: выбран репозиторий pavelmashina/gym-app и разрешение Issues → Read and write. После исправления отправь задачу снова."
          : detail.includes("GITHUB_RATE_LIMIT")
            ? "❌ GitHub временно ограничил запросы. Попробуй ещё раз позже."
            : detail.includes("AUDIO_KEY_MISSING")
            ? "❌ Для голосовых нужен OPENAI_API_KEY в Supabase → Edge Functions → Secrets."
            : detail.includes("AUDIO_API_HTTP_401")
              ? "❌ Неверный OPENAI_API_KEY для распознавания голоса."
              : detail.includes("AUDIO_API_HTTP_429")
                ? "❌ Лимит OpenAI API. Проверь баланс и ограничения."
                : detail.includes("AUDIO_API_HTTP_")
                  ? "❌ Не удалось распознать голосовое. Проверь OpenAI API."
                  : detail.includes("FILE_TOO_LARGE")
                    ? "❌ Файл слишком большой: скриншоты до 8 МБ, аудио до 20 МБ."
                    : detail.includes("IMAGE_UNSUPPORTED")
                      ? "❌ Изображение должно быть PNG, JPEG или WebP."
                      : detail.includes("OpenAI")
                        ? "❌ Ошибка OpenAI API. Проверь OPENAI_API_KEY."
                        : "❌ Не удалось создать Issue. Проверь настройки или повтори сообщение.";
        await telegramSend(botToken, msg.chat!.id!, message);
      } catch (notifyError) {
        console.error("Telegram notification failed:", String(notifyError));
      }
    }
  })());
  return json({ ok: true });
});
