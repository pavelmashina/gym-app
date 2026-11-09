# Telegram → GitHub Issues (gym-app)

Telegram-бот создаёт Issues в репозитории
[`pavelmashina/gym-app`](https://github.com/pavelmashina/gym-app/issues).

## Где расположен код

- `supabase/functions/telegram-github-issues/index.ts`
- Отдельная Supabase Edge Function `telegram-github-issues`
- Supabase project: `sjggdpyficjkpcmybbfr`
- URL webhook:
  `https://sjggdpyficjkpcmybbfr.supabase.co/functions/v1/telegram-github-issues`

Функция принимает только личные текстовые сообщения от указанного пользователя Telegram.
Команды: `/start`, `/help`, `/id`.
Новые сообщения автоматически становятся Issues и получают ссылку в ответе Telegram.

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
| `OPENAI_API_KEY` (опционально) | Ключ OpenAI API для красивого оформления задач |
| `OPENAI_MODEL` (опционально) | Например, `gpt-4.1-mini` |

Если `OPENAI_API_KEY` отсутствует, бот всё равно создаёт Issue с исходным текстом,
без AI-структурирования.

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

1. Открыть своего бота, отправить `/start` — должен ответить.
2. Написать: «Экран тренировочного цикла: удалить заголовок “Один цикл” и установить размер названий тренировок 14».
3. Проверить новую задачу в [Issues gym-app](https://github.com/pavelmashina/gym-app/issues).
4. Сверить, что текст и числа сохранены, а ссылка в ответе ведёт на эту задачу.

## Безопасность и особенности

- Токены не хранятся в репозитории и не передаются в браузер.
- Только указанный Telegram ID вправе создавать Issues.
- Проверка webhook secret происходит до обработки тела запроса.
- Ответ Telegram webhook отправляется сразу, а задача обрабатывается фоном.
- Перед созданием бот ищет маркер данного сообщения среди 100 последних Issues, чтобы при повторной доставке не создать дубль. Это **best effort**, не транзакционная защита от гонок.
- Для закрытого репозитория требуется надлежащий GitHub PAT.
- Issues репозитория `gym-app` публичные: не отправляй боту личные данные и секреты.
- В первой версии доступны только текстовые сообщения: голосовые и изображения не обрабатываются.
- Если OpenAI API вернёт ошибку, Issue не создаётся, и бот сообщает об ошибке.
