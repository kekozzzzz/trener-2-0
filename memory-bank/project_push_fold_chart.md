---
name: project_push_fold_chart
description: "чарт пуш-фолда (опен-шов) по позиции × стек-бэнду + колл BB vs пуш — собран 2026-06-30 из Nash-чартов Артёма; ДАННЫЕ готовы, в код не зашиты"
metadata: 
  node_type: memory
  type: project
  originSessionId: abcd9049-35cd-408c-8cf4-d3f7f643ff79
---

Пункт 2 чарт-системы (после RFI/BB-defense/iso): пуш-фолд. Источник — 12 Nash-чартов Артёма (опен-шов по позиции × 2 стек-бэнда + колл BB vs пуш), сверены с публичным Nash (888poker/pokercoaching/upswing — структура: пуш-зона ≤15bb, UTG ~12-15%, BTN ~39%, SB ~70% на ~12bb; короче стек = шире). Пуш-фолд — единственный полностью ОБЪЕКТИВНЫЙ спот (Nash), его чарты ≈ публичный Nash, поэтому «среднее» = сами эти чарты. Это закрывает старый долг фреймворка «нужен выверенный Nash-источник» ([[project_trainer_brain_next]] Шаг 1б).

Транскрипция глазами (синее=пуш; пограничные клетки широких SB/BTN ±1, скелет верный):

**Опен-шов 0-9bb (короче — шире):**
- UTG: 55+, A5s+, KTs+, QTs+, JTs, A9o+, KQo
- MP2: 33+, A2s+, K8s+, Q9s+, J9s+, T9s, A5o+, KTo+, QJo
- CO: 22+, A2s+, K3s+, Q7s+, J7s+, T7s+, 96s+, 86s+, 76s, A2o+, K8o+, Q9o+, JTo, T9o
- BTN: 22+, A2s+, K2s+, Q2s+, J5s+, T6s+, 96s+, 85s+, 75s+, 64s+, A2o+, K4o+, Q7o+, J8o+, T8o, 98o
- SB: 22+, A2s+, K2s+, Q2s+, J2s+, T4s+, 95s+, 84s+, 74s+, 64s+, 53s+, A2o+, K2o+, Q4o+, J7o+, T7o+

**Опен-шов 10-14bb (длиннее — тайтовее):**
- UTG: 66+, ATs+, KTs+, QTs+, JTs, AJo+
- MP2: 44+, A9s+, K9s+, Q9s+, J9s+, T9s, A9o+, KJo+
- CO: 22+, A2s+, K7s+, Q9s+, J9s+, T8s+, 98s, A7o+, K9o+, QJo, JTo
- BTN: 22+, A2s+, K2s+, Q5s+, J7s+, T7s+, 97s+, 86s+, 76s, A2o+, K7o+, Q9o+, JTo, T9o
- SB: 22+, A2s+, K2s+, Q4s+, J6s+, T6s+, 96s+, 85s+, 75s+, 64s+, A2o+, K5o+, Q8o+, J8o+, T8o

**Колл BB vs пуш 10bb:**
- vs UTG-пуш (тайтово): 66+, ATs+, KQs, AQo+
- vs BTN-пуш (широко): 22+, A2s+, K7s+, Q9s+, J9s+, T9s, A7o+, KTo+, QJo

**Позиции файла Артёма:** UTG / MP2 / CO / BTN / SB (одна ранняя UTG + одна средняя MP2; ср. с RFI, где у нас UTG/MP/HJ/CO/BTN/SB — при кодировании смапить).

**СТАТУС:** ✅ ЗАШИТО В КОД 2026-07-01, ЗАКОММИЧЕНО (ba0083f), локально НЕ задеплоено. config/poker/push-fold-chart.ts (данные+грейдер isOpenShoveSignificantlyWide+резолверы stackBandFor/pushPosition) + parser/open-shove.ts (детектор detectHeroOpenShove: Hero первым олл-ин на <15bb) + подсказка «опен-шов шире нормы» в обзоре. HJ сведён к CO, EARLY→UTG/MP2. Тесты зелёные. [[project_bb_defense_chart]] [[project_iso_vs_limp_chart]] [[project_training_rfi_chart]]
