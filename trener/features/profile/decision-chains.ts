import type { TableAction, TableSnapshot } from "@/parser/types";
import { bigBlindFromSnapshot } from "@/parser/big-blind";
import { CHAIN_NORMS, chainVerdict, type ChainId, type ChainVerdict } from "@/config/poker/decision-chains";

// Считает ЦЕПОЧКИ решений по раздачам игрока: как часто он бросает вложенное и сколько это стоит.
// Правило 1: всё считает код, LLM только объясняет. Никакого LLM здесь нет вовсе.
//
// Почему цена ТОЧНАЯ. «Открылся на 2 BB и сбросил на 3-бет» = отдано ровно 2 BB. Это не оценка EV
// и не реализованный результат с дисперсией, а арифметика вложенного и брошенного. Поэтому число
// честно с первой раздачи. Но само по себе оно НЕ доказывает утечку — см. предупреждение в
// config/poker/decision-chains.ts: вердикт даём только по ДОЛЕ против нормы.

const POSTS = new Set<TableAction["action"]>(["POST_ANTE", "POST_SB", "POST_BB"]);
const AGGRO = new Set<TableAction["action"]>(["BET", "RAISE", "ALL_IN"]);

export type ChainStat = {
  id: ChainId;
  title: string;
  denominator: string;
  /** Сколько раз игрок попадал в эту ситуацию (знаменатель доли). */
  faced: number;
  /** Сколько раз сбросил. */
  folded: number;
  /** Доля фолдов, %. null — ситуаций не было вовсе. */
  foldPct: number | null;
  /** Сколько BB брошено на этих фолдах — точная арифметика вложенного. */
  abandonedBb: number;
  /** Норма для сравнения — чтобы число никогда не показывалось без шкалы. */
  normLow: number;
  normHigh: number;
  verdict: ChainVerdict;
};

// Вклад игрока на улице БЕЗ постов блайндов/анте: рейз задаёт итог по улице, колл/бет добавляют.
function investedOnStreet(snapshot: TableSnapshot, street: TableAction["street"]): number {
  let total = 0;
  for (const a of snapshot.actions) {
    if (a.actor !== "Hero" || a.street !== street || POSTS.has(a.action)) continue;
    if (a.action === "RAISE" || a.action === "ALL_IN") total = Math.max(total, a.amount ?? 0);
    else total += a.amount ?? 0;
  }
  return total;
}

function heroFoldedOn(snapshot: TableSnapshot, street: TableAction["street"]): boolean {
  return snapshot.actions.some((a) => a.actor === "Hero" && a.street === street && a.action === "FOLD");
}

type Acc = { faced: number; folded: number; abandoned: number };

