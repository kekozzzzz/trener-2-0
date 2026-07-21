import type { ParsedHandSnapshot, Position, Seat, Street, TableAction, TableSnapshot } from "../types";

const SEAT_LINE = /^Seat (\d+): (\S+) \(([\d,]+) in chips\)$/gm;
const BUTTON_SEAT = /Seat #(\d+) is the button/;
const TABLE_MAX = /(\d+)-max/;
const HERO_CARDS = /^Dealt to Hero \[(.+?)\]$/m;
const BOARD_LINE = /^Board \[(.+?)\]$/m;
const POT_TOTAL = /^Total pot ([\d,]+)/m;
const STREET_HEADER = /^\*\*\* (FLOP|TURN|RIVER) \*\*\*/;
const SUMMARY_START = /^\*\*\* SUMMARY \*\*\*/m;
const SB_LINE = /^(\S+): posts small blind/m;
const BB_LINE = /^(\S+): posts big blind/m;
const ACTION_LINE =
  /^(\S+): (posts the ante|posts small blind|posts big blind|folds|checks|calls|bets|raises) ?([\d,]+)?(?: to ([\d,]+))?( and is all-in)?$/;
const UNCALLED_TO_HERO = /^Uncalled bet \(([\d,]+)\) returned to Hero$/;
const HERO_COLLECTED = /^Hero collected ([\d,]+) from pot$/;

function parseNum(s: string): number {
  return parseInt(s.replace(/,/g, ""), 10);
}

// Считаем с начала раздачи: посты анте и блайндов идут раньше "*** HOLE CARDS ***".
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

function parseActions(handText: string, nameToLabel: Map<string, string>): TableAction[] {
  const actions: TableAction[] = [];
  let street: Street = "PREFLOP";

  for (const line of actionLines(handText)) {
    const streetMatch = STREET_HEADER.exec(line);
    if (streetMatch) {
      street = streetMatch[1] as Street;
      continue;
    }

    const m = ACTION_LINE.exec(line);
    if (!m) continue;
    const [, name, verb, amt1, amt2, allIn] = m;
    const actor = nameToLabel.get(name) ?? name;

    if (allIn) {
      actions.push({ street, actor, action: "ALL_IN", amount: parseNum(amt2 ?? amt1) });
      continue;
    }

    switch (verb) {
      case "posts the ante":
        actions.push({ street, actor, action: "POST_ANTE", amount: parseNum(amt1) });
        break;
      case "posts small blind":
        actions.push({ street, actor, action: "POST_SB", amount: parseNum(amt1) });
        break;
      case "posts big blind":
        actions.push({ street, actor, action: "POST_BB", amount: parseNum(amt1) });
        break;
      case "folds":
        actions.push({ street, actor, action: "FOLD" });
        break;
      case "checks":
        actions.push({ street, actor, action: "CHECK" });
        break;
      case "calls":
        actions.push({ street, actor, action: "CALL", amount: parseNum(amt1) });
        break;
      case "bets":
        actions.push({ street, actor, action: "BET", amount: parseNum(amt1) });
        break;
      case "raises":
        actions.push({ street, actor, action: "RAISE", amount: parseNum(amt2) });
        break;
    }
  }

  return actions;
}

/**
 * Сумма вложений и выигрышей Hero за раздачу — из строк его собственных
 * действий, постов и "Uncalled bet"/"collected" построчно. Для "raises X to Y"
 * берётся Y: GGPoker указывает абсолютную сумму ставки игрока на этой улице.
 */
function computeHeroChipResult(handText: string): number {
  let ante = 0;
  let streetCommitment = 0;
  let totalInvested = 0;
  let collected = 0;
  let uncalledReturned = 0;

  for (const line of actionLines(handText)) {
    if (STREET_HEADER.test(line)) {
      totalInvested += streetCommitment;
      streetCommitment = 0;
      continue;
    }

    const uncalledMatch = UNCALLED_TO_HERO.exec(line);
    if (uncalledMatch) {
      uncalledReturned += parseNum(uncalledMatch[1]);
      continue;
    }

    const collectedMatch = HERO_COLLECTED.exec(line);
    if (collectedMatch) {
      collected += parseNum(collectedMatch[1]);
      continue;
    }

    const m = ACTION_LINE.exec(line);
    if (!m || m[1] !== "Hero") continue;
    const [, , verb, amt1, amt2] = m;

    switch (verb) {
      case "posts the ante":
        ante = parseNum(amt1);
        break;
      case "posts small blind":
      case "posts big blind":
        streetCommitment = parseNum(amt1);
        break;
      case "calls":
      case "bets":
        streetCommitment += parseNum(amt1);
        break;
      case "raises":
        streetCommitment = parseNum(amt2);
        break;
    }
  }

  totalInvested += streetCommitment;
  return collected + uncalledReturned - ante - totalInvested;
}

