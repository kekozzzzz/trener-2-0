import type { ParsedHandSnapshot, Position, Seat, Street, TableAction, TableSnapshot } from "../types";

// WPN (ACR / PokerKing): имена игроков МОГУТ содержать пробелы ("Tax Attorney"),
// а действия идут БЕЗ двоеточия ("kekozzz folds"). Поэтому экшены разбираем по
// списку известных имён из Seat-строк, а не по \S+ как в GG. Суммы — с ".00",
// без разделителей тысяч.

const SEAT_LINE = /^Seat (\d+): (.+?) \(([\d,.]+)\)(?: is sitting out)?$/gm;
const BUTTON_SEAT = /Seat #(\d+) is the button/;
const TABLE_MAX = /(\d+)-max/;
const BOARD_LINE = /^Board \[(.+?)\]$/m;
const POT_TOTAL = /^Total pot ([\d,.]+)/m;
const STREET_HEADER = /^\*\*\* (FLOP|TURN|RIVER) \*\*\*/;
const SUMMARY_START = /^\*\*\* SUMMARY \*\*\*/m;
const SB_LINE = /^(.+?) posts the small blind/m;
const BB_LINE = /^(.+?) posts the big blind/m;
const DEALT_CARDS = /^Dealt to .+? \[(.+?)\]$/m;
const UNCALLED = /^Uncalled bet \(([\d,.]+)\) returned to (.+)$/;
const COLLECTED = /^(.+?) collected ([\d,.]+) from (?:main pot|side pot-\d+|pot)$/;

function parseNum(s: string): number {
  return Math.round(parseFloat(s.replace(/,/g, "")));
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Действия идут до "*** SUMMARY ***" (посты анте/блайндов — раньше HOLE CARDS).
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

// Разбор «хвоста» строки действия (после имени игрока). Возвращает действие
// снимка либо null (для "shows"/"does not show"/"collected" — они тут не нужны).
function parseVerb(rest: string): Pick<TableAction, "action" | "amount"> | null {
  if (rest === "folds") return { action: "FOLD" };
  if (rest === "checks") return { action: "CHECK" };

  let m: RegExpMatchArray | null;
  if ((m = rest.match(/^calls ([\d,.]+)( and is all-in)?$/)))
    return { action: m[2] ? "ALL_IN" : "CALL", amount: parseNum(m[1]) };
  if ((m = rest.match(/^bets ([\d,.]+)( and is all-in)?$/)))
    return { action: m[2] ? "ALL_IN" : "BET", amount: parseNum(m[1]) };
  // "raises X to Y" — Y абсолютная сумма ставки игрока на этой улице (как и в GG).
  if ((m = rest.match(/^raises ([\d,.]+) to ([\d,.]+)( and is all-in)?$/)))
    return { action: m[3] ? "ALL_IN" : "RAISE", amount: parseNum(m[2]) };
  if ((m = rest.match(/^posts ante ([\d,.]+)$/)))
    return { action: "POST_ANTE", amount: parseNum(m[1]) };
  // ⚠️Пост блайнда вынужденный — остаётся POST_SB/POST_BB даже с «and is all-in» (см. ps/hand.ts):
  // иначе теряется большой блайнд раздачи и молча исчезает вся пачка фактов в BB (аудит 19.07).
  if ((m = rest.match(/^posts the small blind ([\d,.]+)( and is all-in)?$/)))
    return { action: "POST_SB", amount: parseNum(m[1]) };
  if ((m = rest.match(/^posts the big blind ([\d,.]+)( and is all-in)?$/)))
    return { action: "POST_BB", amount: parseNum(m[1]) };

  return null;
}

function parseActions(
  handText: string,
  seatNames: string[],
  nameToLabel: Map<string, string>,
): TableAction[] {
  // Длинные имена первыми — чтобы "Big" не перехватило строку игрока "Big Stack".
  const names = [...seatNames].sort((a, b) => b.length - a.length);
  const actions: TableAction[] = [];
  let street: Street = "PREFLOP";

  for (const line of actionLines(handText)) {
    const sh = STREET_HEADER.exec(line);
    if (sh) {
      street = sh[1] as Street;
      continue;
    }

    const name = names.find((n) => line.startsWith(n + " "));
    if (!name) continue;
    const verb = parseVerb(line.slice(name.length + 1));
    if (!verb) continue;

    actions.push({ street, actor: nameToLabel.get(name) ?? name, ...verb });
  }

  return actions;
}

// Сколько вложил Hero за раздачу против того, что забрал. "raises X to Y" → Y
// (абсолют на улице). Анте вычитаем отдельно, как в GG. Сайд-поты учитываются
// через несколько строк "collected ... from main pot/side pot-N".
function computeHeroChipResult(handText: string, heroName: string): number {
  const heroPrefix = heroName + " ";
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

    const uncalled = UNCALLED.exec(line);
    if (uncalled) {
      if (uncalled[2] === heroName) uncalledReturned += parseNum(uncalled[1]);
      continue;
    }

    const col = COLLECTED.exec(line);
    if (col) {
      if (col[1] === heroName) collected += parseNum(col[2]);
      continue;
    }

    if (!line.startsWith(heroPrefix)) continue;
    const verb = parseVerb(line.slice(heroPrefix.length));
    if (!verb) continue;

    switch (verb.action) {
      case "POST_ANTE":
        ante = verb.amount ?? 0;
        break;
      case "POST_SB":
      case "POST_BB":
        streetCommitment = verb.amount ?? 0;
        break;
      case "CALL":
      case "BET":
        streetCommitment += verb.amount ?? 0;
        break;
      case "RAISE":
        streetCommitment = verb.amount ?? 0;
        break;
      case "ALL_IN":
        // Олл-ин: рейз/пост задаёт абсолют улицы, колл — добавляет. Восстанавливаем
        // по тексту строки (parseVerb потерял различие call vs raise/post для ALL_IN).
        if (/^(?:raises|posts the (?:small|big) blind)/.test(line.slice(heroPrefix.length)))
          streetCommitment = verb.amount ?? 0;
        else streetCommitment += verb.amount ?? 0;
        break;
    }
  }

  totalInvested += streetCommitment;
  return collected + uncalledReturned - ante - totalInvested;
}

