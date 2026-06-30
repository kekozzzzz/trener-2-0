import type { ParsedHandSnapshot, Seat, Street, TableAction, TableSnapshot } from "../types";
import { resolvePositions } from "../shared/positions";

// 888poker: суммы в [скобках], действия БЕЗ двоеточия (матчим по именам из Seat).
// Олл-ин в тексте НЕ помечается (определяем по вкладу==стек). «Uncalled bet» НЕ
// печатается — непокрытую ставку вычисляем (на финальной улице top-коммиттеру
// возвращается разница с второй по величине ставкой). Стек "( 14,587 )", борд
// в "** Dealing flop ** [ 8h, 3c, 4s ]". Карты уже в нашем виде (Th, Ac).

const SEAT_LINE = /^Seat (\d+): (.+?) \(\s*([\d,]+)\s*\)$/gm;
const BUTTON_SEAT = /^Seat (\d+) is the button/m;
const TABLE_MAX = /(\d+) Max/;
const SB_LINE = /^(.+?) posts small blind/m;
const BB_LINE = /^(.+?) posts big blind/m;
const DEALT_CARDS = /^Dealt to .+? \[\s*(.+?)\s*\]$/m;
const SUMMARY_START = /^\*\* Summary \*\*/m;
const STREET_HEADER = /^\*\* Dealing (flop|turn|river) \*\* \[\s*(.+?)\s*\]/i;
const COLLECTED = /^(.+?) collected \[\s*([\d,]+)\s*\]/;

function parseNum(s: string): number {
  return parseInt(s.replace(/,/g, ""), 10);
}

const STREET_OF: Record<string, Street> = { flop: "FLOP", turn: "TURN", river: "RIVER" };

// Карты внутри [ ... ] разделены запятыми: "8h, 3c, 4s" → ["8h","3c","4s"].
function splitCards(raw: string): string[] {
  return raw
    .split(",")
    .map((c) => c.trim())
    .filter(Boolean);
}

// Действия — от Seat-строк до "** Summary **" (посты идут до раздачи карт).
function actionLines(handText: string): string[] {
  const summaryIdx = handText.search(SUMMARY_START);
  const end = summaryIdx === -1 ? handText.length : summaryIdx;
  return handText.slice(0, end).split("\n");
}

function parseSeats(handText: string): { seatNum: number; name: string; stack: number }[] {
  return [...handText.matchAll(SEAT_LINE)].map((m) => ({
    seatNum: parseInt(m[1], 10),
    name: m[2],
    stack: parseNum(m[3]),
  }));
}

function parseVerb(rest: string): Pick<TableAction, "action" | "amount"> | null {
  if (rest === "folds") return { action: "FOLD" };
  if (rest === "checks") return { action: "CHECK" };

  let m: RegExpMatchArray | null;
  if ((m = rest.match(/^calls \[\s*([\d,]+)\s*\]/))) return { action: "CALL", amount: parseNum(m[1]) };
  if ((m = rest.match(/^bets \[\s*([\d,]+)\s*\]/))) return { action: "BET", amount: parseNum(m[1]) };
  // "raises [Y]" — Y абсолютная сумма ставки игрока на этой улице (проверено по банку).
  if ((m = rest.match(/^raises \[\s*([\d,]+)\s*\]/))) return { action: "RAISE", amount: parseNum(m[1]) };
  if ((m = rest.match(/^posts ante \[\s*([\d,]+)\s*\]/))) return { action: "POST_ANTE", amount: parseNum(m[1]) };
  if ((m = rest.match(/^posts small blind \[\s*([\d,]+)\s*\]/)))
    return { action: "POST_SB", amount: parseNum(m[1]) };
  if ((m = rest.match(/^posts big blind \[\s*([\d,]+)\s*\]/)))
    return { action: "POST_BB", amount: parseNum(m[1]) };

  return null;
}

type RawAction = { street: Street; name: string; action: TableAction["action"]; amount?: number };

function parseRawActions(handText: string, seatNames: string[]): RawAction[] {
  const names = [...seatNames].sort((a, b) => b.length - a.length);
  const raws: RawAction[] = [];
  let street: Street = "PREFLOP";

  for (const line of actionLines(handText)) {
    const sh = STREET_HEADER.exec(line);
    if (sh) {
      street = STREET_OF[sh[1].toLowerCase()];
      continue;
    }
    const name = names.find((n) => line.startsWith(n + " "));
    if (!name) continue;
    const verb = parseVerb(line.slice(name.length + 1));
    if (!verb) continue;
    raws.push({ street, name, action: verb.action, amount: verb.amount });
  }
  return raws;
}

