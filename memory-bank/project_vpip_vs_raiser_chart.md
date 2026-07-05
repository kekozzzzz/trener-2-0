---
name: project_vpip_vs_raiser_chart
description: "чарт vs одиночный опен (3-бет/холодный колл) по нашей позиции — собран 2026-07-01, beginner-баланс; ДАННЫЕ готовы, в код не зашиты"
metadata: 
  node_type: memory
  type: project
  originSessionId: abcd9049-35cd-408c-8cf4-d3f7f643ff79
---

Последний чарт пункта 2 (после RFI/BB-defense/iso/push-fold): что делаем, столкнувшись с одиночным опеном, по НАШЕЙ позиции — 3-бет / холодный колл (флэт) / фолд. Источник — солверные чарты Артёма «VPIP(3bet/CC) vs 1 raiser» (coach-materials/free-pos, image14/21/17/20/24) + внешние (upswing cold-call, pokercoaching, gtowizard).

**Самый размытый спот набора** (4 цвета: 3-бет красный / флэт золото / пары синий / премиумы бледные=и-так-3-бет; зависит и от позиции открывашки, что чарты обобщают). Поэтому упрощён сильнее прочих. Принцип (его + внешние): холодный колл — в основном В ПОЗИЦИИ; рано/OOP — 3-бет-или-фолд, флэт почти нет; 3-бет = велью + блефы балансом (как у BB-defense — мягкая граница для подсказки «3-бет шире нормы»).

**Финал (vs одиночный опен, по нашей позиции):**
- **UTG/MP (рано, флэт мало):** 3-бет велью QQ+,AKs,AKo,AQs; блеф-вес A5s,A4s,KJs; колл 99–22, AJs+, KQs.
- **HJ:** 3-бет велью QQ+,AKs,AKo,AQs; блеф-вес A5s–A3s,KJs,AJo,KQo; колл TT–22, ATs+, KTs+, QJs, JTs, T9s.
- **CO:** 3-бет велью JJ+,AKs,AKo,AQs,AQo; блеф-вес A5s–A3s,KJs,KQo,AJo,KTo,76s,65s; колл 99–22, ATs+, KTs+, QTs+, JTs, T9s, 98s, 87s, 76s.
- **BTN (флэт широкий, IP):** 3-бет велью JJ+,AKs,AKo,AQs,AQo; блеф-вес A5s–A2s,K9s+,KJo,QJo,ATo,KTo,QTo,JTo; колл 99–22, A9s+, K9s+, Q9s+, J9s+, T9s, 98s, 87s, 76s, 65s, ATo+.
- **SB (vs опен, OOP — чаще 3-бет/фолд):** 3-бет велью QQ+,AKs,AKo,AQs; блеф-вес A5s–A3s, suited-бродвей; колл (мало) 99–22, AJs+, KQs.

**СТАТУС:** ✅ ЗАШИТО В КОД 2026-07-01, ЗАКОММИЧЕНО (ba0083f), локально НЕ задеплоено. config/poker/vs-open-chart.ts (3-бет велью/блеф по нашей позиции + грейдер isVsOpenThreeBetSignificantlyWide) + parser/vs-open.ts (детектор detectHeroVsOpen: Hero НЕ в BB, одиночный опен впереди) + подсказка «3-бет против опена шире нормы» в обзоре. Грейдим только 3-бет (колл — справка). [[project_bb_defense_chart]] [[project_push_fold_chart]] [[project_iso_vs_limp_chart]] [[project_training_rfi_chart]]
