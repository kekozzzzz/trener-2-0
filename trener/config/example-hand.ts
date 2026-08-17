// Раздача для публичной страницы-примера (/example) — plans/2026-08-17-публичный-пример-разбора.md.
// НАСТОЯЩИЙ HH-файл (не выдуманный макет): Test/GG20260611-1320 - Bounty Hunters Deepstack
// Turbo 5.40.txt, раздача №59. Соперник уже под GG-хэш-ID (анонимный стол) — реальных
// ников нет, обезличивать вручную не требовалось. Числа страница считает САМА через
// parseHandHistory() из этого текста — правило 1 (парсер считает, никто не переписывает
// вручную вычисленные значения).
//
// Вопрос тренера, ответ игрока и вердикт — настоящий сократовский диалог, пройденный
// вручную по правилам config/prompts/dialogue-question.ts и verdict.ts (не сгенерирован
// вызовом LLM в момент сборки страницы, зафиксирован текстом после утверждения игроком).
export const EXAMPLE_HAND_RAW = `Poker Hand #TM6064956218: Tournament #289598162, Bounty Hunters Deepstack Turbo $5.40 Hold'em No Limit - Level8(250/500(75)) - 2026/06/11 19:19:55
Table '83' 8-max Seat #5 is the button
Seat 1: d343e857 (13,448 in chips)
Seat 2: 235f10e6 (18,501 in chips)
Seat 3: 39a4990c (8,146 in chips)
Seat 4: 7681630e (31,092 in chips)
Seat 5: d136e5bc (25,072 in chips)
Seat 6: Hero (35,487 in chips)
Seat 7: 50f36c91 (23,364 in chips)
Seat 8: 523381ef (14,127 in chips)
Hero: posts the ante 75
d343e857: posts the ante 75
523381ef: posts the ante 75
d136e5bc: posts the ante 75
39a4990c: posts the ante 75
50f36c91: posts the ante 75
235f10e6: posts the ante 75
7681630e: posts the ante 75
Hero: posts small blind 250
50f36c91: posts big blind 500
*** HOLE CARDS ***
Dealt to d343e857
Dealt to 235f10e6
Dealt to 39a4990c
Dealt to 7681630e
Dealt to d136e5bc
Dealt to Hero [Ac Ks]
Dealt to 50f36c91
Dealt to 523381ef
523381ef: folds
d343e857: raises 750 to 1,250
235f10e6: folds
39a4990c: folds
7681630e: folds
d136e5bc: folds
Hero: raises 3,750 to 5,000
50f36c91: folds
d343e857: calls 3,750
*** FLOP *** [6h 7d 4h]
Hero: bets 11,100
d343e857: calls 8,373 and is all-in
Uncalled bet (2,727) returned to Hero
Hero: shows [Ac Ks] (Ace high)
d343e857: shows [5s 6s] (a pair of Sixes)
*** TURN *** [6h 7d 4h] [2h]
*** RIVER *** [6h 7d 4h 2h] [Kh]
*** SHOWDOWN ***
Hero collected 27,846 from pot
*** SUMMARY ***
Total pot 27,846 | Rake 0 | Jackpot 0 | Bingo 0 | Fortune 0 | Tax 0
Board [6h 7d 4h 2h Kh]
Seat 1: d343e857 showed [5s 6s] and lost with a pair of Sixes
Seat 2: 235f10e6 folded before Flop
Seat 3: 39a4990c folded before Flop
Seat 4: 7681630e folded before Flop
Seat 5: d136e5bc (button) folded before Flop
Seat 6: Hero (small blind) showed [Ac Ks] and won (27,846) with a pair of Kings
Seat 7: 50f36c91 (big blind) folded before Flop
Seat 8: 523381ef folded before Flop
`;

// Индекс действия «Hero: bets 11,100» в этой раздаче — точка решения, которую разбирает
// вопрос тренера (тот же принцип, что tableActionIndex в настоящем диалоге).
export const EXAMPLE_HAND_DECISION_INDEX = 19;