// Олл-ин помечаем, когда суммарный вклад игрока достигает его стартового стека.
function markAllIns(raws: RawAction[], stackByName: Map<string, number>): TableAction[] {
  const committed = new Map<string, number>();
  return raws.map((r) => {
    const prev = committed.get(r.name) ?? 0;
    const now = prev + (r.amount ?? 0);
    committed.set(r.name, now);
    const stack = stackByName.get(r.name);
    const isAllIn =
      r.action !== "FOLD" && r.action !== "CHECK" && stack != null && now >= stack && stack > 0;
    const action = isAllIn ? "ALL_IN" : r.action;
    return r.amount === undefined
      ? { street: r.street, actor: r.name, action }
      : { street: r.street, actor: r.name, action, amount: r.amount };
  });
}

const STREETS: Street[] = ["PREFLOP", "FLOP", "TURN", "RIVER"];

// chipResult героя: вложения по улицам, анте отдельно, + вычисленная непокрытая
// ставка (на улице, где hero — единственный top-коммиттер, возвращается излишек
// над второй по величине ставкой; на не-терминальных улицах излишка не бывает).
function computeHeroChipResult(raws: RawAction[], heroName: string, collected: Map<string, number>): number {
  const commit: Record<Street, Map<string, number>> = {
    PREFLOP: new Map(),
    FLOP: new Map(),
    TURN: new Map(),
    RIVER: new Map(),
  };
  let ante = 0;

  for (const r of raws) {
    if (r.action === "POST_ANTE") {
      if (r.name === heroName) ante += r.amount ?? 0;
      continue;
    }
    const s = commit[r.street];
    const prev = s.get(r.name) ?? 0;
    if (r.action === "RAISE") s.set(r.name, r.amount ?? 0); // абсолют улицы
    else if (r.action === "CALL" || r.action === "BET" || r.action === "POST_SB" || r.action === "POST_BB")
      s.set(r.name, prev + (r.amount ?? 0));
  }

  let invested = 0;
  let uncalled = 0;
  for (const s of STREETS) {
    const map = commit[s];
    const heroCommit = map.get(heroName) ?? 0;
    invested += heroCommit;
    let maxOther = 0;
    for (const [name, amt] of map) if (name !== heroName && amt > maxOther) maxOther = amt;
    if (heroCommit > maxOther) uncalled += heroCommit - maxOther;
  }

  return (collected.get(heroName) ?? 0) + uncalled - invested - ante;
}

export function parseHand(handText: string, heroName: string): ParsedHandSnapshot {
  const seatRows = parseSeats(handText);
  const buttonSeat = BUTTON_SEAT.exec(handText)?.[1];
  const buttonSeatNum = buttonSeat ? parseInt(buttonSeat, 10) : null;
  const sbName = SB_LINE.exec(handText)?.[1] ?? null;
  const bbName = BB_LINE.exec(handText)?.[1] ?? null;

  const nameToLabel = new Map<string, string>();
  for (const row of seatRows) {
    nameToLabel.set(row.name, row.name === heroName ? "Hero" : `Player ${row.seatNum}`);
  }

  const positionByName = resolvePositions(seatRows, buttonSeatNum, sbName, bbName);

  const seats: Seat[] = seatRows.map((row) => {
    const resolved = positionByName.get(row.name);
    return {
      label: nameToLabel.get(row.name)!,
      position: resolved?.coarse ?? "OTHER",
      positionName: resolved?.fine ?? "OTHER",
      startingStack: row.stack,
      seatNumber: row.seatNum,
    };
  });

  const tableMaxMatch = TABLE_MAX.exec(handText);
  const tableSize = tableMaxMatch ? parseInt(tableMaxMatch[1], 10) : undefined;

  const heroCardsMatch = DEALT_CARDS.exec(handText);
  const heroCards = heroCardsMatch ? splitCards(heroCardsMatch[1]) : [];

  // Борд собираем из строк "** Dealing flop/turn/river **".
  const board: string[] = [];
  for (const line of handText.split("\n")) {
    const sh = STREET_HEADER.exec(line);
    if (sh) board.push(...splitCards(sh[2]));
  }

  const collected = new Map<string, number>();
  for (const line of handText.split("\n")) {
    const c = COLLECTED.exec(line);
    if (c) collected.set(c[1], (collected.get(c[1]) ?? 0) + parseNum(c[2]));
  }

  const seatNames = seatRows.map((r) => r.name);
  const raws = parseRawActions(handText, seatNames);
  const stackByName = new Map(seatRows.map((r) => [r.name, r.stack]));
  const actionsRaw = markAllIns(raws, stackByName);
  const actions = actionsRaw.map((a) => ({ ...a, actor: nameToLabel.get(a.actor) ?? a.actor }));

  const potTotal = [...collected.values()].reduce((a, b) => a + b, 0);

  const tableSnapshot: TableSnapshot = {
    seats,
    heroCards,
    board,
    actions,
    potTotal,
    tableSize,
    buttonSeat: buttonSeatNum ?? undefined,
  };

  return { chipResult: computeHeroChipResult(raws, heroName, collected), tableSnapshot };
}
