import type { TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";
import { isAggressiveActionAt } from "./aggression";

// Факты-v2, фаза 3: геометрия ре-пуша Hero поверх уже вошедшего в олл-ин короткого.
// Арифметика, которую быстрый режим теряет, а старая модель путала всегда: часть
// стека возвращается, если шире никто не заколлирует; короткого олл-ином не выбить
// (фолд-эквити только против ЖИВЫХ позади); в банке есть мёртвые деньги.
//
// Правило 1: все числа — точный проход банка по действиям снимка, LLM не считает.
// Гейт узкий: срабатывает ТОЛЬКО когда Hero пошёл олл-ином префлоп ПОВЕРХ чужого
// олл-ина (ре-пуш). Обычный опен-шов/резтил сюда не попадает — там своя половина.

const round1 = (chips: number, bb: number) => Math.round((chips / bb) * 10) / 10;

export type AllInGeometry = {
  heroRiskBb: number; // весь стек Hero под риском при полном колле
  effectiveRiskBb: number; // реально матчится, если заколлирует только уже вошедший короткий
  excessBb: number; // излишек, который возвращается, если шире никто не заколлирует
  shortAllInBb: number; // стек короткого, уже стоящего в олл-ине впереди (его не выбить)
  liveBehind: { label: string; stackBb: number; covers: boolean }[]; // живые позади, что могут заколлировать
  deadMoneyBb: number; // мёртвые деньги (блайнды+анте+фолды) — берёшь без вскрытия, если живые сбросят
};

export function detectAllInGeometry(snapshot: TableSnapshot): AllInGeometry | null {
  const bb = bigBlindFromSnapshot(snapshot);
  if (!bb) return null;
  const heroSeat = snapshot.seats.find((s) => s.label === "Hero");
  if (!heroSeat) return null;
  const stackOf = new Map(snapshot.seats.map((s) => [s.label, s.startingStack]));

  let pot = 0;
  let currentBet = 0;
  const committed = new Map<string, number>(); // вклад за префлоп
  const folded = new Set<string>();
  const allInAhead = new Map<string, number>(); // соперник → его вклад, уже в олл-ине до Hero

  const add = (actor: string, delta: number) => {
    committed.set(actor, (committed.get(actor) ?? 0) + delta);
    pot += delta;
  };

  for (const [i, a] of snapshot.actions.entries()) {
    if (a.street !== "PREFLOP") break; // только префлоп-ре-пуш
    const prev = committed.get(a.actor) ?? 0;

    if (a.actor === "Hero") {
      if (a.action === "POST_ANTE" || a.action === "POST_SB" || a.action === "POST_BB") {
        if (a.action !== "POST_ANTE") currentBet = Math.max(currentBet, prev + (a.amount ?? 0));
        add("Hero", a.amount ?? 0);
        continue;
      }

      if (a.action === "ALL_IN") {
        if (allInAhead.size === 0) return null; // впереди никто не в олл-ине — опен-шов, не ре-пуш
        // ⚠️Плоский КОЛЛ чужого олл-ина румы пишут тем же ALL_IN (см. aggression.ts). Ре-пуша тут
        // нет: Hero доложил последним, фолд-эквити у него ноль и «забрать банк без вскрытия» он не
        // может. Старый комментарий ниже утверждал, что колл сюда не попадёт, — это было неверно, и
        // на реальной раздаче GG выходила «геометрия твоего ре-пуша» на плоском колле (аудит 18.07).
        if (!isAggressiveActionAt(snapshot, i)) return null;

        const heroStack = heroSeat.startingStack;
        const potBefore = pot; // банк ДО добавления шова Hero
        // Вклад самого Hero до шова (блайнды + возможный ранний рейз-открытие). Вычитаем из мёртвых
        // денег: свои фишки Hero не «забирает» — иначе на линии «открыл рейзом → ре-пуш» рейз Hero
        // ложно раздул бы мёртвые деньги (регресс ATs/AJs-vs-AKs, где Hero сначала открыл).
        const heroCommittedBefore = committed.get("Hero") ?? 0;
        const aheadStacks = [...allInAhead.keys()].map((l) => stackOf.get(l) ?? 0);
        const maxAhead = Math.max(...aheadStacks); // самый крупный уже-в-олл-ине впереди
        const shortAhead = Math.min(...aheadStacks); // самый короткий (его точно не выбить)
        const matched = Math.min(heroStack, maxAhead); // сколько реально матчится уже вошедшими
        const aheadCommitted = [...allInAhead.values()].reduce((s, v) => s + v, 0);

        const liveBehind = snapshot.seats
          .filter(
            (s) =>
              s.label !== "Hero" &&
              !folded.has(s.label) &&
              !allInAhead.has(s.label),
          )
          .map((s) => ({
            label: s.positionName ?? s.position,
            stackBb: round1(s.startingStack, bb),
            covers: s.startingStack >= heroStack,
          }));

        return {
          heroRiskBb: round1(heroStack, bb),
          effectiveRiskBb: round1(matched, bb),
          excessBb: round1(Math.max(heroStack - maxAhead, 0), bb),
          shortAllInBb: round1(shortAhead, bb),
          liveBehind,
          deadMoneyBb: round1(Math.max(potBefore - aheadCommitted - heroCommittedBefore, 0), bb),
        };
      }

      // Hero сделал ДОБРОВОЛЬНЫЙ не-олл-ин ход (открыл рейзом / коллом / чек) — раньше тут стоял
      // `return null`, из-за чего терялась частая линия «Hero открыл → в него олл-ин → Hero ре-пуш»
      // (регресс: раздачи ATs и AJs-vs-AKs — тренер писал «забрать банк сразу» без факта геометрии).
      // НЕ выходим: ход учитывается общим switch ниже (он один для соперников и таких ходов Hero),
      // и цикл идёт дальше до реального ре-пуша. Опен-шов геометрии не даёт (allInAhead пуст).
      // ⚠️Плоский колл чужого олл-ина сюда НЕ попадает — румы пишут его как ALL_IN, и он отсекается
      // выше через isAggressiveActionAt (раньше тут стояло допущение «Hero так и не сделает ALL_IN»,
      // и оно было ложным: на GG колл ва-банк — это ровно ALL_IN).
    }

    // Соперник.
    switch (a.action) {
      case "POST_ANTE":
        add(a.actor, a.amount ?? 0);
        break;
      case "POST_SB":
      case "POST_BB":
        add(a.actor, a.amount ?? 0);
        currentBet = Math.max(currentBet, prev + (a.amount ?? 0));
        break;
      case "FOLD":
        folded.add(a.actor);
        break;
      case "CHECK":
        break;
      case "CALL":
        add(a.actor, a.amount ?? 0);
        break;
      case "BET":
        add(a.actor, a.amount ?? 0);
        currentBet = prev + (a.amount ?? 0);
        break;
      case "RAISE":
      case "ALL_IN": {
        const raw = a.amount ?? 0;
        const isRaise = a.action === "RAISE" || raw > currentBet;
        if (isRaise) {
          add(a.actor, Math.max(raw - prev, 0));
          currentBet = raw;
        } else {
          add(a.actor, raw); // олл-ин как колл-дельта
        }
        // Олл-ин соперника впереди Hero — берём на карандаш (его нельзя выбить ре-пушем).
        if (a.action === "ALL_IN") allInAhead.set(a.actor, committed.get(a.actor) ?? 0);
        break;
      }
    }
  }

  return null; // Hero так и не сходил префлоп ре-пушем
}

export function renderAllInGeometry(snapshot: TableSnapshot): string | null {
  const g = detectAllInGeometry(snapshot);
  if (!g) return null;

  const parts: string[] = [
    `Геометрия твоего ре-пуша: под риском весь стек ${g.heroRiskBb} BB.`,
    `Короткий впереди уже в олл-ине на ${g.shortAllInBb} BB — ре-пушем его не выбить, фолд-эквити работает только против ЖИВЫХ позади.`,
  ];
  if (g.excessBb > 0)
    parts.push(
      `Если заколлирует только он, реально рискуешь ${g.effectiveRiskBb} BB, а излишек ${g.excessBb} BB возвращается непокрытым.`,
    );

  if (g.liveBehind.length > 0) {
    // Против покрывающего под риском весь стек Hero; против более короткого живого риск
    // ограничен ЕГО стеком (матчится min(Hero, его стек) = его стек) — не пишем «весь стек».
    const list = g.liveBehind
      .map((p) =>
        p.covers
          ? `${p.label} ${p.stackBb} BB (покрывает тебя целиком - против него под риском весь твой стек)`
          : `${p.label} ${p.stackBb} BB (короче тебя - против него рискуешь только его ${p.stackBb} BB)`,
      )
      .join(", ");
    parts.push(`Живые позади, что могут заколлировать: ${list}.`);
  } else {
    parts.push("Живых позади нет — если короткий не доедет, банк твой.");
  }

  parts.push(
    `Мёртвые деньги в банке (заберёшь без вскрытия, если живые позади сбросят): ${g.deadMoneyBb} BB.`,
  );

  return parts.join(" ");
}
