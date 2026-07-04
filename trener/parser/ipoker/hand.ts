import type { ParsedHandSnapshot, Seat, Street, TableAction, TableSnapshot } from "../types";
import { resolvePositions } from "../shared/positions";

// iPoker — XML. Одна <game gamecode> = раздача. Игроки в <player seat dealer name
// chips win bet/>; chipResult героя = win − bet (даём прямо из тегов, без разбора
// сумм). Действия по числовым type-кодам, sum — инкремент улицы.

export type IpokerPlayer = {
  seat: number;
  dealer: boolean;
  name: string;
  chips: number;
  win: number;
  bet: number;
};

const PLAYER_TAG = /<player\s+([^>]+?)\/?>/g;
const ROUND_BLOCK = /<round\s+no="(\d+)">([\s\S]*?)<\/round>/g;
const ACTION_TAG = /<action\s+([^>]+?)\/?>/g;
const BOARD_CARDS = /<cards\s+type="(Flop|Turn|River)">([^<]*)<\/cards>/g;

function attr(raw: string, name: string): string | undefined {
  const m = new RegExp(name + '="([^"]*)"').exec(raw);
  return m ? m[1] : undefined;
}

function parseNum(s: string | undefined): number {
  if (!s) return 0;
  return Math.round(parseFloat(s.replace(/,/g, "")));
}

// "S4"→"4s", "DQ"→"Qd", "HA"→"Ah", "C10"→"Tc". Масть S/H/D/C, ранг "10"→"T".
export function convertCard(token: string): string {
  const suit = token[0].toLowerCase();
  let rank = token.slice(1);
  if (rank === "10") rank = "T";
  return rank + suit;
}

function convertCards(raw: string): string[] {
  return raw
    .trim()
    .split(/\s+/)
    .filter((t) => t.length >= 2 && t !== "X" && !t.includes("X"))
    .map(convertCard);
}

// Вскрытые карманные карты всех игроков раздачи (тег Pocket; «X X» — игрок не
// вскрылся). Для детектора доезда: index.ts цепляет их к обезличенным местам
// через shared/shown-cards, сырой ник наружу не выходит.
const POCKET_CARDS = /<cards\s+player="([^"]+)"\s+type="Pocket">([^<]*)<\/cards>/g;
export function pocketCardsByNick(gameXml: string): Map<string, [string, string]> {
  const out = new Map<string, [string, string]>();
  for (const m of gameXml.matchAll(POCKET_CARDS)) {
    const cards = convertCards(m[2]);
    if (cards.length === 2) out.set(m[1], [cards[0], cards[1]]);
  }
  return out;
}

export function parsePlayers(gameXml: string): IpokerPlayer[] {
  const players: IpokerPlayer[] = [];
  for (const m of gameXml.matchAll(PLAYER_TAG)) {
    const raw = m[1];
    players.push({
      seat: parseInt(attr(raw, "seat") ?? "0", 10),
      dealer: attr(raw, "dealer") === "1",
      name: attr(raw, "name") ?? "",
      chips: parseNum(attr(raw, "chips")),
      win: parseNum(attr(raw, "win")),
      bet: parseNum(attr(raw, "bet")),
    });
  }
  return players;
}

// Код действия iPoker → наше действие. ALL_IN решается отдельно (по вкладу==стек).
function mapType(type: string): TableAction["action"] | null {
  switch (type) {
    case "0":
      return "FOLD";
    case "1":
      return "POST_SB";
    case "2":
      return "POST_BB";
    case "3":
      return "CALL";
    case "4":
      return "CHECK";
    case "5":
      return "BET";
    case "6":
    case "23":
      return "RAISE";
    case "7":
      return "ALL_IN"; // колл олл-ина
    case "15":
      return "POST_ANTE";
    default:
      return null;
  }
}

const STREET_BY_ROUND: Record<string, Street> = {
  "0": "PREFLOP",
  "1": "PREFLOP",
  "2": "FLOP",
  "3": "TURN",
  "4": "RIVER",
};

export type RawAction = { round: string; player: string; type: string; sum: number };

export function collectRawActions(gameXml: string): RawAction[] {
  const raws: RawAction[] = [];
  for (const r of gameXml.matchAll(ROUND_BLOCK)) {
    const round = r[1];
    for (const a of r[2].matchAll(ACTION_TAG)) {
      const raw = a[1];
      raws.push({
        round,
        player: attr(raw, "player") ?? "",
        type: attr(raw, "type") ?? "",
        sum: parseNum(attr(raw, "sum")),
      });
    }
  }
  return raws;
}

