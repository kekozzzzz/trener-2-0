import type { Position, Street, TableAction, TableSnapshot } from "./types";
import { bigBlindFromSnapshot } from "./big-blind";

// Состояние стола на момент КОНКРЕТНОГО действия — детерминированный срез снимка
// парсера для визуальной схемы стола в разборе раздачи. Привязка идёт к точке
// решения (напр. «оппонент пошёл в олл-ин, Hero отвечает»), а не к улице целиком:
// на одной улице может быть несколько решений (рейз → 3-бет → пуш → колл), и
// показать надо ровно ту точку, к которой относится вопрос.
//
// Правило 1: здесь нет расчёта покерных метрик, только пересборка уже сохранённого
// снимка (hand.tableData) к нужному моменту — кто где сидит, чьё последнее действие,
// банк и борд. LLM указывает лишь НОМЕР действия (маркер {{table:N}}); ЧТО показать
// считает этот модуль из снимка, не модель.

const STREET_ORDER: Record<Street, number> = { PREFLOP: 0, FLOP: 1, TURN: 2, RIVER: 3 };

// Борд на момент улицы: флоп — первые 3 карты, тёрн — 4, ривер — 5. До флопа
// борда нет. Единый источник для facts.ts и table-state.ts (не дублировать).
export function boardUpToStreet(board: string[], street: Street): string[] {
  if (street === "FLOP") return board.slice(0, 3);
  if (street === "TURN") return board.slice(0, 4);
  if (street === "RIVER") return board.slice(0, 5);
  return [];
}

// Форсированные посты (анте/блайнды) — не решение игрока, поэтому не считаются
// «последним действием» места: позиция SB/BB и так видна по бейджу, а решение —
// это FOLD/CHECK/CALL/BET/RAISE/ALL_IN.
const FORCED = new Set<TableAction["action"]>(["POST_ANTE", "POST_SB", "POST_BB"]);

export type SeatAction = { action: TableAction["action"]; amount?: number };

export type SeatState = {
  label: string;
  position: Position;
  positionName: string; // точное имя места для показа (UTG/UTG+1/LJ/HJ/CO/BTN/SB/BB)
  startingStack: number;
  seatNumber: number; // физическое место за столом (для раскладки по N-max кольцу)
  isHero: boolean;
  folded: boolean;
  // место, чьё действие — разбираемая точка решения (последнее действие на столе)
  isCurrent: boolean;
  // фишки, вложенные на ТЕКУЩЕЙ улице к моменту точки (в фишках) — «ставка перед игроком»
  streetBet: number;
  // последнее НЕ форсированное действие места на ТЕКУЩЕЙ улице; null — на этой
  // улице ещё не ходил (напр. BB до круга торговли, либо только постил блайнд).
  // Действия прошлых улиц не тянутся (на флопе не висит префлоп-колл); исключение —
  // фолд: выбывший игрок так и показывается «фолд» до конца раздачи.
  lastAction: SeatAction | null;
};

export type TableState = {
  seats: SeatState[]; // только занятые места; раскладка по seatNumber внутри tableSize
  tableSize: number; // мест за столом (N-max); fallback — число занятых мест
  buttonSeat: number | null; // номер места баттона (для кнопки дилера)
  heroCards: string[]; // карманные карты Hero (показываем у его места)
  board: string[]; // карты борда до этой улицы включительно
  potSoFar: number; // банк, накопленный к моменту точки решения (в фишках)
  bigBlind: number | null;
  street: Street; // улица точки решения — для подписи
  decisionActor: string | null; // место, чьё действие — разбираемая точка
  playersAfterHero: number; // живых соперников, действующих ПОСЛЕ Hero на этой улице
};

// Индекс последнего действия раздачи (fallback для разборов без маркера: показываем
// стол на финальном состоянии хода — кульминация решения).
export function lastActionIndex(snapshot: TableSnapshot): number {
  return Math.max(0, snapshot.actions.length - 1);
}

