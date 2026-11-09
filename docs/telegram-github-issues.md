# Telegram → GitHub Issues (gym-app)

> Обновление: добавлены кнопки в Telegram, привязка существующего группового топика и несколько пользователей. Подробная инструкция: [Настройка группового топика](telegram-topic-setup.md).

Telegram-бот создаёт Issues в репозитории
[`pavelmashina/gym-app`](https://github.com/pavelmashina/gym-app/issues).

## Где расположен код

- `supabase/functions/telegram-github-issues/index.ts`
- Отдельная Supabase Edge Function `telegram-github-issues`
- Supabase project: `sjggdpyficjkpcmybbfr`
- URL webhook:
  `https://sjggdpyficjkpcmybbfr.supabase.co/functions/v1/telegram-github-issues`

Функция принимает личные текстовые и голосовые сообщения, фото и изображения-файлы от указанного пользователя Telegram.
Команды: `/start`, `/help`, `/id`, `/new`, `/create`, `/cancel`.
Новые задачи автоматически становятся Issues и получают ссылку в ответе Telegram.

## 1. Создать Telegram-бота

Открыть [@BotFather](https://t.me/BotFather) и отправить `/newbot`.
BotFather выдаст токен. **Никогда не добавлять его в GitHub или переписку.**

Узнать свой числовой Telegram ID (например, через [@userinfobot](https://t.me/userinfobot)).

## 2. Создать GitHub fine-grained PAT

Открыть [GitHub → Fine-grained tokens](https://github.com/settings/personal-access-tokens/new).

- Resource owner: `pavelmashina`
- Repository access: **Only select repositories → gym-app**
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
| `GITHUB_ISSUES_TOKEN` | GitHub fine-grained PAT |
| `OPENAI_API_KEY` | Необходим для голосовых сообщений; опционален для текста |
| `OPENAI_MODEL` (опционально) | Например, `gpt-4.1-mini` — структура Issue |
| `OPENAI_TRANSCRIPTION_MODEL` (опционально) | `gpt-transcribe` по умолчанию — распознавание голоса |

Если `OPENAI_API_KEY` отсутствует, текстовые задачи продолжат работать без AI-структурирования, но голосовые сообщения не будут расшифровываться.

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
2. Отправить обычное текстовое сообщение — появится Issue.
3. Отправить голосовое — бот расшифрует речь, создаст Issue и пришлёт ссылку (нужен `OPENAI_API_KEY`).
4. Отправить скриншот **без подписи**, затем голосовое или текстовое описание — одна Issue со скриншотом.
5. Отправить **одну фотографию с подписью** — одна Issue с изображением.
6. Для нескольких сообщений в любом порядке: `/new`, затем фото/голос/текст, затем `/create`.
7. Проверить фотографии и требования в [Issues gym-app](https://github.com/pavelmashina/gym-app/issues).

## Безопасность и особенности

- Токены не хранятся в репозитории и не передаются в браузер.
- Только указанный Telegram ID вправе создавать Issues.
- Проверка webhook secret происходит до обработки тела запроса.
- Ответ Telegram webhook отправляется сразу, а задача обрабатывается фоном.
- Перед созданием бот ищет маркер данного сообщения среди 100 последних Issues, чтобы при повторной доставке не создать дубль. Это **best effort**, не транзакционная защита от гонок.
- Для закрытого репозитория требуется надлежащий GitHub PAT.
- Issues репозитория `gym-app` публичные: не отправляй боту личные данные и секреты.
- Поддерживаются до **6 скриншотов по 8 МБ** на задачу. Можно отправлять фото или PNG/JPEG/WebP как файл. Голосовое — до **20 МБ**.
- Скриншоты размещаются в отдельном **публичном** Supabase Storage bucket `telegram-issue-screenshots` и отображаются в GitHub Issue через Markdown. Любой с URL сможет их просматривать.
- Внутренние черновики хранятся в таблице `public.telegram_issue_drafts`; RLS включён, публичный доступ запрещён. Функция `gym_telegram_append_image` добавляет файлы атомарно для альбомов.
- Файлы в хранилище не удаляются автоматически при удалении Issue.
- Обычный текст без черновика сразу создаёт Issue. Фото без подписи добавляется в ожидающую задачу; следующее текстовое/голосовое описание создаёт Issue. Для материалов в любом порядке используй `/new` и `/create`.
- Чтобы отменить незавершённую задачу, отправь `/cancel`.
- Если OpenAI API вернёт ошибку, Issue не создаётся, и бот сообщает об ошибке. Токены не логируются.


## Хранилище и SQL

Миграции подготовлены в `supabase/sql/telegram-issue-drafts.sql` и `supabase/sql/telegram-issue-append-image.sql` и применены в спортивном Supabase-проекте. Дополнительные разрешения GitHub Contents не требуются; бот использует прежний `GITHUB_ISSUES_TOKEN` с доступом Issues.

