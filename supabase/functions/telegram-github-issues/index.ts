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

type ProjectKey = "gym-app" | "ryadom-app";
const REPOSITORIES: Record<ProjectKey, { fullName: string; title: string }> = {
  "gym-app": { fullName: "pavelmashina/gym-app", title: "Gym App" },
  "ryadom-app": { fullName: "pavelmashina/ryadom-app", title: "Рядом" },
};
const issueApi = (project: ProjectKey) =>
  "https://api.github.com/repos/" + REPOSITORIES[project].fullName + "/issues";
const projectTitle = (project: ProjectKey) => REPOSITORIES[project].title;
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
  project: ProjectKey | null;
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
    [{ text: "🏋️ Gym App" }, { text: "🐾 Рядом" }],
    [{ text: "❌ Отмена" }, { text: "📖 Правила" }],
    [{ text: "🆔 Мой ID" }],
  ],
  resize_keyboard: true,
  is_persistent: true,
  input_field_placeholder: "Описание задачи или скриншот",
};
const GROUP_BUTTONS = {
  ...BUTTONS,
  keyboard: [
    [{ text: "🆕 Новая задача" }, { text: "✅ Отправить" }],
    [{ text: "❌ Отмена" }, { text: "📖 Правила" }],
    [{ text: "🆔 Мой ID" }],
  ],
};

async function telegramSend(token: string, chatId: number, text: string, threadId?: number) {
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId, text, disable_web_page_preview: true,
      ...(threadId ? { message_thread_id: threadId } : {}),
      reply_markup: threadId ? GROUP_BUTTONS : BUTTONS,
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

async function makeDraft(input: string, screenshotUrls: string[] = [], project: ProjectKey = "gym-app"): Promise<IssueDraft> {
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
        "Ты создаёшь GitHub Issues для русскоязычного " +
        (project === "ryadom-app"
          ? "приложения «Рядом» для владельцев питомцев (календарь, здоровье, документы, запасы, занятия). "
          : "спортивного веб-приложения Gym App (тренировки, упражнения, питание, статистика). ") +
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
    signal: AbortSignal.timeout(25000),
  });
}

async function findExisting(token: string, project: ProjectKey, marker: string): Promise<string | null> {
  // GET is safe to retry once after an occasional network timeout.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await githubRequest(
        token,
        `${issueApi(project)}?state=all&sort=created&direction=desc&per_page=100`,
      );
      if (!res.ok) throw new Error(`GitHub duplicate check HTTP ${res.status}`);
      const issues = await res.json();
      if (!Array.isArray(issues)) throw new Error("Unexpected GitHub issues response");
      return issues.find((issue: { body?: string; html_url?: string }) =>
        typeof issue.body === "string" && issue.body.includes(marker)
      )?.html_url || null;
    } catch (error) {
      const retryable = error instanceof Error &&
        (error.name === "TimeoutError" || error.name === "AbortError" ||
          error instanceof TypeError);
      if (!retryable || attempt > 0) throw error;
      console.warn("GitHub issue lookup timeout: retrying GET once");
    }
  }
  return null;
}

