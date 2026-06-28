// Детерминированный «отпечаток спота» раздачи — основа памяти тренера (Правило 1:
// похожесть раздач считает ПАРСЕР по фактам, а не LLM). Модель потом только проговаривает
// уже найденные реальные раздачи; сама решать «похоже/не похоже» она не может, иначе
// выдумает совпадения, которых не было. Отпечаток собирается из независимых признаков —
// при поиске их сверяют по штукам: сошлось всё → «один в один», часть → «что-то подобное».
//
// Только примитивы парсера: позиция, действие префлопа, глубина стека, текстура борда,
// как Hero попал в борд (собрал/на дро/промах). Никаких чартов и эквити против диапазона.

import type { TableAction, TableSnapshot } from "./types";
import { boardTexture } from "./facts";
import { readHeroDraw } from "./draws";
import { heroMadeHand } from "./made-hand";
import { bigBlindFromSnapshot } from "./big-blind";

export type SpotRole =
  | "OPEN" // первым поднял (RFI)
  | "3BET" // переподнял над чужим рейзом
  | "CALL" // коллировал рейз (не из ББ)
  | "BBDEF" // защита большого блайнда (колл рейза из ББ)
  | "LIMP" // лимп (колл без рейза)
  | "ALLIN_PF" // олл-ин на префлопе (короткий пуш)
  | "PASSIVE" // только чек/постил (без добровольной агрессии)
  | "FOLD"; // сбросил на префлопе

export type SpotStack = "SHORT" | "MID" | "DEEP"; // ≤15 / 15–35 / >35 BB
export type SpotStreet = "PREFLOP" | "FLOP" | "TURN" | "RIVER";

// Как Hero соотносится с бордом на финальной (дошедшей) улице.
export type SpotConnection =
  | "MADE_STRONG" // две пары и сильнее
  | "MADE_PAIR" // ровно пара
  | "DRAW" // пары нет, но есть дро (флеш/стрит)
  | "WHIFF" // ни пары, ни дро — голый промах
  | "NONE"; // префлоп (борда нет)

export type SpotBoard = {
  suitedness: "MONOTONE" | "TWO_TONE" | "RAINBOW";
  paired: boolean;
  connected: "CONNECTED" | "SEMI" | "DISCONNECTED";
};

export type SpotFingerprint = {
  position: string; // EARLY/HJ/CO/BTN/SB/BB/OTHER
  stack: SpotStack;
  role: SpotRole;
  street: SpotStreet;
  board: SpotBoard | null; // null до флопа
  connection: SpotConnection;
};

function stackBucket(snapshot: TableSnapshot): SpotStack {
  const bb = bigBlindFromSnapshot(snapshot);
  const hero = snapshot.seats.find((s) => s.label === "Hero");
  if (!bb || !hero) return "MID";
  const bbStack = hero.startingStack / bb;
  if (bbStack <= 15) return "SHORT";
  if (bbStack <= 35) return "MID";
  return "DEEP";
}

function streetOf(boardLen: number): SpotStreet {
  if (boardLen >= 5) return "RIVER";
  if (boardLen === 4) return "TURN";
  if (boardLen === 3) return "FLOP";
  return "PREFLOP";
}

// Роль Hero на префлопе по его ПЕРВОМУ добровольному действию и числу рейзов до него.
function preflopRole(snapshot: TableSnapshot, heroPosition: string): SpotRole {
  const POSTS = new Set<TableAction["action"]>(["POST_SB", "POST_BB", "POST_ANTE"]);
  let raisesBefore = 0;
  let heroAct: TableAction | null = null;

  for (const a of snapshot.actions) {
    if (a.street !== "PREFLOP") break; // префлоп идёт первым; дальше не смотрим
    if (a.actor === "Hero") {
      if (POSTS.has(a.action)) continue;
      heroAct = a;
      break;
    }
    if (a.action === "RAISE" || a.action === "ALL_IN") raisesBefore++;
  }

  if (!heroAct) return "PASSIVE";
  switch (heroAct.action) {
    case "ALL_IN":
      return "ALLIN_PF";
    case "RAISE":
      return raisesBefore > 0 ? "3BET" : "OPEN";
    case "CALL":
      if (raisesBefore > 0) return heroPosition === "BB" ? "BBDEF" : "CALL";
      return "LIMP";
    case "FOLD":
      return "FOLD";
    default:
      return "PASSIVE"; // CHECK и прочее пассивное
  }
}

function connectionOf(snapshot: TableSnapshot): SpotConnection {
  const board = snapshot.board ?? [];
  if (board.length < 3) return "NONE";

  const made = heroMadeHand(snapshot.heroCards, board);
  const category = made?.category ?? "HIGH";
  if (category !== "HIGH" && category !== "PAIR") return "MADE_STRONG";
  if (category === "PAIR") return "MADE_PAIR";

  // Голая старшая карта: настоящее дро (флеш/стрит) на флопе/тёрне → DRAW; бэкдор
  // (только раннер-раннером) ближе к промаху, считаем WHIFF — как и до перебора аутов.
  const draw = readHeroDraw(snapshot.heroCards, board);
  return draw && !draw.backdoorOnly ? "DRAW" : "WHIFF";
}

// Отпечаток спота по снимку раздачи. Никогда не бросает — считается в парс-шаге.
export function computeSpotFingerprint(snapshot: TableSnapshot): SpotFingerprint {
  const hero = snapshot.seats.find((s) => s.label === "Hero");
  const position = hero?.position ?? "OTHER";
  const board = snapshot.board ?? [];
  const texture = boardTexture(board);

  return {
    position,
    stack: stackBucket(snapshot),
    role: preflopRole(snapshot, position),
    street: streetOf(board.length),
    board: texture
      ? { suitedness: texture.suitedness, paired: texture.paired, connected: texture.connected }
      : null,
    connection: connectionOf(snapshot),
  };
}

// Канонический строковый ключ отпечатка — для точной (полной) сверки спотов.
// Частичную («что-то подобное») считают сравнением полей отпечатка по штукам.
export function spotKey(fp: SpotFingerprint): string {
  const board = fp.board
    ? `${fp.board.suitedness}/${fp.board.paired ? "P" : "U"}/${fp.board.connected}`
    : "-";
  return [fp.position, fp.stack, fp.role, fp.street, board, fp.connection].join("|");
}

// Сколько признаков отпечатка совпало (0..6) — мера похожести двух спотов. Полное
// совпадение → «один в один», частичное → «что-то подобное». Борд сравниваем целиком.
export function spotMatchScore(a: SpotFingerprint, b: SpotFingerprint): number {
  let score = 0;
  if (a.position === b.position) score++;
  if (a.stack === b.stack) score++;
  if (a.role === b.role) score++;
  if (a.street === b.street) score++;
  if (a.connection === b.connection) score++;
  const boardEqual =
    (a.board === null && b.board === null) ||
    (a.board !== null &&
      b.board !== null &&
      a.board.suitedness === b.board.suitedness &&
      a.board.paired === b.board.paired &&
      a.board.connected === b.board.connected);
  if (boardEqual) score++;
  return score;
}
