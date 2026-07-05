---
name: project_remote_workspace
description: Облачное рабочее место Claude Code на КЗ-релее 92.60.75.87 — работа с планшета без домашнего компа (Termius/Telegram); настроено 2026-07-05
metadata: 
  node_type: memory
  type: project
  originSessionId: 6084d0bd-f8a7-4d75-b4b0-aa61379aee06
---

**Рабочее место Claude Code на релее** (VDSka 92.60.75.87, Ubuntu 24.04, 1 ГБ RAM + swap 1.9 ГБ) — чтобы Артём работал с планшета при выключенном домашнем компе. Настроено 2026-07-05.

Что стоит на релее:
- Node 22 + Claude Code CLI (глобально), репозиторий склонирован в `/root/trener` (SSH deploy key «relay-workspace (KZ VPS)» с правом записи в GitHub kekozzzzz/trener-2-0).
- Память Клода скопирована с ПК в `/root/.claude/projects/-root-trener/memory` (85 файлов на момент копии). ⚠️ Теперь ДВЕ копии памяти (ПК и релей) — свежие факты пишутся там, где шла работа; при возвращении домой синхронизировать (tar через ssh, как при переносе).
- Telegram-мост: конфиг `~/.claude/channels/telegram/` скопирован (тот же бот @kekoz_bot), плагин включён в `/root/.claude/settings.json`. Запуск: `claude --channels plugin:telegram@claude-plugins-official`. ⚠️ Два моста одновременно (ПК + релей) дерутся за одного бота (конфликт getUpdates) — основной мост теперь релейный.
- tmux-сессия `trener` + systemd-юнит `claude-bridge.service` (enabled): после перезагрузки релея сессия с Claude поднимается сама.
- Ключ релея добавлен на прод-ВМ (authorized_keys trener-vm@81.26.186.177) — деплой с релея НАПРЯМУЮ, без джампа: bundle из /root/trener → scp на ВМ → merge → build → pm2 restart (процедура та же, [[project_deploy_procedure]]).

Вход с планшета: приложение **Termius** → хост 92.60.75.87, порт 22, пользователь `artem`, вход по паролю (пароль у Артёма). При входе `.profile` сразу кидает в tmux-сессию Claude (`sudo /usr/local/bin/work`, NOPASSWD только на этот скрипт).

Логин Claude Code на релее — аккаунт Артёма (подписка), one-time OAuth.

Ограничения: на релее НЕТ `.business/` и `Test/` (они вне git).

**Финальная схема (выбор Артёма 2026-07-05): главное окно — вкладка «Код» в приложении Claude** (облачные сессии по GitHub-репо), Telegram/Termius — запасные на случай аварии прода (из облака нет доступа к серверам/логам).
- Память выгружена в репозиторий: `memory-bank/` (закрытый репо; паролей/ключей в памяти нет). CLAUDE.md велит облачным сессиям читать её первой и дописывать новые факты туда же. Три копии памяти (ПК ~/.claude, релей ~/.claude, репо memory-bank) — синхронизировать при случае.
- **Автодеплой:** сторож на релее `/usr/local/bin/autodeploy.sh` (systemd `autodeploy.timer`, каждые 2 мин, состояние `/root/.autodeploy-last`): fetch GitHub master → если новее задеплоенного и fast-forward → бандл → scp на ВМ → merge; docs-only изменения (md/memory-bank/plans/...) — без пересборки; иначе npm install при смене package-lock (зеркало npmmirror), prisma migrate+generate при новых миграциях, build с бэкапом .next в /tmp (при провале — откат и алерт), pm2 restart, проверка /api/health; отчёт о каждом шаге в Telegram Артёму (440359604) через токен бота из channels/telegram/.env. Пуш в master = команда «деплой» (правило обновлено с согласия Артёма).

[[project_telegram_bridge]] [[project_deploy_procedure]] [[project_deploy_status]] [[project_recurring_payments]] (⚠️ релей оплачивается — списание 16.07, без него умирают и рабочее место, и автодеплой).
