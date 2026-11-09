import "jsr:@supabase/functions-js/edge-runtime.d.ts";

declare const EdgeRuntime: { waitUntil(task: Promise<unknown>): void };

type TgMessage = {
  message_id?: number;
  text?: string;
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

function formatIssue(draft: IssueDraft, marker: string) {
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

async function createIssue(token: string, draft: IssueDraft, marker: string) {
  const res = await githubRequest(token, GITHUB_API, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: draft.title,
      body: formatIssue(draft, marker),
    }),
  });
  if (!res.ok) throw new Error(`GitHub create issue HTTP ${res.status}`);
  const issue = await res.json();
  if (!issue.html_url || typeof issue.number !== "number") {
    throw new Error("GitHub returned an invalid issue");
  }
  return { number: issue.number as number, url: issue.html_url as string };
}

async function processMessage(message: TgMessage, botToken: string, githubToken: string) {
  const chatId = message.chat!.id!;
  const text = message.text?.trim() || "";
  if (text === "/start" || text === "/help") {
    await telegramSend(botToken, chatId,
      "Отправь описание задачи обычным сообщением. Я оформлю GitHub Issue " +
      "в pavelmashina/gym-app и пришлю ссылку.");
    return;
  }
  if (text === "/id") {
    await telegramSend(botToken, chatId, `Твой Telegram ID: ${chatId}`);
    return;
  }
  if (!text) {
    await telegramSend(botToken, chatId,
      "Пока принимаю только текстовые сообщения с описанием задачи.");
    return;
  }
  if (text.length > MAX_MESSAGE_LENGTH) {
    await telegramSend(botToken, chatId,
      `Слишком длинное сообщение. Максимум ${MAX_MESSAGE_LENGTH} символов.`);
    return;
  }

  const marker = `<!-- telegram-gym-app:${chatId}:${message.message_id} -->`;
  const existing = await findExisting(githubToken, marker);
  if (existing) {
    await telegramSend(botToken, chatId, `Эта задача уже создана: ${existing}`);
    return;
  }

  const draft = await makeDraft(text);
  const issue = await createIssue(githubToken, draft, marker);
  await telegramSend(botToken, chatId,
    `✅ Issue #${issue.number} создан\n\n${draft.title}\n\n${issue.url}`);
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
        await telegramSend(botToken, msg.chat!.id!,
          "❌ Не удалось создать Issue. Проверь настройки или повтори сообщение.");
      } catch (notifyError) {
        console.error("Telegram notification failed:", String(notifyError));
      }
    }
  })());
  return json({ ok: true });
});
