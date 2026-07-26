// Сборка RangeRead: находит в истории диалога ответы, где игрок отмечал диапазон
// на сетке ({{range}}-вопросы), разбирает нотацию из текста ответа и считает
// ТОЧНЫЕ числа парсера против каждого диапазона (правило 1): эквити руки Hero,
// живые комбо, сверку с VPIP оппонента, нарезку между двумя отметками.
//
// Всё детерминированно и fail-safe: не распозналась нотация или улица — просто
// нет факта (промпт остаётся прежним), никакого угадывания.
// План: plans/2026-07-03-диапазонный-движок.md.

import type { TableSnapshot } from "@/parser/types";
import type { OpponentFact } from "@/parser/opponent-profile";
import type { DialogueRoundSummary, RangeRead } from "@/infrastructure/adapters/llm/types";
import { splitMarkers } from "@/config/dialogue";
import { parseRangeNotation } from "@/config/poker/hand-range";
import { percentOf, formatRange } from "@/config/poker/hand-grid";
import { equityVsRange, cutBetween } from "@/parser/range-equity";
import { rangeBuckets } from "@/parser/range-buckets";
import { tableStateUpTo, lastActionIndex, boardUpToStreet } from "@/parser/table-state";
import { detectHeroOpenFacedThreeBet } from "@/parser/vs-open-3bet-faced";
import { referenceThreeBetRange } from "@/config/poker/vs-open-chart";
import { equityVsRangePreflop } from "@/parser/cooler";

const GRID_CODES_TOTAL = 169;

// Нотация из текста ответа сетки. Ответ собран по шаблону словаря
// («Думаю, у оппонента диапазон: {range} ({combos} комбо, {pct}% рук). {заметка}»,
// en-шаблон той же формы) — берём кусок между первым «: » и первой скобкой.
// Свободная заметка игрока идёт ПОСЛЕ скобок и в разбор не попадает.
export function extractRangeNotation(answer: string): string | null {
  const m = /:\s*([^():]+?)\s*\(/.exec(answer);
  return m ? m[1] : null;
}

export type RangeFactsInput = {
  history: DialogueRoundSummary[];
  tableSnapshot: TableSnapshot;
  opponents?: OpponentFact[];
};

// Запасной факт (план 2026-07-26-эталонный-3бет-диапазон.md): игрок диапазон 3-бета
// САМ не отметил (текстовый ответ вместо сетки) — вместо тишины подставляем ЭТАЛОННЫЙ
// диапазон 3-бета для позиции соперника (vs-open-chart.ts), с поправкой на его тип,
// если известен уверенно. Область НАМЕРЕННО узкая: только когда Hero открылся, получил
// ровно один 3-бет и ответил на него ОЛЛ-ИНОМ (деньги уже все в банке на префлопе —
// дальше улиц нет, это последний честный вход, а не прикидка постфлоп-игры). Иначе —
// null, факта нет, как и раньше (не гадаем за пределами этого узкого спота).
function estimatedThreeBetRead(
  roundNumber: number,
  tableSnapshot: TableSnapshot,
  opponents: OpponentFact[] | undefined,
): RangeRead | null {
  const spot = detectHeroOpenFacedThreeBet(tableSnapshot);
  if (!spot || spot.heroAction !== "ALL_IN" || !spot.threebetterPosition) return null;

  const villain = opponents?.find((o) => o.seatLabel === spot.threebetterSeatLabel);
  const codes = referenceThreeBetRange(spot.threebetterPosition, villain?.type, villain?.confidence);
  const equity = equityVsRangePreflop(tableSnapshot.heroCards, codes);
  if (!equity) return null;

  return {
    roundNumber,
    notation: formatRange(codes),
    gridPct: Math.round(percentOf(codes)),
    fullGrid: false,
    street: "PREFLOP",
    equityPct: equity.equityPct,
    combosLive: equity.combosLive,
    buckets: null, // раскладка комбо на борде — только постфлоп, здесь решение до флопа
    vpipContrast: null, // это не разметка игрока — сверивать её с VPIP соперника нечего
    cut: null, // не итеративная нарезка, разовый запасной факт
    estimated: true,
  };
}

export function buildRangeReads({ history, tableSnapshot, opponents }: RangeFactsInput): RangeRead[] {
  const reads: RangeRead[] = [];
  // Сверку с VPIP делаем только при ровно одном известном злодее — иначе не знаем
  // детерминированно, чей диапазон отмечал игрок (профили всё равно есть в промпте).
  const solo = opponents && opponents.length === 1 ? opponents[0] : null;

  let prev: { roundNumber: number; codes: string[] } | null = null;

  for (const round of history) {
    const { isRange, tableActionIndex } = splitMarkers(round.question);
    if (!isRange || !round.answer) continue;

    const notation = extractRangeNotation(round.answer);
    const codes = notation ? parseRangeNotation(notation) : [];
    if (codes.length === 0) {
      // Игрок диапазон не отметил (текстовый ответ) — пробуем узкий запасной факт
      // (3-бет-vs-открытие Hero, олл-ин). Не подошло — по-прежнему факта нет.
      const estimated = estimatedThreeBetRead(round.roundNumber, tableSnapshot, opponents);
      if (estimated) reads.push(estimated);
      continue;
    }

    // Улица точки решения вопроса: по метке {{table:N}}; без метки — финал раздачи.
    const idx = tableActionIndex ?? lastActionIndex(tableSnapshot);
    const street = tableStateUpTo(tableSnapshot, idx).street;
    const board = boardUpToStreet(tableSnapshot.board, street);

    const equity = board.length >= 3 ? equityVsRange(tableSnapshot.heroCards, board, codes) : null;
    // Раскладка комбо на этом борде (кого бьёшь/кто бьёт, кто заплатит велью) — постфлоп.
    const buckets = board.length >= 3 ? rangeBuckets(tableSnapshot.heroCards, board, codes) : null;
    const gridPct = Math.round(percentOf(codes));

    const cut = prev
      ? cutBetween(prev.codes, codes, [...tableSnapshot.heroCards, ...board])
      : null;

    reads.push({
      roundNumber: round.roundNumber,
      // Каноническая нотация из разобранных кодов (не сырой текст игрока — он мог
      // содержать заметку); formatRange детерминирован, как на сетке.
      notation: formatRange(codes),
      gridPct,
      fullGrid: new Set(codes).size === GRID_CODES_TOTAL,
      street,
      equityPct: equity?.equityPct ?? null,
      combosLive: equity?.combosLive ?? null,
      buckets,
      vpipContrast: solo
        ? {
            seatLabel: solo.seatLabel,
            vpip: solo.vpip,
            handsObserved: solo.handsObserved,
            gapPp: Math.round(gridPct - solo.vpip),
          }
        : null,
      cut: cut
        ? { vsRound: prev!.roundNumber, foldPct: cut.foldPct, addedCombos: cut.addedCombos }
        : null,
      estimated: false,
    });

    prev = { roundNumber: round.roundNumber, codes };
  }

  return reads;
}
