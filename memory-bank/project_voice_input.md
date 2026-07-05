---
name: project_voice_input
description: "голосовой ввод — УСТАРЕЛО, перекрыто [[project_voice_input_stt]]: реализован на Voxtral и ЗАДЕПЛОЕН LIVE 2026-06-28 (не Yandex)"
metadata: 
  node_type: memory
  type: project
  originSessionId: 67a68d4f-187a-4fc9-ad89-fc008826609c
---

Голосовой ввод ответа: игрок может надиктовать ответ на сократовский вопрос голосом, а не печатать.

**⤳ ЭТА ЗАПИСЬ УСТАРЕЛА. Актуальное состояние — в [[project_voice_input_stt]].** Голос РЕАЛИЗОВАН и ЗАДЕПЛОЕН LIVE 2026-06-28 на движке Voxtral (OpenRouter→КЗ-релей), а НЕ на Yandex SpeechKit. Исходный гейт «не выкатывать без команды» и выбор Yandex — отменены реальностью: Артём дал ход, движок сменился. Ниже — историческая версия плана, держим для контекста решений.

**(история) Жёсткий гейт от 2026-06-25:** деплой микрофона только по явной команде. — снят, голос выкачен.
**(история) Решение по движку:** планировался Yandex SpeechKit; по факту выбран Voxtral (тот же релейный контур, что у [[project_llm_connectivity_block]] и [[project_deepseek_migration]]). Web Speech API так и остался только локальным макетом.

**(история) Фаза 1 — макет на Web Speech** (этот конкретный макет в прод не шёл; боевой голос реализован отдельно на Voxtral и LIVE — см. [[project_voice_input_stt]]). Компонент `components/ui/mic-button.tsx` (по дизайн-системе, движок макета — браузерный Web Speech для локальной оценки UX в Chrome), помощник `lib/append-transcript.ts`, forwardRef в `textarea.tsx`; встроено в `answer-form.tsx` и `chat-form.tsx`. tsc чистый.

**Фаза 2 — боевой SpeechKit: НЕ начата.** Точка замены — функция `start()` в mic-button.tsx. Нужно: разрешение на платный сервис, адаптер распознавания (правило 4), бэкенд-эндпоинт, MediaRecorder, учёт стоимости, hardening. План: `plans/2026-06-25-голосовой-ввод-ответа.md`.

**Запускаем на первых платящих игроках** (см. [[project_validation_test]]).
