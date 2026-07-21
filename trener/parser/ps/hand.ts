import type { ParsedHandSnapshot, Seat, Street, TableAction, TableSnapshot } from "../types";
import { resolvePositions } from "../shared/positions";

// PS-семья (PokerStars / Chico): действия С ДВОЕТОЧИЕМ ("kekoz: folds"), но ники
// МОГУТ содержать пробелы. Поэтому экшены матчим по списку имён из Seat-строк
// (как WPN), а разделитель — "<ник>: ". Стек "(N in chips)", суммы целые.

// Допускаем суффикс после стека: в KO-турнирах PokerStars — "(2995 in chips, $15 bounty)".
const SEAT_LINE = /^Seat (\d+): (.+?) \(([\d,]+) in chips[^)]*\)/gm;
const BUTTON_SEAT = /Seat #(\d+) is the button/;
const TABLE_MAX = /(\d+)-max/;
const BOARD_LINE = /^Board \[(.+?)\]$/m;
const POT_TOTAL = /^Total pot ([\d,]+)/m;
// Уровень блайндов из заголовка: PokerStars пишет его РИМСКИМИ («- Level IV (100/200) -»),
// клоны на том же формате (Chico, PokerPlanets) встречаются и с арабскими. Без него из промпта
// пропадала строка «Уровень блайндов турнира» (аудит румов 19.07). Если уровня в заголовке нет
// вовсе — оставляем undefined, выдумывать стадию турнира нельзя.
const LEVEL_RE = /-\s*Level\s+([IVXL]+|\d+)\s*\(/i;
const ROMAN_DIGITS: Record<string, number> = { I: 1, V: 5, X: 10, L: 50 };

function parseLevel(raw: string): number | undefined {
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  const s = raw.toUpperCase();
  let total = 0;
  for (let i = 0; i < s.length; i++) {
    const cur = ROMAN_DIGITS[s[i]] ?? 0;
    const next = ROMAN_DIGITS[s[i + 1]] ?? 0;
    total += cur < next ? -cur : cur; // IV = 4, VI = 6
  }
  return total > 0 ? total : undefined;
}
const STREET_HEADER = /^\*\*\* (FLOP|TURN|RIVER) \*\*\*/;
const SUMMARY_START = /^\*\*\* SUMMARY \*\*\*/m;
const SB_LINE = /^(.+?): posts small blind/m;
const BB_LINE = /^(.+?): posts big blind/m;
const DEALT_CARDS = /^Dealt to .+? \[(.+?)\]$/m;
const UNCALLED = /^Uncalled bet \(([\d,]+)\) returned to (.+)$/;
const COLLECTED = /^(.+?) collected ([\d,]+) from (?:main pot|side pot-\d+|pot)$/;

function parseNum(s: string): number {
  return parseInt(s.replace(/,/g, ""), 10);
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

// Разбор «хвоста» строки действия (после "<ник>: "). Возвращает действие снимка
// либо null (для "shows"/"collected"/служебных строк — они тут не нужны).
function parseVerb(rest: string): Pick<TableAction, "action" | "amount"> | null {
  // Триммим хвост: в PS-раздачах строка «<ник>: folds » несёт trailing-пробел (регресс 2026-07-14:
  // «folds » не совпадал с «folds» → FOLD терялся, liveAt считал сброшенных живыми — «на флоп 9»).
  rest = rest.trim();
  if (rest === "folds") return { action: "FOLD" };
  if (rest === "checks") return { action: "CHECK" };

  let m: RegExpMatchArray | null;
  if ((m = rest.match(/^calls ([\d,]+)( and is all-in)?$/)))
    return { action: m[2] ? "ALL_IN" : "CALL", amount: parseNum(m[1]) };
  if ((m = rest.match(/^bets ([\d,]+)( and is all-in)?$/)))
    return { action: m[2] ? "ALL_IN" : "BET", amount: parseNum(m[1]) };
  // "raises X to Y" — Y абсолютная сумма ставки игрока на этой улице (как в GG).
  if ((m = rest.match(/^raises ([\d,]+) to ([\d,]+)( and is all-in)?$/)))
    return { action: m[3] ? "ALL_IN" : "RAISE", amount: parseNum(m[2]) };
  if ((m = rest.match(/^posts the ante ([\d,]+)$/)))
    return { action: "POST_ANTE", amount: parseNum(m[1]) };
  // ⚠️Пост блайнда — ВЫНУЖДЕННЫЙ, и остаётся POST_SB/POST_BB даже с пометкой «and is all-in»
  // (она значит лишь, что стек игрока меньше блайнда). Раньше такой пост становился ALL_IN, из-за
  // чего bigBlindFromSnapshot не находил POST_BB, bb=null и из промпта молча пропадала вся пачка
  // фактов в BB — стеки, зоны, пороги, чарт-вердикт и панель диапазонов (аудит румов 19.07).
  if ((m = rest.match(/^posts small blind ([\d,]+)( and is all-in)?$/)))
    return { action: "POST_SB", amount: parseNum(m[1]) };
  if ((m = rest.match(/^posts big blind ([\d,]+)( and is all-in)?$/)))
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

    const name = names.find((n) => line.startsWith(n + ": "));
    if (!name) continue;
    const verb = parseVerb(line.slice(name.length + 2));
    if (!verb) continue;

    actions.push({ street, actor: nameToLabel.get(name) ?? name, ...verb });
  }

  return actions;
}

// Сколько вложил Hero за раздачу против того, что забрал. "raises X to Y" → Y
// (абсолют на улице). Анте вычитаем отдельно. Сайд-поты учитываются через
// несколько строк "collected ... from main pot/side pot-N".
function computeHeroChipResult(handText: string, heroName: string): number {
  const heroPrefix = heroName + ": ";
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
        if (/^(?:raises|posts (?:small|big) blind)/.test(line.slice(heroPrefix.length)))
          streetCommitment = verb.amount ?? 0;
        else streetCommitment += verb.amount ?? 0;
        break;
    }
  }

  totalInvested += streetCommitment;
  return collected + uncalledReturned - ante - totalInvested;
}

export function parseHand(handText: string, heroName: string): ParsedHandSnapshot {
  const seatRows = parseSeats(handText);
  const buttonSeat = BUTTON_SEAT.exec(handText)?.[1];
  const buttonSeatNum = buttonSeat ? parseInt(buttonSeat, 10) : null;
  const sbName = SB_LINE.exec(handText)?.[1] ?? null;
  const bbName = BB_LINE.exec(handText)?.[1] ?? null;

  // Обезличивание: реальный ник героя → "Hero", соперники → "игрок <место>".
  const nameToLabel = new Map<string, string>();
  for (const row of seatRows) {
    nameToLabel.set(row.name, row.name === heroName ? "Hero" : `игрок ${row.seatNum}`);
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
    level: levelMatch ? parseLevel(levelMatch[1]) : undefined,
  };

  return { chipResult: computeHeroChipResult(handText, heroName), tableSnapshot };
}
