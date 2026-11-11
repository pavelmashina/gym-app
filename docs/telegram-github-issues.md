# Telegram → GitHub Issues (Gym App и «Рядом»)

> Telegram-бот поддерживает два проекта: в личном чате выбор кнопками, в супергруппе — отдельный топик для каждого проекта. [Выбор проекта](telegram-multi-project.md) · [Привязка топиков](telegram-topic-setup.md).

Telegram-бот создаёт Issues в [`gym-app`](https://github.com/pavelmashina/gym-app/issues) или [`ryadom-app`](https://github.com/pavelmashina/ryadom-app/issues) после выбора проекта.

## Где расположен код

- `supabase/functions/telegram-github-issues/index.ts`
- Отдельная Supabase Edge Function `telegram-github-issues`
- Supabase project: `sjggdpyficjkpcmybbfr`
- URL webhook:
  `https://sjggdpyficjkpcmybbfr.supabase.co/functions/v1/telegram-github-issues`

Функция принимает текстовые задачи, фото и изображения-файлы от владельца и разрешённых Telegram-пользователей. Голосовые сообщения пока отключены.
Команды: `/start`, `/help`, `/id`, `/new`, `/gym`, `/ryadom`, `/project`, `/create`, `/cancel`.
Новые задачи автоматически становятся Issues и получают ссылку в ответе Telegram.

## 1. Создать Telegram-бота

Открыть [@BotFather](https://t.me/BotFather) и отправить `/newbot`.
BotFather выдаст токен. **Никогда не добавлять его в GitHub или переписку.**

Узнать свой числовой Telegram ID (например, через [@userinfobot](https://t.me/userinfobot)).

## 2. Создать GitHub fine-grained PAT

Открыть [GitHub → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new).

- Resource owner: `pavelmashina`
- Repository access: **Only select repositories → gym-app и ryadom-app**
- Repository permissions: **Issues → Read and write**
- Остальные разрешения оставить по минимуму.
- Сохранить выданный токен в безопасном месте.

Это отдельный токен для бота; доступ ChatGPT к GitHub не передаётся Telegram/Supabase автоматически.

## 3. Настроить секреты в Supabase

Открыть [Supabase Edge Function Secrets](https://supabase.com/dashboard/project/sjggdpyficjkpcmybbfr/functions/secrets) и добавить:

| Название | Значение |
|---|---|
| `TELEGRAM_BOT_TOKEN` | Токен BotFather |
| `TELEGRAM_ALLOWED_USER_ID` | Твой **числовой** Telegram ID |
| `TELEGRAM_WEBHOOK_SECRET` | Случайная строка из латинских букв/цифр/`_`/`-` |
| `GITHUB_ISSUES_TOKEN` | GitHub fine-grained PAT с доступом Issues к обоим проектам (или только к Gym App, если задан отдельный токен для «Рядом») |
| `GITHUB_ISSUES_TOKEN_RYADOM` (необязательно) | Отдельный PAT с Issues → Read and write для ryadom-app; используется только для «Рядом», если задан |
| `ANTHROPIC_API_KEY` | Ключ Claude API для структурирования задач (создаётся в Anthropic Console) |
| `ANTHROPIC_MODEL` (опционально) | `claude-sonnet-5-5` по умолчанию |

Если `ANTHROPIC_API_KEY` отсутствует, текстовые задачи по-прежнему создаются в GitHub из исходного текста, без автоматического структурирования. Для текстовых задач со скриншотами дополнительный сервис распознавания аудио не требуется. **OpenAI, Groq и Cloudflare API не используются.**

**Важно:** подписка Claude Pro не включает API-запросы. Создай API-ключ в [Claude Console](https://platform.claude.com/settings/keys) и добавь его в Supabase Secrets как `ANTHROPIC_API_KEY`. Не присылай ключ в чат или репозиторий.

Секрет webhook можно сгенерировать в PowerShell:
`[guid]::NewGuid().ToString("N")`

Важно: **секрет webhook в Supabase должен в точности совпадать с secret_token при регистрации в Telegram.**

## 4. Развернуть Edge Function

Функция разворачивается отдельно, с отключённой проверкой Supabase JWT,
поскольку Telegram не умеет отправлять Supabase JWT. Вместо неё в обработчике
проверяется `X-Telegram-Bot-Api-Secret-Token` и числовой ID отправителя.

CLI команда при повторном развёртывании:

`supabase functions deploy telegram-github-issues --project-ref sjggdpyficjkpcmybbfr --no-verify-jwt`

Не отключай JWT глобально у других функций.

## 5. Привязать Telegram webhook

После сохранения **всех обязательных** секретов запустить PowerShell на своём компьютере:

```powershell
$token = Read-Host "Telegram bot token"
$secret = Read-Host "Telegram webhook secret (same as Supabase)"
$payload = @{
  url = "https://sjggdpyficjkpcmybbfr.supabase.co/functions/v1/telegram-github-issues"
  secret_token = $secret
  allowed_updates = @("message")
  max_connections = 1
} | ConvertTo-Json
Invoke-RestMethod -Uri "https://api.telegram.org/bot$token/setWebhook" -Method Post -ContentType "application/json" -Body $payload
```

В ответе Telegram должно быть `ok: true`. **Не вставляй токен в адресную строку браузера или в GitHub.**

## 6. Проверить

1. Открыть бота, отправить `/start` — должен перечислить команды.
2. В личном чате нажать «🆕 Новая задача», выбрать «🏋️ Gym App» или «🐾 Рядом», отправить текст и нажать «✅ Отправить». В групповых топиках проект выбирается автоматически по привязке.
3. Отправить голосовое — бот ответит, что обработка аудио временно отключена; Issue не создаётся.
4. Для новой задачи выбрать проект, затем отправить скриншот **без подписи** и текст — одна Issue со скриншотом в выбранном репозитории.
5. Для Gym App сохраняется прежнее поведение: в личном чате фотография с подписью без начатого черновика сразу создаёт Issue в Gym App.
6. Для нескольких сообщений в любом порядке: `/new`, **выбрать проект**, затем фото/текст, затем `/create`.
7. Проверить результаты в [Issues gym-app](https://github.com/pavelmashina/gym-app/issues) и [Issues ryadom-app](https://github.com/pavelmashina/ryadom-app/issues).

## Безопасность и особенности

- Токены не хранятся в репозитории и не передаются в браузер.
- Создавать Issues могут владелец и дополнительно разрешённые пользователи; доступ выдаётся командой `/allow ID`.
- Проверка webhook secret происходит до обработки тела запроса.
- Ответ Telegram webhook отправляется сразу, а задача обрабатывается фоном.
- Перед созданием бот ищет маркер данного сообщения среди 100 последних Issues, чтобы при повторной доставке не создать дубль. Это **best effort**, не транзакционная защита от гонок.
- Для закрытого репозитория требуется надлежащий GitHub PAT.
- Оба репозитория публичные: не отправляй боту личные данные и секреты.
- Поддерживаются до **6 скриншотов по 8 МБ** на задачу. Можно отправлять фото или PNG/JPEG/WebP как файл. Голосовые сообщения пока отключены.
- Скриншоты анализируются Claude Vision (если настроен `ANTHROPIC_API_KEY`) и размещаются в отдельном **публичном** Supabase Storage bucket `telegram-issue-screenshots` и отображаются в GitHub Issue через Markdown. Любой с URL сможет их просматривать.
- Внутренние черновики хранятся в таблице `public.telegram_issue_drafts`; RLS включён, публичный доступ запрещён. Функция `gym_telegram_append_image` добавляет файлы атомарно для альбомов.
- Файлы в хранилище не удаляются автоматически при удалении Issue.
- В личной беседе обычный текст без черновика по-прежнему создаёт Issue в **Gym App**. Для «Рядом» нажми «🐾 Рядом» перед отправкой материалов. В групповом топике проект определяет его привязка `/bind gym` или `/bind ryadom`, а не кнопка. Смена проекта после добавления текста/фото запрещена во избежание ошибочной маршрутизации.
- Чтобы отменить незавершённую задачу, отправь `/cancel`.
- Если Claude API вернёт ошибку при оформлении задачи, Issue не создаётся, и бот сообщает об ошибке. Голосовые сообщения не обрабатываются. Токены не логируются.


## Хранилище и SQL

Миграции подготовлены в `supabase/sql/telegram-issue-drafts.sql` и `supabase/sql/telegram-issue-append-image.sql` и применены в спортивном Supabase-проекте. Дополнительные разрешения GitHub Contents не требуются; бот использует `GITHUB_ISSUES_TOKEN` с доступом Issues к целевому репозиторию или отдельный `GITHUB_ISSUES_TOKEN_RYADOM`.



## Claude Ultra: подключение для текстовых задач и скриншотов

1. В [Claude → Settings → Billing](https://claude.ai/settings/billing) при доступности программы API credits → Link organization привязать организацию Claude Console.
2. Создать ключ в [Claude Console → API Keys](https://platform.claude.com/settings/keys).
3. Добавить ключ в [Supabase Edge Functions Secrets](https://supabase.com/dashboard/project/sjggdpyficjkpcmybbfr/functions/secrets) под именем `ANTHROPIC_API_KEY`.
4. При необходимости `ANTHROPIC_MODEL` задаёт Claude-модель. По умолчанию используется `claude-sonnet-5-5`.
5. В боте нажать «Новая задача», выбрать проект, прислать текст и скриншот, затем «Отправить». Проверить Issue в нужном репозитории.

**Голосовые временно отключены:** бот не загружает и не расшифровывает аудио. Cloudflare, Groq и OpenAI API для работы не нужны. ПК не требуется. Не пересылай API-ключи в чат.

## Диагностика таймаутов

Если GitHub, Supabase Storage или Claude не отвечают вовремя, бот теперь указывает этап ошибки вместо общей фразы. В журналах Edge Function пишется только название этапа, тип ошибки и прошедшее время — **без ключей, текста задачи и Telegram ID**. Проверка существующих GitHub Issues (GET) при сетевом таймауте повторяется один раз, а лимит ожидания GitHub API увеличен до 25 секунд.

**Не дублируй запрос создания**, если бот сообщает о таймауте на этапе создания GitHub Issue — сначала проверь список Issues целевого проекта, поскольку GitHub мог сохранить Issue, даже если не успел вернуть ответ. Черновик по возможности остаётся в Supabase до успешного создания.
