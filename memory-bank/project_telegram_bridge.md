---
name: project_telegram_bridge
description: "Telegram-мост для управления Claude с телефона — бот @kekoz_bot, поднимается сам в VS Code"
metadata: 
  node_type: memory
  type: reference
  originSessionId: 2260643b-8baf-4a17-84a2-ed38651ffb2b
---

Артём управляет Claude с телефона через Telegram-плагин (channel). Бот: **@kekoz_bot**. Его Telegram chat_id/user id в allowlist: **440359604** (ответы слать сюда через reply tool).

Как устроено:
- Плагин `telegram@claude-plugins-official` включён глобально в `~/.claude/settings.json`, поэтому MCP-сервер моста поднимается автоматически при каждом запуске сессии в расширении Claude Code для VS Code. Флаг `--channels` нужен только для запуска через терминальный CLI, не для VS Code.
- Мост жив, пока открыта сессия Claude Code в VS Code на компьютере. Закрыл панель/VS Code/выключил комп — бот молчит.
- Сообщения с телефона прилетают в открытую на компе сессию; работа идёт в реальных файлах проекта, итог уходит обратно в Telegram.

Артём — не программист, объяснять простым языком (см. [[user_programming_level]]). Конфиг канала: `~/.claude/channels/telegram/` (access.json, .env с токеном — не читать токен целиком).

**Обновление 2026-07-05:** основной мост переехал на КЗ-релей и работает 24/7 в tmux (комп не нужен) — см. [[project_remote_workspace]]. Мост на компе теперь запасной; одновременно два моста не гонять (конфликт за одного бота).
