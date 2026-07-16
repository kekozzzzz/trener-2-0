---
name: project-upload-guide-screenshots
description: "Скриншоты в подсказке «Как выгрузить руки» по румам — готовы, НЕ закоммичены; Chico ждёт свой скрин из клиента"
metadata: 
  node_type: memory
  type: project
  originSessionId: 2c72a911-65f2-4c88-983d-17a13b74c18f
---

Подсказка «Как выгрузить руки» (hand-history-guide.tsx, /how-to-export + /analyze):
2026-07-10 вбиты обработанные скриншоты по румам — GG (5 своих, PokerCraft),
PokerStars, Winamax (3: меню/Options/Tracker), 888poker, ACR (2), iPoker.
Карта «шаг → файл» — STEP_SHOTS в компоненте; файлы в trener/public/help/<room>/.
Сырые + источники: Test/hh-screens-raw/<room>/sources.md (вне git).

- Шаги Winamax переписаны под НОВЫЙ клиент: галочки «Save My Hand History» нет,
  история пишется сама, путь в Options → Tracker → Hand history file location.
- BetOnline (Chico) БЕЗ картинки: главный экран настроек нигде не опубликован,
  публичное меню мыльное — Артём решил пока убрать; папка trener/public/help/chico/
  осталась на диске (rm в deny-листе), можно удалить руками.
- Код НЕ закоммичен — ждёт команды Артёма.

[[project_winamax_888_ps_parsers]]
