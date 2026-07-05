---
name: project_posting_bot
description: бот @whygrid_bot — автопостинг в канал с одобрением + поддержка; план и статус
metadata: 
  node_type: memory
  type: project
  originSessionId: b08fafe9-0dba-4682-a973-fe02954e2e1c
---

Строим Telegram-бота для канала @whygrid. Решение 2026-06-26: **один бот на проект — @whygrid_bot** (имя «Whygrid»), делает ВСЁ по проекту; @kekoz_bot освобождается под другие проекты, статистика/алерты/дайджест переезжают на @whygrid_bot.

**Функции:**
1. Автопостинг 4×/нед (Пн/Ср/Пт/Вс ~19:00 МСК) с ОБЯЗАТЕЛЬНЫМ одобрением: бот шлёт Артёму превью (картинка+текст) с кнопками ✅/✏️, публикует только по ✅.
2. Публичная кнопка «✍️ Написать нам» под постами → t.me/whygrid_bot.
3. Поддержка в три слоя: FAQ-шаблоны на типовое → кнопка «нужен живой ответ» → эскалация Артёму с черновиком ИИ (кнопки Отправить/Поправить), уходит только после одобрения.

**Безопасность (требование Артёма про prompt-инъекции):** командует и получает статистику только chat_id 440359604; чужие сообщения никогда не исполняются как инструкции, только данные; ИИ лишь готовит черновики, отправка строго по кнопке. Антиспам на входящих.

**Инфра (разведка 2026-06-26):** notify-адаптер `trener/infrastructure/adapters/notify/telegram.ts` (fetch, без SDK), через релей КЗ `TELEGRAM_BASE_URL=https://92.60.75.87/tg` + `x-proxy-secret`. Прод: pm2 `trener`, деплой `~/deploy.sh` каждые 5 мин, cron через `/api/cron/*` с `CRON_SECRET`. ПРОБЕЛ: бот пока только ОТПРАВЛЯЕТ — добавляем приём (webhook). Очередь постов — на ФАЙЛАХ, без миграции БД (чтобы не трогать схему).

**✅ ЗАДЕПЛОЕНО И ПОДКЛЮЧЕНО 2026-06-26 (коммит be38652):** код постинга в проде; бот @whygrid_bot подключён. На прод `.env.production` прописаны (через файл→SSH, в чат не светили): `TELEGRAM_BOT_TOKEN`=токен @whygrid_bot (заменил старый @kekoz_bot — теперь дайджест/сторож/health тоже на нём), `TELEGRAM_CHANNEL_ID="@whygrid"`, `TELEGRAM_WEBHOOK_SECRET` (64 симв, openssl rand). Вебхук зарегистрирован: `setWebhook url=https://whygrid.app/api/webhooks/telegram secret_token=<секрет> allowed_updates=[callback_query,message]` → getWebhookInfo ок, 0 ошибок. getMe возвращает username=whygrid_bot. health telegram:ok. Рестарт делал ПРОСТЫМ `pm2 restart trener` (без --update-env — иначе слетает NODE_EXTRA_CA_CERTS, см. [[project_deploy_status]]). Приветственный закреп канала Артём выложил РУКАМИ (без «Закрепил. Поехали»). ⚠️ Чтобы дайджест/сторож/превью доходили — Артём должен нажать Start в @whygrid_bot. Крон планировщика постов `/api/cron/post-scheduler` ЗАВЕДЁН (каждые 5 мин). Очередь наполняется server-side: картинка + `queue.json` кладутся в `.post-queue` рядом с cwd приложения (`/home/trener-vm/trener-2-0/trener/.post-queue`, в gitignore), `addPost` HTTP-роута нет — пишем файл напрямую (python).

**✅ ПЕРВЫЙ ПОСТ ОПУБЛИКОВАН в @whygrid 2026-06-26** (slive-01, разбор A8-пуша в гиганта). Конвейер обкатан: рука из БД (аккаунт kekoz) → переделка → карточка (HTML-шаблон из `design/post-card-02b.html` → playwright скриншот 1080×1080) → `queue.json`+png в `.post-queue` → `post-scheduler`. ОТПРАВКА в канал работает (sendPhoto через релей).

**✅ КНОПКИ ✅/✏️ РАБОТАЮТ — через ОПРОС getUpdates (починено 2026-06-27, коммит 3683830, проверено вживую: Артём нажал ✏️ → пришло «Пост отложен»).** Предыстория: вебхук НЕ работал — Telegram физически не достукивается до релея КЗ (`getWebhookInfo last_error: "Connection timed out"`, при этом фаервол релея ОТКРЫТ — глухой именно сетевой маршрут Telegram→KZ). Исходящее через релей работает, входящее (Telegram→нас) — нет. РЕШЕНИЕ — перевели приём на опрос: `getUpdates`+`deleteWebhook` в `telegram-api`, опросчик `infrastructure/posting/poll.ts` (offset в файле `.post-queue/tg-offset`, атомарно), крон-роут `/api/cron/poll-telegram` (Bearer CRON_SECRET) в crontab **раз в минуту**. Апдейты идут через ТОТ ЖЕ `handleTelegramUpdate`, что и вебхук — логика одобрения и безопасность (только admin chat_id) общие. Вебхук СНЯТ (`deleteWebhook`; getUpdates и вебхук взаимоисключающи — не регистрировать вебхук обратно, иначе опрос отвалится 409). Тот же опрос потом откроет приём входящих в поддержку (3 слоя). Тест: `__tests__/posting/poll.test.ts`.

**РАБОЧИЙ ПРОЦЕСС постинга (runbook) сохранён 2026-06-27: `.business/marketing/posting-runbook.md`** — пошагово от «взять реальную раздачу из базы (аккаунт kekoz) → переделать хорошо/суть оставить → текст+карточка (HTML-шаблон → playwright, file:// заблокирован → локальный http-сервер) → queue.json в .post-queue → превью → ✅/✏️». ОТЛОЖЕНО по решению Артёма (займёмся позже): пост №2, заселение канала (он ПУСТОЙ, 0 подписчиков — постинг пока витрина, не охват; нужен тёплый старт + посев), стандарт анонимизации для чужих рук.

План: `plans/2026-06-26-телеграм-бот-постинг.md`. Связано с [[project_marketing]], [[project_telegram_bridge]], [[project_watchdog_bot]], [[feedback_server_ops_self]].
