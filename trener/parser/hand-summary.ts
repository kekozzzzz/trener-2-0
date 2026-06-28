import type { Street, TableAction, TableSnapshot } from "./types";

const STREET_RU: Record<Street, string> = {
  PREFLOP: "префлопе",
  FLOP: "флопе",
  TURN: "тёрне",
  RIVER: "ривере",
};

const VOLUNTARY = new Set<TableAction["action"]>(["CALL", "BET", "RAISE", "ALL_IN"]);

/**
 * Короткое детерминированное описание решающего действия Hero в раздаче — для строки
 * списка («что было»). Берём ПОСЛЕДНЕЕ добровольное действие Hero (оно и определило исход
 * раздачи). Только факты из снимка, без оценки качества руки — оценка это работа тренера
 * (Правило 1: парсер считает, LLM объясняет). Возвращает null, если Hero не принимал
 * добровольных решений (например, фолд на блайнде без действия).
 */
export function heroDecisionLabel(snapshot: TableSnapshot): string | null {
  const actions = snapshot.actions ?? [];

  let idx = -1;
  for (let i = 0; i < actions.length; i++) {
    const a = actions[i];
    if (a.actor === "Hero" && VOLUNTARY.has(a.action)) idx = i;
  }
  if (idx === -1) return null;

  const a = actions[idx];
  const street = STREET_RU[a.street];

  switch (a.action) {
    case "ALL_IN":
      return `олл-ин на ${street}`;
    case "RAISE":
      return `рейз на ${street}`;
    case "BET":
      return `ставка на ${street}`;
    case "CALL": {
      // Колл олл-ина соперника — отдельный, более узнаваемый случай.
      const facingAllIn = actions
        .slice(0, idx)
        .some((x) => x.actor !== "Hero" && x.action === "ALL_IN");
      return facingAllIn ? `колл олл-ина на ${street}` : `колл на ${street}`;
    }
    default:
      return null;
  }
}
