---
name: project_email_and_reset
description: "Email-адаптер Unisender Go + сброс пароля + 4 транзакц. письма — ЗАДЕПЛОЕНО В ПРОД 2026-06-26 (ключ залит, миграция применена, крон напоминаний заведён)"
metadata: 
  node_type: memory
  type: project
  originSessionId: be6974ad-78bf-40c2-8a26-137da91e3e8b
---

**СТАТУС 2026-06-29: ЗАДЕПЛОЕНО НА ПРОД, НЕ ПЕРЕДЕЛЫВАТЬ** (письма, сброс пароля, инвалидация сессий, крон напоминаний — всё live, миграции применены, schema up to date; детали деплоя — в блоке ✅ ниже). Фразы «в прод НЕ выкачено» / «применить миграции ДО выката» ниже — ИСТОРИЯ от 2026-06-20.

Сделано 2026-06-20 (коммиты `38a8d9b` auth+сброс, `c6e9b98` reaper; в прод НЕ выкачено — *историческая пометка, см. статус вверху*):

- **Инвалидация сессий:** cookie несёт `iat`; гасится, если `players.sessions_valid_from` сдвинулась (смена пароля / «выйти на всех устройствах»). Проверка в WHERE `requireSession`/`getCurrentPlayer`/`authorizeHand`. `sessions_valid_from` при регистрации ставится из JS-времени (округление TIMESTAMP(3) vs JS-iat иначе отвергало бы свежую сессию).
- **Сброс пароля:** одноразовая ссылка по email, токен только в письме, в базе SHA-256 (`password_reset_tokens`), TTL 1ч, enumeration-safe, лимит по IP/email. Письмо inline (не через очередь). Страницы `/forgot-password`, `/reset-password`.
- **Email-адаптер** `adapters/email/unisender` (Unisender Go, аккаунт на кластере **go2**, email `artemiy_bog@mail.ru`, ID 8251326). Без `EMAIL_API_KEY` → noop. Отправитель `no-reply@whygrid.app`.

**Состояние Unisender (на 2026-06-20, домен АКТИВИРОВАН):** основной домен `whygrid.app` подтверждён (SPF/DKIM/DMARC/verification TXT в Cloudflare). Домен ссылок `no-reply.whygrid.app` — NS-делегация не годится (**SERVFAIL из-за DNSSEC**, Cloudflare не делегирует поддомен через NS в подписанной зоне), поэтому **CNAME-вариант**. Важно: при пересоздании домена в Unisender backend-номер сменился `42701`→`42709`, старые записи перестали подходить. Итоговые записи (оба DNS only, активны): `no-reply` CNAME→`42709.order.msgpanel.com`, `dkey._domainkey.no-reply` CNAME→`dkim.42709.order.msgpanel.com`. Wildcard `*.whygrid.app`→porkbun удалён (мешал поддоменам). Активация автоматическая, кнопки «Проверить» нет. **Отправка ПРОВЕРЕНА 2026-06-20: реальное письмо дошло во «Входящие» Gmail (не спам), HTTP 200 success.** Тариф: чистый «Бесплатный» НЕ годится — шлёт только на свои проверенные домены (403 код 903 на внешний gmail.com); переключились на **«Стартовый 6K»** (база бесплатно, 6000 писем/мес на любые адреса, превышение 150₽/1000). Кластер go2, URL `https://go2.unisender.ru/ru/transactional/api/v1/email/send.json`.

**Ключ** `EMAIL_API_KEY` лежит в локальном `trener/.env` (длина 40). Тест-скрипт: `trener/send-test-email.mjs` (`node --env-file=.env send-test-email.mjs <email>`) — удалить после проверки.

**Доделки и порядок деплоя — в `plans/2026-06-20-доделки-перед-деплоем.md`** (git). Критично: ⚠️ применить миграции на прод-БД ДО выката кода (sessions_valid_from, password_reset_tokens, payment_method_id) вручную как в dev/test (drift). См. [[project_deploy_status]], [[project_payments_yookassa]].

**✅ ЗАДЕПЛОЕНО В ПРОД 2026-06-26 (коммит be38652):** письма ВКЛЮЧЕНЫ. `EMAIL_API_KEY` залит в прод `.env.production` (40 симв., через файл на рабочем столе → SSH, в чат не светили), миграция `20260626120000_add_renewal_reminder_sent_at` применена (`prisma migrate deploy`, история была в синхроне — отработал чисто, без ресета), крон напоминаний добавлен (`30 4 * * *` → `/api/cron/subscription-reminders`, тот же CRON_SECRET). Отправитель `no-reply@whygrid.app` (подтверждён Артёмом). Боевой тест письмом НЕ делали — проверится на первой реальной регистрации/оплате. Доставка кода: бандл через релей (GitHub с прода режется), но GitHub с машины Артёма доступен — запушено и туда.

**Добавлено 2026-06-26 (план `plans/2026-06-26-транзакционные-письма.md`):** 4 транзакционных письма поверх сброса пароля. Решения Артёма: регистрация — мягкое приветствие (без блокировки/подтверждения почты). Письма: (1) приветствие при регистрации (`registerAction`); (2) «оплата прошла» (квитанция: тариф/сумма/до какого числа — в `applySucceededPayment`, шлётся ПОСЛЕ коммита транзакции, работает и для автопродления); (3) «пароль изменён» (смена в кабинете + сброс по ссылке); (4) напоминание «скоро спишется/истекает» за N дней (config `getRenewalReminderLeadDays`, по умолч. 3). Шаблоны: `features/auth/auth-emails.ts`, `features/subscription/subscription-emails.ts`. Напоминание = крон `app/api/cron/subscription-reminders` + джоба `infrastructure/jobs/subscription-reminders.ts` + новая колонка `subscriptions.renewal_reminder_sent_at` (дедуп; сбрасывается при продлении). tsc+билд+тесты зелёные (314). ⚠️ На прод вручную: миграция `20260626120000_add_renewal_reminder_sent_at` (ALTER идемпотентный, drift) + завести крон напоминаний раз в день (как renew-subscriptions). Без EMAIL_API_KEY письма молча не уходят (noop).
