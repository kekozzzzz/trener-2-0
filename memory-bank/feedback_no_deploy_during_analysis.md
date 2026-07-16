---
name: feedback_no_deploy_during_analysis
description: "не деплоить, пока Артём активно разбирает раздачи — перезапуск от выкатки роняет текущий шаг диалога/вердикта на 10 минут"
metadata: 
  node_type: memory
  type: feedback
  originSessionId: 55794d0c-1dfa-4aae-bb16-b87b8c5d1e5b
---

Не выкатывать на прод, пока Артём активно разбирает раздачи. Если он сейчас в разборе — придержать деплой до перерыва, при сомнении спросить.

**Почему:** пуш в master = автодеплой сторожем → сборка + `pm2 restart` на ВМ. Если перезапуск приходит в момент, когда воркер обрабатывает шаг (`GENERATE_DIALOGUE_QUESTION` / `GENERATE_VERDICT`), задача остаётся осиротевшей в `PROCESSING`. `claimTask` берёт только `PENDING`, а «жнец» (`reapStuckTasks`, порог `STUCK_PROCESSING_TIMEOUT_MS` = 10 мин) вернёт её в очередь только через 10 минут. Для игрока это «ОТВЕТ ПРИНЯТ, ГОТОВИМ СЛЕДУЮЩИЙ ШАГ…» висит и не двигается. Реальный инцидент 2026-07-06: три [тихо]-деплоя подряд во время разбора + одновременный флап КЗ-релея (Connect Timeout к 92.60.75.87:443, через него весь LLM-трафик) → прибитая генерация вердикта; самовосстановилось через 10 мин жнецом (крон `/api/cron/run-tasks` каждые 15с зовёт `kickWorker`→reap+drain).

**Как применять:** перед деплоем убедиться, что Артём не в активном разборе (спросить, если не уверен). Диагностика зависаний разбора — SSH через релей-jump: `pm2 logs trener --err` (ищи `ConnectTimeout`/`fetch failed`), состояние очереди в проде — `sudo -u postgres psql -d trener_prod -c "SELECT id,type,status,attempt,updated_at FROM tasks ORDER BY updated_at DESC LIMIT 15"` (только чтение). Инфраструктура здорова ≠ разбор идёт: `/api/health` проверяет только Anthropic-пинг, а диалог на DeepSeek через тот же релей — флап релея health не ловит. Связано: [[project_deploy_procedure]] [[project_queue_latency]] [[project_remote_workspace]] [[feedback_server_ops_self]]
