import type { TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { nodeStateAt } from "./alternatives";
import { handCode } from "@/config/poker/hand-codes";

// Глубина префлоп-колла: детерминированный крючок «есть ли на что ловить сет / реализовать
// эквити» для колла рейза (опен / 3-бет / 4-бет). Правило 1: числа считает парсер. Это НЕ
// вердикт «колл правильный» (правильность зависит от диапазона соперника = солвер) - это
// ГЛУБИНА, через которую фреймворк судит спекулятивный колл: глубоко (проектная flop-SPR
// ≥3) - имплайды живы, есть на что ловить сет; коротко (SPR ~1-2) - имплайды мертвы, он
// доложит остаток на любом флопе. Уровень (опен/3-бет/4-бет) - по числу рейзов до колла.
//
// Проектная flop-SPR = эффективный остаток после колла / банк после колла (нет больше
// добровольных вложений на префлопе → это банк, с которым идём на флоп). Переиспользует
// nodeStateAt (тот же прогон банка). В боевой промпт НЕ вплетено - гейтованный шаг.

export type PreflopCallLevel = "OPEN" | "3BET" | "4BET";

export type PreflopCallDepth = {
  level: PreflopCallLevel; // что Hero заколлировал (по числу рейзов до колла)
  code: string;
  projectedFlopSpr: number; // эффективный остаток / банк после колла
  effectiveStackBb: number; // остаток относительно соперника-агрессора, в BB
  potBb: number; // банк после колла, в BB
  impliedOddsAlive: boolean; // SPR ≥ порога: глубоко, спекулятивный колл имеет смысл
};

// Порог «живых» имплайдов из фреймворка: ниже - он джемит любой флоп, добирать нечего.
const IMPLIED_SPR = 3;

export function preflopCallDepth(snapshot: TableSnapshot): PreflopCallDepth | null {
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb) return null;

  let currentBet = 0;
  let raiseCount = 0;

  for (let i = 0; i < snapshot.actions.length; i++) {
    const a = snapshot.actions[i];
    if (a.street !== "PREFLOP") break;
    if (a.action === "POST_ANTE") continue;
    if (a.action === "POST_SB" || a.action === "POST_BB") {
      currentBet = Math.max(currentBet, a.amount ?? 0);
      continue;
    }
    if (a.action === "RAISE") {
      raiseCount += 1;
      currentBet = a.amount ?? currentBet;
      continue;
    }
    if (a.action === "ALL_IN") {
      if ((a.amount ?? 0) > currentBet) {
        raiseCount += 1;
        currentBet = a.amount ?? currentBet;
      }
      continue;
    }
    // Первый КОЛЛ Hero против уже сделанного рейза - целевой спот.
    if (a.actor === "Hero" && a.action === "CALL" && raiseCount >= 1) {
      const node = nodeStateAt(snapshot, i); // состояние ПОСЛЕ колла Hero
      if (node.pot <= 0) return null;
      const spr = node.spr ?? Math.round((node.effectiveRemaining / node.pot) * 10) / 10;
      const level: PreflopCallLevel = raiseCount === 1 ? "OPEN" : raiseCount === 2 ? "3BET" : "4BET";
      return {
        level,
        code: handCode(snapshot.heroCards) ?? "",
        projectedFlopSpr: spr,
        effectiveStackBb: Math.round((node.effectiveRemaining / bb) * 10) / 10,
        potBb: Math.round((node.pot / bb) * 10) / 10,
        impliedOddsAlive: spr >= IMPLIED_SPR,
      };
    }
  }

  return null;
}