// Позиция по расстоянию d от баттона в кольце ЗАНЯТЫХ мест (0 = баттон, дальше по
// часовой). CO — место прямо перед баттоном, HJ — за ним; всё раньше — EARLY.
function positionAtDistance(d: number, n: number): Position {
  if (d === 0) return "BTN";
  if (n === 2) return "BB"; // хедз-ап: баттон = SB, второй = BB
  if (d === 1) return "SB";
  if (d === 2) return "BB";
  if (d === n - 1) return "CO";
  if (d === n - 2) return "HJ";
  return "EARLY";
}

// Точное имя места для показа (LJ-стиль, решение Артёма 2026-06-26). Совпадает с
// коарс-позицией везде, кроме склейки EARLY: там по расстоянию d от баттона —
// перед HJ идёт LJ (лоуджек), раньше — UTG, UTG+1, UTG+2… Имена нужны, чтобы в
// разборе тренер называл реальную позицию, а не безликое «EARLY».
function finePositionName(coarse: Position, d: number, n: number): string {
  if (coarse !== "EARLY") return coarse;
  if (d === n - 3) return "LJ";
  return d === 3 ? "UTG" : `UTG+${d - 3}`;
}

// Карта место→{коарс-позиция (для чартов), точное имя (для показа)}. Если баттон
// в раздаче не определён — запасной путь по именам постящих блайнды, остальные — OTHER.
type ResolvedPosition = { coarse: Position; fine: string };

function resolvePositions(
  seatRows: { seatNum: number; name: string }[],
  buttonSeatNum: number | null,
  sbName: string | null,
  bbName: string | null,
): Map<string, ResolvedPosition> {
  const byName = new Map<string, ResolvedPosition>();
  if (buttonSeatNum == null || !seatRows.some((r) => r.seatNum === buttonSeatNum)) {
    for (const row of seatRows) {
      const c: Position = row.name === sbName ? "SB" : row.name === bbName ? "BB" : "OTHER";
      byName.set(row.name, { coarse: c, fine: c });
    }
    return byName;
  }

  const ring = [...seatRows].sort((a, b) => a.seatNum - b.seatNum);
  const n = ring.length;
  const buttonIdx = ring.findIndex((r) => r.seatNum === buttonSeatNum);
  ring.forEach((row, i) => {
    const d = (i - buttonIdx + n) % n;
    const coarse = positionAtDistance(d, n);
    byName.set(row.name, { coarse, fine: finePositionName(coarse, d, n) });
  });
  return byName;
}

// Номер уровня блайндов из заголовка: "... - Level15(1,000/2,000(300)) - ...".
const LEVEL_RE = /- Level(\d+)\(/;

export function parseHand(handText: string): ParsedHandSnapshot {
  const seatRows = parseSeats(handText);
  const levelMatch = LEVEL_RE.exec(handText);
  const buttonSeat = BUTTON_SEAT.exec(handText)?.[1];
  const buttonSeatNum = buttonSeat ? parseInt(buttonSeat, 10) : null;
  const sbName = SB_LINE.exec(handText)?.[1] ?? null;
  const bbName = BB_LINE.exec(handText)?.[1] ?? null;

  const nameToLabel = new Map<string, string>();
  for (const row of seatRows) {
    nameToLabel.set(row.name, row.name === "Hero" ? "Hero" : `игрок ${row.seatNum}`);
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

  const heroCardsMatch = HERO_CARDS.exec(handText);
  const heroCards = heroCardsMatch ? heroCardsMatch[1].split(" ") : [];

  const boardMatch = BOARD_LINE.exec(handText);
  const board = boardMatch ? boardMatch[1].split(" ") : [];

  const potMatch = POT_TOTAL.exec(handText);
  const potTotal = potMatch ? parseNum(potMatch[1]) : 0;

  const tableSnapshot: TableSnapshot = {
    seats,
    heroCards,
    board,
    actions: parseActions(handText, nameToLabel),
    potTotal,
    tableSize,
    buttonSeat: buttonSeatNum ?? undefined,
    level: levelMatch ? parseInt(levelMatch[1], 10) : undefined,
  };

  return { chipResult: computeHeroChipResult(handText), tableSnapshot };
}