// Состояние стола до действия actionIndex включительно. Проход по действиям
// повторяет арифметику банка из parser/facts.ts (walkPot), но обрезан по точке
// и не считает метрик — только банк, fold-флаги и последнее действие каждого места.
export function tableStateUpTo(snapshot: TableSnapshot, actionIndex: number): TableState {
  const all = snapshot.actions;
  // Защита от выхода за границы (некорректный индекс от модели не должен ломать рендер).
  const idx = all.length === 0 ? -1 : Math.min(Math.max(actionIndex, 0), all.length - 1);
  const actions = idx >= 0 ? all.slice(0, idx + 1) : [];

  let pot = 0;
  let currentBet = 0;
  let street: Street = "PREFLOP";
  const streetCommitted = new Map<string, number>();
  const folded = new Set<string>();
  const lastAction = new Map<string, SeatAction>();

  for (const a of actions) {
    if (a.street !== street) {
      street = a.street;
      streetCommitted.clear();
      currentBet = 0;
      // Новая улица — действия прошлой улицы больше не «последние»: на флопе у Hero
      // не должен висеть префлоп-колл, если на флопе он ещё не ходил. Фолд оставляем
      // (игрок выбыл из раздачи — его «фолд» виден до конца).
      for (const actor of [...lastAction.keys()]) {
        if (!folded.has(actor)) lastAction.delete(actor);
      }
    }

    const committed = streetCommitted.get(a.actor) ?? 0;
    const amt = a.amount ?? 0;

    switch (a.action) {
      case "POST_ANTE":
        pot += amt;
        break;
      case "POST_SB":
      case "POST_BB":
        streetCommitted.set(a.actor, committed + amt);
        pot += amt;
        currentBet = Math.max(currentBet, committed + amt);
        break;
      case "FOLD":
        folded.add(a.actor);
        break;
      case "CHECK":
        break;
      case "CALL":
        streetCommitted.set(a.actor, committed + amt);
        pot += amt;
        break;
      case "BET":
        streetCommitted.set(a.actor, committed + amt);
        pot += amt;
        currentBet = committed + amt;
        break;
      case "RAISE":
      case "ALL_IN": {
        // amount у RAISE — абсолютная сумма «to» на улице; ALL_IN однозначим по
        // порогу: больше текущей ставки → рейз «to amt», иначе колл-дельта (как в facts.ts).
        const isRaise = a.action === "RAISE" || amt > currentBet;
        if (isRaise) {
          pot += Math.max(amt - committed, 0);
          streetCommitted.set(a.actor, amt);
          currentBet = amt;
        } else {
          streetCommitted.set(a.actor, committed + amt);
          pot += amt;
        }
        break;
      }
    }

    if (!FORCED.has(a.action)) {
      lastAction.set(a.actor, a.amount != null ? { action: a.action, amount: a.amount } : { action: a.action });
    }
  }

  const decisionActor = idx >= 0 ? all[idx].actor : null;

  const seats: SeatState[] = snapshot.seats.map((s, i) => ({
    label: s.label,
    position: s.position,
    positionName: s.positionName ?? s.position,
    startingStack: s.startingStack,
    seatNumber: s.seatNumber ?? i + 1,
    isHero: s.label === "Hero",
    folded: folded.has(s.label),
    isCurrent: s.label === decisionActor,
    streetBet: streetCommitted.get(s.label) ?? 0,
    lastAction: lastAction.get(s.label) ?? null,
  }));

  return {
    seats,
    tableSize: snapshot.tableSize && snapshot.tableSize >= seats.length ? snapshot.tableSize : seats.length,
    buttonSeat: snapshot.buttonSeat ?? null,
    heroCards: snapshot.heroCards,
    board: boardUpToStreet(snapshot.board, street),
    potSoFar: pot,
    bigBlind: bigBlindFromSnapshot(snapshot),
    street,
    decisionActor,
    playersAfterHero: playersAfterHeroCount(snapshot, folded, street),
  };
}

// Подпись видимого состояния стола — чтобы не перерисовывать одну и ту же картинку
// под каждым вопросом диалога. Стол показываем заново, только когда ситуация реально
// изменилась: новая улица/борд, сменилась ставка перед игроком, кто-то выбыл, или
// сместилась точка решения (подсвеченное место). Совпали подписи — стол не повторяем,
// предыдущий «висит» над следующими вопросами.
export function tableSignature(state: TableState): string {
  const seats = state.seats
    .map(
      (s) =>
        `${s.seatNumber}:${s.folded ? "F" : ""}:${s.streetBet}:${
          s.lastAction ? s.lastAction.action + (s.lastAction.amount ?? "") : ""
        }${s.isCurrent ? "*" : ""}`,
    )
    .join("|");
  return `${state.street}/${state.board.join("")}/${state.potSoFar}/${seats}`;
}

// Сколько живых соперников действуют ПОСЛЕ Hero на текущей улице — теория за пушем
// (сколько игроков ещё за тобой). Порядок хода: префлоп — от UTG (слева от BB) до BB;
// постфлоп — от SB до баттона. Если номеров мест/баттона нет — грубый fallback
// (все живые соперники). Числа берём из снимка, не вычисляя метрик (правило 1).
function playersAfterHeroCount(
  snapshot: TableSnapshot,
  folded: Set<string>,
  street: Street,
): number {
  const liveOpponents = snapshot.seats.filter((s) => s.label !== "Hero" && !folded.has(s.label));

  const haveSeats = snapshot.seats.every((s) => s.seatNumber != null);
  if (!haveSeats || snapshot.buttonSeat == null) return liveOpponents.length;

  const ring = [...snapshot.seats].sort((a, b) => (a.seatNumber ?? 0) - (b.seatNumber ?? 0));
  const n = ring.length;
  const btnIdx = ring.findIndex((s) => s.seatNumber === snapshot.buttonSeat);
  if (btnIdx < 0) return liveOpponents.length;

  // первый ходящий на улице
  const start =
    street === "PREFLOP"
      ? (n === 2 ? (btnIdx + 1) % n /* HU: после SB(=BTN) ходит BB */ : (btnIdx + 3) % n) // UTG = после BB
      : (btnIdx + 1) % n; // постфлоп — SB

  const order = Array.from({ length: n }, (_, k) => ring[(start + k) % n]);
  const heroOrderIdx = order.findIndex((s) => s.label === "Hero");
  if (heroOrderIdx < 0) return liveOpponents.length;

  let count = 0;
  for (let k = heroOrderIdx + 1; k < order.length; k++) {
    const s = order[k];
    if (s.label !== "Hero" && !folded.has(s.label)) count++;
  }
  return count;
}