async function createIssue(token: string, project: ProjectKey, draft: IssueDraft, marker: string, screenshotUrls: string[] = []) {
  const res = await githubRequest(token, issueApi(project), {
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
    .select("chat_id,batch_id,description,images,composing,project,updated_at")
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
    project: values.project !== undefined ? values.project : (old?.project ?? "gym-app"),
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

// Diagnostic labels contain no user text, credentials, file IDs or Telegram IDs.
async function runIssueStage<T>(stage: string, task: () => Promise<T>): Promise<T> {
  const started = Date.now();
  try {
    return await task();
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error("Telegram Issue stage failed", {
      stage, errorName: name, elapsedMs: Date.now() - started,
    });
    if (name === "TimeoutError" || name === "AbortError") {
      throw new Error("ISSUE_TIMEOUT_" + stage);
    }
    throw error;
  }
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
  // Existing drafts from before the migration still belong to Gym App.
  if (pending?.project === null) {
    await telegramSend(botToken, chatId, "Сначала выбери проект: 🏋️ Gym App или 🐾 Рядом.", threadId);
    return;
  }
  const project: ProjectKey = pending?.project || "gym-app";
  const repositoryToken = project === "ryadom-app"
    ? (Deno.env.get("GITHUB_ISSUES_TOKEN_RYADOM") || githubToken)
    : githubToken;
  const markerPrefix = project === "ryadom-app" ? "ryadom-telegram-task:" : "gym-telegram-task:";
  const marker = "<!-- " + markerPrefix + (pending ? pending.batch_id : fingerprint) + " -->";
  const already = await runIssueStage("GITHUB_CHECK", () =>
    findExisting(repositoryToken, project, marker));
  if (already) {
    if (pending) await clearPending(admin, pending);
    await telegramSend(botToken, chatId, "Эта задача уже существует: " + already, threadId);
    return;
  }
  const screenshots = pending?.images?.length
    ? await runIssueStage("SCREENSHOTS", () => saveScreenshots(admin, botToken, pending.images, pending.batch_id))
    : [];
  // Claude sees image URLs and the description, while GitHub Issue embeds images.
  const draft = await runIssueStage("CLAUDE", () => makeDraft(description, screenshots, project));
  const created = await runIssueStage("GITHUB_CREATE", () =>
    createIssue(repositoryToken, project, draft, marker, screenshots));
  // An Issue already exists: cleanup or Telegram notification failures must
  // never be misreported to the user as "Issue could not be created".
  if (pending) {
    try {
      await clearPending(admin, pending);
    } catch (error) {
      console.error("GitHub Issue created; draft cleanup failed", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
    }
  }
  try {
    await telegramSend(botToken, chatId,
      "✅ Issue #" + created.number + " создан — " + projectTitle(project) + "\n\n" + draft.title +
      (screenshots.length ? "\n📎 Скриншотов: " + screenshots.length : "") +
      "\n\n" + created.url, threadId);
  } catch (error) {
    console.error("GitHub Issue created; Telegram confirmation failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
  }
}


type ChatType = "private" | "supergroup";
type BoundTopic = { chat_id: string; thread_id: number; project: ProjectKey };
const RULES = [
  "📋 GymAppEditBot — задачи Gym App и «Рядом»",
  "",
  "Проекты: pavelmashina/gym-app и pavelmashina/ryadom-app.",
  "",
  "🆕 Новая задача — сначала выбрать проект.",
  "🏋️ Gym App / 🐾 Рядом — выбор проекта для текущего черновика.",
  "Можно также использовать команды /gym и /ryadom.",
  "📝 Пришли текст и до 6 скриншотов в любом порядке.",
  "✅ Отправить — создать Issue и получить ссылку.",
  "❌ Отмена — удалить незавершённый черновик.",
  "📖 Правила — показать эту памятку.",
  "🆔 Мой ID — узнать свой числовой Telegram ID.",
  "",
  "В личном чате текст без черновика создаёт задачу Gym App, как раньше.",
  "В групповом топике проект закреплён за топиком: «Новая задача» → материалы → «Отправить».",
  "Данные разных пользователей не смешиваются.",
  "",
  "⚠️ Репозиторий публичный. Скриншоты в Issues доступны всем по ссылке; не отправляй личные данные.",
  "",
  "Администратору: /bind gym или /bind ryadom — привязать топик к проекту; /unbind — отвязать.",
  "/allow ID — разрешить пользователю, /revoke ID — убрать доступ, /users — список.",
].join("\n");

function normalizedCommand(raw: string): string {
  const text = raw.trim();
  const lookup: Record<string, string> = {
    "🆕 Новая задача": "/new",
    "🏋️ Gym App": "/gym",
    "🐾 Рядом": "/ryadom",
    "Gym App": "/gym",
    "Рядом": "/ryadom",
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

async function boundTopic(admin: Admin, chatId: number, threadId: number | undefined): Promise<BoundTopic | null> {
  if (!threadId || threadId <= 0) return null;
  const { data, error } = await admin.from("telegram_issue_bound_topics")
    .select("chat_id,thread_id,project")
    .eq("chat_id", String(chatId))
    .eq("thread_id", threadId)
    .maybeSingle();
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

  let topicProject: ProjectKey | null = null;
  if (chatType === "supergroup") {
    // The existing Gym App binding is preserved; new topics are bound by
    // their (chat_id, thread_id) pair. A project can have one topic per group.
    if (command === "/bind" || command.startsWith("/bind ")) {
      if (!owner) return;
      if (!threadId || threadId <= 0) {
        await send("Открой нужный топик группы и отправь /bind gym или /bind ryadom именно в нём.");
        return;
      }
      const requestedProject: ProjectKey | null = command === "/bind gym" ? "gym-app"
        : command === "/bind ryadom" ? "ryadom-app" : null;
      if (!requestedProject) {
        await send("Формат привязки: /bind gym для Gym App или /bind ryadom для «Рядом».");
        return;
      }
      const existing = await boundTopic(admin, chatId, threadId);
      if (existing && existing.project !== requestedProject) {
        await send("⚠️ Этот топик уже привязан к " + projectTitle(existing.project) +
          ". Сначала отправь /unbind в этом топике. Текущие задачи останутся в прежнем проекте.");
        return;
      }
      const { data: matching, error: matchingError } = await admin
        .from("telegram_issue_bound_topics")
        .select("thread_id")
        .eq("chat_id", String(chatId))
        .eq("project", requestedProject)
        .limit(1);
      if (matchingError) throw new Error("Topic project lookup failed " + matchingError.code);
      if (matching?.length && matching[0].thread_id !== threadId) {
        await send("⚠️ Проект " + projectTitle(requestedProject) +
          " уже привязан к другому топику этой группы. Сначала выполни /unbind в старом топике.");
        return;
      }
      if (existing) {
        await send("✅ Этот топик уже закреплён за проектом " + projectTitle(existing.project) + ".");
        return;
      }
      const { error } = await admin.from("telegram_issue_bound_topics").upsert({
        chat_id: String(chatId),
        thread_id: threadId,
        project: requestedProject,
        bound_by: ownerId,
        bound_at: new Date().toISOString(),
      }, { onConflict: "chat_id,thread_id" });
      if (error) throw new Error("Topic bind failed " + error.code);
      await send("✅ Топик закреплён за проектом " + projectTitle(requestedProject) +
        ". Новые задачи из этого топика будут создаваться только в " +
        REPOSITORIES[requestedProject].fullName + ".\n\n" + RULES);
      return;
    }
    const bound = await boundTopic(admin, chatId, threadId);
    // Ignore other topics; unbound topics cannot accidentally create Issues.
    if (!bound) return;
    topicProject = bound.project;
    if (command === "/unbind") {
      if (!owner) return;
      const { error } = await admin.from("telegram_issue_bound_topics")
        .delete().eq("chat_id", String(chatId)).eq("thread_id", threadId);
      if (error) throw new Error("Topic unbind failed " + error.code);
      await send("🔒 Топик " + projectTitle(bound.project) +
        " отвязан. Для повторной привязки отправь /bind gym или /bind ryadom.");
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
  if (command === "/bind" || command.startsWith("/bind ") || command === "/unbind") {
    await send("Привязка доступна только администратору из топика супергруппы: /bind gym или /bind ryadom.");
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
  let pending = await readPending(admin, scopeId);
  // A group's topic binding is authoritative. Never silently reroute material
  // from an old draft that was created for another project.
  if (topicProject && pending?.project !== topicProject && pending &&
      command !== "/cancel") {
    if (pending.description.trim() || pending.images.length) {
      await send("⚠️ В этом топике есть старый черновик для другого проекта. " +
        "Нажми «❌ Отмена» и создай новую задачу — она будет направлена в " +
        projectTitle(topicProject) + ".");
      return;
    }
    pending = await savePending(admin, scopeId, { project: topicProject }, pending);
  }

  if (command === "/project") {
    if (topicProject) {
      await send("📁 Этот топик закреплён за проектом " + projectTitle(topicProject) +
        ". Для другого проекта перейди в соответствующий топик.");
    } else {
      await send("📁 Выбери проект для новой задачи: 🏋️ Gym App или 🐾 Рядом." +
        (pending?.project ? "\nТекущий черновик: " + projectTitle(pending.project) : ""));
    }
    return;
  }
  const selectedProject: ProjectKey | null = command === "/gym" ? "gym-app"
    : command === "/ryadom" ? "ryadom-app" : null;
  if (selectedProject) {
    if (topicProject) {
      await send("📁 Этот топик закреплён за проектом " + projectTitle(topicProject) +
        ". Кнопки выбора проекта работают только в личном чате.");
      return;
    }
    if (pending && pending.project !== selectedProject &&
        (pending.description.trim() || pending.images.length > 0)) {
      await send("⚠️ В черновике уже есть материалы для другого проекта. " +
        "Сначала нажми «❌ Отмена», затем создай задачу и выбери нужный проект.");
      return;
    }
    const updated = await savePending(admin, scopeId,
      { project: selectedProject, composing: true }, pending);
    await send("📁 Проект: " + projectTitle(updated.project!) +
      ". Теперь отправь текст и до 6 скриншотов, затем нажми «✅ Отправить».");
    return;
  }

  if (command === "/cancel") {
    if (pending) await clearPending(admin, pending);
    await send("❌ Черновик задачи удалён.");
    return;
  }
  if (command === "/new") {
    if (pending) {
      if (!pending.composing) await savePending(admin, scopeId, { composing: true }, pending);
      await send(pending.project === null
        ? "🆕 Выбери проект: 🏋️ Gym App или 🐾 Рядом."
        : "📝 Текущий черновик: " + projectTitle(pending.project) +
          ". Отправляй материалы или нажми «❌ Отмена», чтобы начать заново.");
      return;
    }
    await savePending(admin, scopeId, { composing: true, project: topicProject });
    await send(topicProject
      ? "🆕 Новая задача для " + projectTitle(topicProject) +
        "! Пришли текст и скриншоты, затем нажми «✅ Отправить»."
      : "🆕 Новая задача! Сначала выбери проект: 🏋️ Gym App или 🐾 Рядом.");
    return;
  }
  if (command === "/create") {
    if (!pending) {
      await send("Нет черновика. Нажми «🆕 Новая задача».");
      return;
    }
    if (pending.project === null) {
      await send("Сначала выбери проект: 🏋️ Gym App или 🐾 Рядом.");
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

  if (pending?.project === null) {
    await send("Сначала выбери проект: 🏋️ Gym App или 🐾 Рядом. Материалы пока не добавлены.");
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

  // Telegram gets a 2xx immediately. Long-running Claude/GitHub requests are
  // completed in the background, with a user-visible success or error message.
  EdgeRuntime.waitUntil((async () => {
    try {
      await processMessage(msg, botToken, githubToken, allowedId);
    } catch (error) {
      console.error("Telegram GitHub Issue failed:", String(error));
      try {
        const detail = String(error);
        const message = detail.includes("ISSUE_TIMEOUT_GITHUB_CHECK")
          ? "⏳ GitHub не ответил при проверке задач. Попробуй «Отправить» ещё раз — черновик сохранён."
          : detail.includes("ISSUE_TIMEOUT_SCREENSHOTS")
            ? "⏳ Не удалось загрузить скриншот вовремя. Черновик сохранён, попробуй «Отправить» ещё раз."
            : detail.includes("ISSUE_TIMEOUT_CLAUDE")
              ? "⏳ Claude слишком долго обрабатывал задачу. Попробуй «Отправить» ещё раз."
              : detail.includes("ISSUE_TIMEOUT_GITHUB_CREATE")
                ? "⏳ GitHub не подтвердил создание задачи. Сначала проверь GitHub Issues: задача могла создаться. Затем повтори при необходимости."
                : detail.includes("GITHUB_ISSUES_PERMISSION")
          ? "❌ GitHub отклонил создание Issue. Проверь GitHub-токен: доступ Issues → Read and write к нужному репозиторию (gym-app или ryadom-app). Для «Рядом» можно задать GITHUB_ISSUES_TOKEN_RYADOM. После исправления отправь задачу снова."
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