// Позиции — те же чистые функции, что у GG (по расстоянию от баттона в кольце мест).
function positionAtDistance(d: number, n: number): Position {
  if (d === 0) return "BTN";
  if (n === 2) return "BB";
  if (d === 1) return "SB";
  if (d === 2) return "BB";
  if (d === n - 1) return "CO";
  if (d === n - 2) return "HJ";
  return "EARLY";
}

function finePositionName(coarse: Position, d: number, n: number): string {
  if (coarse !== "EARLY") return coarse;
  if (d === n - 3) return "LJ";
  return d === 3 ? "UTG" : `UTG+${d - 3}`;
}

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

// Уровень блайндов из заголовка: «- Level 1 (10/20) -». Без него из промпта пропадала строка
// «Уровень блайндов турнира» (аудит румов 19.07).
const LEVEL_RE = /-\s*Level\s+(\d+)\s*\(/i;

export function parseHand(handText: string, heroName: string): ParsedHandSnapshot {
  const seatRows = parseSeats(handText);
  const buttonSeat = BUTTON_SEAT.exec(handText)?.[1];
  const buttonSeatNum = buttonSeat ? parseInt(buttonSeat, 10) : null;
  const sbName = SB_LINE.exec(handText)?.[1] ?? null;
  const bbName = BB_LINE.exec(handText)?.[1] ?? null;

  // Обезличивание: реальный ник героя → "Hero", соперники → "Player <место>".
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
  const heroCards = heroCardsMatch ? heroCardsMatch[1].split(" ") : [];

  const boardMatch = BOARD_LINE.exec(handText);
  const board = boardMatch ? boardMatch[1].split(" ") : [];

  const levelMatch = LEVEL_RE.exec(handText);
  const potMatch = POT_TOTAL.exec(handText);
  const potTotal = potMatch ? parseNum(potMatch[1]) : 0;

  const tableSnapshot: TableSnapshot = {
    seats,
    heroCards,
    board,
    actions: parseActions(handText, seatRows.map((r) => r.name), nameToLabel),
    potTotal,
    tableSize,
    buttonSeat: buttonSeatNum ?? undefined,
    level: levelMatch ? parseInt(levelMatch[1], 10) : undefined,
  };

  return { chipResult: computeHeroChipResult(handText, heroName), tableSnapshot };
}
