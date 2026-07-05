---
name: project_player_characteristic
description: "фича сводной характеристики игрока в личном кабинете («Аккаунт») — ЗАДЕПЛОЕНА (код+миграция на проде, сверено 2026-06-29)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 7cb3b99b-c855-44a8-9f01-fb12f3ccb8c5
---

Сводная характеристика игрока на странице «Аккаунт»: связный текст по ВСЕМ турнирам (стиль, средний VPIP, открывашки заметно шире нормы по всей дистанции) + пометка «точно примерно от 10 турниров».

**СТАТУС 2026-06-29: ЗАДЕПЛОЕНА НА ПРОД, НЕ ПЕРЕДЕЛЫВАТЬ** (код 901f04f от 25-го + миграция add_player_characteristic применены на проде, сверено). Изначально собрана 2026-06-25 (279/279, tsc + next build зелёные).

Архитектура (правило 1 — числа считает код, LLM формулирует):
- Агрегатор `features/profile/aggregate.ts` (чистая функция) — средние, распределение стилей, открывашки через `detectHeroOpen` + `isOpenSignificantlyWide`.
- Шаг очереди `GENERATE_PLAYER_CHARACTERISTIC` (`generate-player-characteristic.ts`), ставится из `generate-hand-analysis` при готовности карточки; идемпотентен по числу турниров; пишет в `PlayerProfile`.
- Поле `PlayerProfile.characteristic` (миграция 20260625120000); миграция применена ВЕЗДЕ — trener_dev + trener_test + ПРОД (прод подтверждён 2026-06-29, schema up to date).
- Промпт `config/prompts/player-characteristic.ts`, метод `generatePlayerCharacteristic` в LLM-порте; учёт расходов step=`PLAYER_CHARACTERISTIC`.
- Порог точности `config/profile.ts` `CHARACTERISTIC_RELIABLE_FROM = 10`; пометку рисует UI, не LLM.

Осталось до деплоя: миграция на проде; перезапуск dev-сервера (подхватить Prisma-клиент); отдельный hardening-проход [[feedback_hardening_before_deploy]]; показать промпт Артёму вживую. Поведенческие риды («не веришь большим ставкам») — отложены на шаг 2 (новые считалки парсера). См. [[project_trainer_brain_next]], [[project_training_rfi_chart]].
