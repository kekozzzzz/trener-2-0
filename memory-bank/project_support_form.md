---
name: project_support_form
description: Форма поддержки на сайте → сообщение владельцу в Telegram; страница /support + ссылка в подвале
metadata: 
  node_type: memory
  type: project
  originSessionId: 8d8be68c-f4d9-4fb9-bf85-83aab73b8d1c
---

Форма «Написать в поддержку»: страница `/support` (app/support/) + клиентская форма
(support-form.tsx) → server action `features/support/actions.ts` шлёт текст владельцу в
Telegram через `getNotifyAdapter().notifyAdmin` (тот же мост/релей КЗ, что у сторожа;
инфраструктуру не поднимали). Ссылка «Поддержка» в подвале (site-footer.tsx) ведёт на
`/support`. Антиспам: переиспользован `features/auth/rate-limit` (ключ `support:<ip>`,
лимиты в `config/support.ts`, env-override) + honeypot-поле «company». Email залогиненного
подставляется; при сбое доставки — фолбэк на `OPERATOR.contactEmail` (config/legal).
Текст пользователя пересылается КАК ЕСТЬ, не исполняется (правило инъекций). План:
plans/2026-07-01-форма-поддержки-в-телеграм.md.

Статус на 2026-07-01: `tsc` зелёный. **ЧАСТИЧНО ЗАКОММИЧЕНО в master — `73fdb17`**
(feat(поддержка)): только app/support/page.tsx + support-form.tsx + features/support/actions.ts
+ config/support.ts + план. ⚠️ НЕ закоммичены (перемешаны с i18n, уедут с ней): ссылка
«Поддержка» в подвале (components/site-footer.tsx → href /support) и строки переводов
(messages/ru.json+en.json, namespace "Support" + Footer.support). Форма использует next-intl,
поэтому этот коммит сам по себе не собирается — сложится, когда закоммитят i18n.

Статус 2026-07-02: **ЗАДЕПЛОЕНА LIVE** — уехала вместе с i18n-коммитом fe0020e (деплой
2026-07-01); проверено 2026-07-02: whygrid.app/support отдаёт форму (Email + Message + Send).
Старая заметка «build падает на /login» устарела — то было ДО деплоя i18n; сейчас в рабочем
дереве идёт фаза 3 i18n (письма, Player.locale) параллельной сессии — из-за неё падают
auth-тесты и собрать/деплоить из папки временно нельзя. ОСТАЛОСЬ по форме: hardening/security
(данные пользователей) — не делался. [[project_support_mailbox]] [[project_i18n_english]]
