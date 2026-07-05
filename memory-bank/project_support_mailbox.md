---
name: project_support_mailbox
description: "Ящик support@whygrid.app: мигрирует с Cloudflare-пересылки на VK WorkSpace (реальный ящик, приём+отправка от support@)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 4512e215-ed33-4325-bce0-6991d408b009
---

Живой ящик `support@whygrid.app` (контакт в оферте/политике + поддержка клиентов).

**СМЕНА РЕШЕНИЯ 2026-07-01:** уходим с Cloudflare Email Routing (пересылка в Gmail, приём-only) на **VK WorkSpace** (бывш. Mail.ru для бизнеса), бесплатный тариф «С рекламой» — чтобы отвечать людям **от лица support@**, а не с личного Gmail. Причина смены: пересылка не даёт отправлять от support@; западные (Google Workspace, Zoho, Migadu) из РФ не оплатить; Яндекс 360 платный (~249 ₽/мес). VK — бесплатно + оплата картой РФ.

**DNS whygrid.app (управляется в Cloudflare, NS `*.ns.cloudflare.com`) — сделано и проверено через 2 резолвера 2026-07-01:**
- подтверждение домена: TXT `@` = `mailru-domain: 7VGkxANHTkD2n5wN`
- MX `@` → `emx.mail.ru` приоритет 10 (три старых `route1/2/3.mx.cloudflare.net` УДАЛЕНЫ)
- SPF (одна TXT на `@`): `v=spf1 include:spf.unisender.ru include:_spf.mail.ru ~all` — Unisender сохранён, cloudflare-include убран, mail.ru добавлен. ⚠️ VK советовал `redirect=_spf.mail.ru` — НЕЛЬЗЯ (снёс бы Unisender); слили через include.
- DKIM: TXT `mailru._domainkey` = `v=DKIM1; k=rsa; p=MIGf...QAB` (полный ключ)

**Cloudflare Email Routing ОТКЛЮЧЁН:** в Settings → «...» → Disable → выбран **«Unlock and keep DNS records»** (НЕ «Delete and Disable» — та хотела снести заодно нашу SPF!). После unlock три cloudflare-MX удалены вручную. Пересылки в Gmail больше нет — приём теперь в VK.

**ТАРИФ:** бесплатный «С рекламой» НЕ даёт ящики на своём домене (только на поддомене .bizml.ru) — уперлись в «подключите платный тариф». Подключён **«Стартовый», период Месяц, 1 пользователь**: промо 1 ₽ первый месяц, дальше **159 ₽/мес**. Стартовый хватает (нужна только «Почта без рекламы»); Базовый/допы не брали. Оплата картой РФ — прошла.

**Ящик support@whygrid.app СОЗДАН 2026-07-01** (Админпанель→Пользователи→Создать; имя «Поддержка Whygrid», логин support, пароль у Артёма — Клод не хранит). Админ-аккаунт владельца VK = artemiy_bog@mail.ru (отдельно от ящика support@).

**РАБОТАЕТ 2026-07-01:** тест пройден в обе стороны — письмо с Gmail на support@ пришло в ящик VK; ответ ушёл на Gmail от «Поддержка Whygrid» <support@whygrid.app>, НЕ в спаме (SPF/DKIM подхватились). Косметика на будущее: VK подставляет подпись «Отправлено из Почты Mail» — убирается в Почта→Настройки→Подпись.

**СВЯЗКА С САЙТОМ:** форма поддержки на сайте шлёт сообщение в Telegram (быстрый сигнал), а ОТВЕЧАЕТ Артём из ящика support@ на почту, что человек указал в форме. Форма пока НЕ задеплоена — блокирует незавершённая i18n-миграция в рабочем дереве (next build падает на /login, не из-за формы). [[project_support_form]]

**Отдельно:** робот-домен `no-reply.whygrid.app` (Unisender Go, транзакционные письма регистрации/сброса) — другое, MX-миграция его не трогает, SPF-include Unisender сохранён специально. См. [[project_email_and_reset]]. Связка с формой поддержки на сайте: [[project_support_form]].

**❗ПРИ ПЕРЕЕЗДЕ ЗА РУБЕЖ** (~лето 2027, [[project_infra_roadmap]]): почту пересобрать — за границей доступен Google Workspace, `support@` логично перевести туда. VK — временное РУ-решение.