function parseActions(
  gameXml: string,
  players: IpokerPlayer[],
  nameToLabel: Map<string, string>,
): TableAction[] {
  const chipsByName = new Map(players.map((p) => [p.name, p.chips]));
  const committed = new Map<string, number>(); // суммарный вклад игрока за раздачу
  const streetCommit = new Map<string, number>(); // вклад на текущей улице (для абсолюта RAISE)
  const actions: TableAction[] = [];
  let currentStreet: Street = "PREFLOP";

  for (const raw of collectRawActions(gameXml)) {
    const street = STREET_BY_ROUND[raw.round] ?? "PREFLOP";
    if (street !== currentStreet) {
      currentStreet = street;
      streetCommit.clear();
    }

    const base = mapType(raw.type);
    if (!base) continue;

    const prevCommitted = committed.get(raw.player) ?? 0;
    const nowCommitted = prevCommitted + raw.sum;
    committed.set(raw.player, nowCommitted);
    const prevStreet = streetCommit.get(raw.player) ?? 0;
    const nowStreet = prevStreet + raw.sum;
    streetCommit.set(raw.player, nowStreet);

    const actor = nameToLabel.get(raw.player) ?? raw.player;
    const stack = chipsByName.get(raw.player);
    const isAllIn = base !== "FOLD" && base !== "CHECK" && stack != null && nowCommitted >= stack && stack > 0;

    let action = base;
    let amount: number | undefined;

    switch (base) {
      case "FOLD":
      case "CHECK":
        break;
      case "RAISE":
        // RAISE → абсолют ставки на улице (как GG). Если рейз забрал весь стек — олл-ин.
        action = isAllIn ? "ALL_IN" : "RAISE";
        amount = nowStreet;
        break;
      case "ALL_IN": // type 7 — колл олл-ина, sum = инкремент колла
        amount = raw.sum;
        break;
      case "POST_SB":
      case "POST_BB":
      case "POST_ANTE":
      case "CALL":
      case "BET":
        action = isAllIn ? "ALL_IN" : base;
        amount = raw.sum;
        break;
    }

    actions.push(amount === undefined ? { street, actor, action } : { street, actor, action, amount });
  }

  return actions;
}

function parseBoard(gameXml: string): string[] {
  const board: string[] = [];
  for (const m of gameXml.matchAll(BOARD_CARDS)) board.push(...convertCards(m[2]));
  return board;
}

function parseHeroCards(gameXml: string, heroName: string): string[] {
  const re = new RegExp(
    '<cards\\s+player="' + heroName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + '"[^>]*>([^<]*)<\\/cards>',
  );
  const m = re.exec(gameXml);
  return m ? convertCards(m[1]) : [];
}

// chipResult героя = выигрыш − вложено (из тегов <player win bet>) — детерминированно.
export function parseGame(gameXml: string, heroName: string, tableSize?: number): ParsedHandSnapshot {
  const players = parsePlayers(gameXml);

  const nameToLabel = new Map<string, string>();
  for (const p of players) {
    nameToLabel.set(p.name, p.name === heroName ? "Hero" : `Player ${p.seat}`);
  }

  const buttonSeatNum = players.find((p) => p.dealer)?.seat ?? null;
  const raws = collectRawActions(gameXml);
  const sbName = raws.find((r) => r.type === "1")?.player ?? null;
  const bbName = raws.find((r) => r.type === "2")?.player ?? null;

  const seatRows = players.map((p) => ({ seatNum: p.seat, name: p.name }));
  const positionByName = resolvePositions(seatRows, buttonSeatNum, sbName, bbName);

  const seats: Seat[] = players.map((p) => {
    const resolved = positionByName.get(p.name);
    return {
      label: nameToLabel.get(p.name)!,
      position: resolved?.coarse ?? "OTHER",
      positionName: resolved?.fine ?? "OTHER",
      startingStack: p.chips,
      seatNumber: p.seat,
    };
  });

  const hero = players.find((p) => p.name === heroName);
  const chipResult = hero ? hero.win - hero.bet : 0;

  const actions = parseActions(gameXml, players, nameToLabel);
  const potTotal = players.reduce((sum, p) => sum + p.bet, 0);

  const tableSnapshot: TableSnapshot = {
    seats,
    heroCards: parseHeroCards(gameXml, heroName),
    board: parseBoard(gameXml),
    actions,
    potTotal,
    tableSize,
    buttonSeat: buttonSeatNum ?? undefined,
  };

  return { chipResult, tableSnapshot };
}
