---
name: project-db-setup
description: Состояние локальной базы данных и инфраструктуры проекта Тренер 2.0
metadata: 
  node_type: memory
  type: project
  originSessionId: e99fd2ff-4ca5-4f67-8884-7a22032eb595
---

Локальная база поднята. PostgreSQL 17 (winget), база `trener_dev`.

**Подключение:** `postgresql://postgres:postgres@localhost:5432/trener_dev`

**Где лежит код:** `c:\Users\Артем\Desktop\Тренер 2.0\trener\`

**Миграции применены:**
1. `20260609130444_init` — все 9 таблиц + базовые индексы
2. `20260609130542_add_partial_indexes` — partial indexes (WHERE deleted_at IS NULL / WHERE purged_at IS NULL) поверх
3. `20260609143157_add_tasks_queue` — таблица `tasks` (очередь фоновых задач)
4. `20260613124721_hand_all_parsed_optional_analysis` — `hands.analysis` стал nullable, добавлен `selected_for_card`

**Seed:** `npx prisma db seed` — 1 игрок, 1 профиль, 1 турнир (CARD_READY), 1 HH-файл, 3 раздачи, 1 диалог в QUESTION_ASKED.

**Why:** Запрет 6 снят (спрос подтверждён), начало строительства MVP.

**How to apply:** Перед любым `prisma migrate dev` убедиться, что нет залипших advisory locks (`SELECT pid FROM pg_stat_activity WHERE query LIKE '%advisory_lock%'`).

**Известная проблема (2026-06-13, не устранена):** `prisma migrate dev` отказывается работать — считает, что миграция `20260609143157_add_tasks_queue` "была изменена после применения" и требует полный reset схемы (`migrate reset`, удалит все данные). При этом `prisma migrate status` говорит "schema is up to date" и файл миграции не отличается от git HEAD — похоже на рассинхрон чексуммы в `_prisma_migrations` локальной dev-базы. Миграцию `20260613124721_hand_all_parsed_optional_analysis` применили вручную (`prisma db execute` + `prisma migrate resolve --applied`), без потери данных — но при следующей `prisma migrate dev` проблема повторится. Нужно либо разобраться с чексуммой, либо держать в голове, что новые миграции применять вручную тем же способом.
