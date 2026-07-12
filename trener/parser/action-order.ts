import type { Street, TableSnapshot, TableAction } from "./types";

// Разбор от коуча (план 2026-07-12), фаза A: порядок хода ОТНОСИТЕЛЬНО Hero в точке
// его первого решения на каждой постфлоп-улице — кто сходил ДО него (и что сделал) и
// кто ещё сидит ПОЗАДИ. Без этого модель достраивает порядок из сырого списка действий
// и путается: «оба соперника чекают перед тобой», когда на деле один чекнул до Hero, а
// за ним ещё живой баттон. Спот при этом стратегически другой (за тобой могут
// чек-рейзнуть / сыграть позади). Правило 1: порядок хода считает парсер, не LLM.
//
// Как считаем: действия в снимке уже в хронологическом порядке, значит порядок ПЕРВОГО
// действия каждого игрока на улице = посадочный порядок первого орбита. Место Hero в
// нём делит стол на «до тебя» и «за тобой». Игрок, сбросивший на прошлой улице, до этой
// не доходит (действий на ней нет) — в порядок не попадает автоматически.

const STREET_RU: Record<Street, string> = {
  PREFLOP: "префлопе",
  FLOP: "флопе",
  TURN: "тёрне",
  RIVER: "ривере",
};

const VERB_RU: Record<TableAction["action"], string> = {
  POST_ANTE: "анте",
  POST_SB: "малый блайнд",
  POST_BB: "большой блайнд",
  FOLD: "фолд",
  CHECK: "чек",
  CALL: "колл",
  BET: "бет",
  RAISE: "рейз",
  ALL_IN: "олл-ин",
};

// Только постфлоп: префлоп-позиция и так ясна из мест и RFI-фактов, а путаница коуча
// была именно постфлоп (многовей, Hero не последний).
const POSTFLOP: Street[] = ["FLOP", "TURN", "RIVER"];

export function renderActionOrder(snapshot: TableSnapshot): string {
  const posOf = new Map<string, string>();
  for (const s of snapshot.seats) posOf.set(s.label, s.positionName ?? s.position);
  const pos = (label: string) => posOf.get(label) ?? label;

  const lines: string[] = [];
  for (const street of POSTFLOP) {
    const streetActions = snapshot.actions.filter((a) => a.street === street);
    if (streetActions.length === 0) continue;

    // Порядок первого действия каждого игрока на улице = порядок мест (первый орбит).
    const order: string[] = [];
    const firstAction = new Map<string, TableAction>();
    for (const a of streetActions) {
      if (!firstAction.has(a.actor)) {
        firstAction.set(a.actor, a);
        order.push(a.actor);
      }
    }

    const heroIdx = order.indexOf("Hero");
    if (heroIdx === -1) continue; // Hero на этой улице не действовал
    if (order.length < 2) continue; // один Hero — про порядок сказать нечего

    const before = order.slice(0, heroIdx);
    const behind = order.slice(heroIdx + 1);

    const beforeText = before.length
      ? `до тебя: ${before.map((p) => `${pos(p)} ${VERB_RU[firstAction.get(p)!.action]}`).join(", ")}`
      : "ты ходишь первым";
    const behindText = behind.length
      ? `за тобой ещё не действовали: ${behind.map((p) => pos(p)).join(", ")}`
      : "за тобой никого — ты закрываешь улицу";

    lines.push(`На ${STREET_RU[street]} ${beforeText}; ${behindText}.`);
  }

  if (lines.length === 0) return "";
  return [
    "Порядок хода относительно тебя (посчитал парсер — не достраивай, кто до и кто после тебя, сам):",
    ...lines,
  ].join("\n");
}