export function computeDecisionChains(snapshots: TableSnapshot[]): ChainStat[] {
  const acc: Record<ChainId, Acc> = {
    FOLD_TO_3BET: { faced: 0, folded: 0, abandoned: 0 },
    FOLD_FLOP_BET: { faced: 0, folded: 0, abandoned: 0 },
    FOLD_TURN_BET: { faced: 0, folded: 0, abandoned: 0 },
  };

  for (const s of snapshots) {
    const bb = bigBlindFromSnapshot(s);
    if (!bb || !s.seats?.length) continue;

    const preflop = s.actions.filter((a) => a.street === "PREFLOP");
    const heroVoluntary = preflop.filter((a) => a.actor === "Hero" && !POSTS.has(a.action));
    const firstHero = heroVoluntary[0];
    const preflopInvested = investedOnStreet(s, "PREFLOP");
    const foldedPreflop = heroFoldedOn(s, "PREFLOP");

    // 1. Открылся первым рейзом → в него 3-бетнули → сбросил.
    if (firstHero?.action === "RAISE") {
      const idx = preflop.indexOf(firstHero);
      const noOneEnteredBefore = preflop
        .slice(0, idx)
        .every((a) => POSTS.has(a.action) || a.action === "FOLD");
      if (noOneEnteredBefore) {
        const threeBet = preflop
          .slice(idx + 1)
          .some((a) => a.actor !== "Hero" && (a.action === "RAISE" || a.action === "ALL_IN"));
        if (threeBet) {
          acc.FOLD_TO_3BET.faced++;
          if (foldedPreflop) {
            acc.FOLD_TO_3BET.folded++;
            acc.FOLD_TO_3BET.abandoned += preflopInvested / bb;
          }
        }
      }
    }

    if (foldedPreflop || preflopInvested <= 0 || (s.board?.length ?? 0) < 3) continue;

    // 2. Заплатил префлоп → в него поставили на флопе → сбросил.
    const flop = s.actions.filter((a) => a.street === "FLOP");
    const facedFlopBet = flop.some((a) => a.actor !== "Hero" && AGGRO.has(a.action));
    const foldedFlop = heroFoldedOn(s, "FLOP");
    if (facedFlopBet) {
      acc.FOLD_FLOP_BET.faced++;
      if (foldedFlop) {
        acc.FOLD_FLOP_BET.folded++;
        acc.FOLD_FLOP_BET.abandoned += preflopInvested / bb;
      }
    }

    // 3. Вложился в флоп → в него поставили на тёрне → сбросил.
    const flopInvested = investedOnStreet(s, "FLOP");
    if (foldedFlop || flopInvested <= 0 || (s.board?.length ?? 0) < 4) continue;
    const turn = s.actions.filter((a) => a.street === "TURN");
    if (turn.some((a) => a.actor !== "Hero" && AGGRO.has(a.action))) {
      acc.FOLD_TURN_BET.faced++;
      if (heroFoldedOn(s, "TURN")) {
        acc.FOLD_TURN_BET.folded++;
        acc.FOLD_TURN_BET.abandoned += (preflopInvested + flopInvested) / bb;
      }
    }
  }

  return (Object.keys(acc) as ChainId[]).map((id) => {
    const a = acc[id];
    const n = CHAIN_NORMS[id];
    return {
      id,
      title: n.title,
      denominator: n.denominator,
      faced: a.faced,
      folded: a.folded,
      foldPct: a.faced > 0 ? Math.round((a.folded / a.faced) * 1000) / 10 : null,
      abandonedBb: Math.round(a.abandoned),
      normLow: n.normLow,
      normHigh: n.normHigh,
      verdict: chainVerdict(id, a.folded, a.faced),
    };
  });
}

// Строка для промпта тренера. ⚠️Деньги называем ТОЛЬКО при вердикте LEAK: в норме сумма брошенных
// фишек ничего не доказывает (сбрасывать после промаха — обычный покер), и показать её значит
// напугать игрока здоровой статистикой. При «в норме» прямо говорим, что проверили и всё хорошо, —
// молчание неотличимо от «не смотрели».
export function renderDecisionChainsFact(stats: ChainStat[]): string {
  const judged = stats.filter((s) => s.verdict !== "TOO_FEW");
  if (judged.length === 0) return "";

  const lines = judged.map((s) => {
    const base = `${s.title}: ${s.foldPct}% (${s.folded} из ${s.faced} ${s.denominator}), норма ${s.normLow}-${s.normHigh}%`;
    if (s.verdict === "LEAK")
      return `${base} — ЗА НОРМОЙ. На этих фолдах брошено ${s.abandonedBb} BB: соперникам выгодно давить на тебя в этом споте чаще.`;
    if (s.verdict === "BORDER") return `${base} — на границе нормы, поводом для разбора это ещё не является.`;
    return `${base} — В НОРМЕ.`;
  });

  return [
    "Цепочки решений игрока (посчитал код по всем его раздачам, дисперсии тут нет — это арифметика вложенного и брошенного):",
    ...lines,
    "Как этим пользоваться: заводить разговор про цепочку можно ТОЛЬКО при вердикте «ЗА НОРМОЙ». «В норме» — при случае похвали коротко и не выдумывай проблему; «на границе» — не трогай вовсе. Сумму брошенных BB называй лишь там, где вердикт «за нормой»: сбрасывать после промаха — обычный покер, и голая сумма без нормы пугает игрока здоровой статистикой.",
  ].join("\n");
}
