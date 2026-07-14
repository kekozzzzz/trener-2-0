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

// Все улицы. Постфлоп путал коуча (многовей, Hero не последний); ПРЕФЛОП добавлен под сквиз-риск
// (свип): кто ещё сидит за спиной Hero и мог зайти/сквизнуть — модель это достраивала из списка.
const STREETS: Street[] = ["PREFLOP", "FLOP", "TURN", "RIVER"];

// Вынужденные ставки — НЕ действия для порядка хода: на префлопе блайнды/анте постятся ПЕРВЫМИ
// хронологически, но игрок SB/BB действует добровольно ПОЗЖЕ. Если их учесть, блайнды ложно
// уедут в начало порядка. На постфлопе форсов нет — фильтр безвреден.
const FORCED = new Set<TableAction["action"]>(["POST_ANTE", "POST_SB", "POST_BB"]);

export function renderActionOrder(snapshot: TableSnapshot): string {
  const posOf = new Map<string, string>();
  for (const s of snapshot.seats) posOf.set(s.label, s.positionName ?? s.position);
  // «OTHER» (баттон не распознан → позиция не вычислена) — не латиница и не «Player N» в русском
  // тексте: показываем нейтральное «соперник». Путь достижим лишь при несчитанном баттоне, где и
  // прочий позиционный слой деградирует; число «N могли» при этом верное.
  const pos = (label: string) => {
    const p = posOf.get(label) ?? label;
    return p === "OTHER" ? "соперник" : p;
  };

  const lines: string[] = [];
  for (const street of STREETS) {
    const streetActions = snapshot.actions.filter((a) => a.street === street && !FORCED.has(a.action));
    if (streetActions.length === 0) continue;

    // Порядок первого ДОБРОВОЛЬНОГО действия каждого игрока на улице = порядок мест (первый орбит).
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

    if (street === "PREFLOP") {
      // Сквиз-риск ценен ТОЛЬКО когда за спиной Hero есть живые (кому сквизить). Hero закрывает
      // префлоп-экшн (behind пусто) - факта нет: некому зайти/ре-рейзнуть.
      if (behind.length === 0) continue;
      const beforeText = before.length
        ? `до тебя: ${before.map((p) => `${pos(p)} ${VERB_RU[firstAction.get(p)!.action]}`).join(", ")}`
        : "ты действуешь первым";
      const behindText = `за тобой оставались ${behind.map((p) => pos(p)).join(", ")} - ${behind.length} ${behind.length === 1 ? "мог" : "могли"} войти или сквизнуть`;
      lines.push(`На префлопе ${beforeText}; ${behindText}.`);
      continue;
    }

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
