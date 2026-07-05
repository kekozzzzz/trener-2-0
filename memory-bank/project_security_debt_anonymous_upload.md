---
name: project-security-debt-anonymous-upload
description: "Анонимная загрузка HH-файла без аутентификации — дыра закрыта 2026-06-15 регистрацией/сессией"
metadata: 
  node_type: memory
  type: project
  originSessionId: 3534b399-c84d-4c15-9d58-4f979a8291be
---

Закрыто 2026-06-15: добавлена регистрация/вход (`features/auth/`, httpOnly signed-cookie сессия, bcryptjs), `DEMO_PLAYER_ID` заменён на `session.playerId` во всех точках входа (`app/page.tsx`, `app/tournament/[id]/...`, `app/api/status/route.ts`, `app/status/page.tsx`). Каждый игрок видит только свои турниры.

**Why:** была единственная осознанно принятая дыра в безопасности (журнал решений `architecture/00-правила-проекта.md`, 2026-06-09), блокировавшая открытие продукта реальным пользователям.

**How to apply:** дыра закрыта. Rate limiting на вход/регистрацию реализован 2026-06-16 (in-memory счётчик `features/auth/rate-limit.ts`, пороги в `config/auth.ts`, журнал в `architecture/07-безопасность.md`; ретроспектива `retrospectives/2026-06-16_16-45_security-review-фиксы.md`). **Часовые лимиты на загрузку/чат — сделано 2026-06-18** (`features/usage/limit.ts` поверх того же счётчика + `config/usage-limits.ts`: загрузок 15/ч, LLM-сообщений 120/ч на игрока; применено к `handleUpload`, `submitAnswerAction`, `sendChatMessageAction`; API `/api/chat`,`/api/dialogue` — только GET-чтение). Оставшиеся auth-хвосты вне объёма: email-верификация и сброс пароля (нужен почтовый адаптер), аудит-лог неудачных входов — см. [[feedback_hardening_before_deploy]] перед следующим деплоем. Ретроспектива регистрации: `retrospectives/2026-06-15_08-10_регистрация.md`.
