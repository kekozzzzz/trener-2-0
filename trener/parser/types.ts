export type Street = "PREFLOP" | "FLOP" | "TURN" | "RIVER";

export type TableAction = {
  street: Street;
  actor: string; // "Hero" | "Player <место>"
  action: "POST_ANTE" | "POST_SB" | "POST_BB" | "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN";
  amount?: number;
};

// Позиция за столом. CO/HJ — однозначны по расстоянию от баттона; EARLY — общий
// «ранний» кластер (UTG-группа), без ложной точности UTG vs UTG+1 vs MP.
// OTHER — запасной вариант, когда баттон в раздаче не определён.
export type Position = "BTN" | "SB" | "BB" | "CO" | "HJ" | "EARLY" | "OTHER";

export type Seat = {
  label: string; // "Hero" | "Player <место>"
  position: Position; // коарс-позиция для чартов/стратегии (EARLY — склейка ранних)
  positionName?: string; // точное имя места для показа: UTG/UTG+1/LJ/HJ/CO/BTN/SB/BB
  startingStack: number;
  seatNumber?: number; // физический номер места за столом (Seat N из HH)
};

export type TableSnapshot = {
  seats: Seat[];
  heroCards: string[];
  board: string[];
  actions: TableAction[];
  potTotal: number;
  tableSize?: number; // мест за столом (из «N-max» в заголовке HH) — для схемы стола
  buttonSeat?: number; // номер места баттона (Seat #N is the button)
};

export type HandImportance = "CRITICAL" | "STRONG" | "MEDIUM";

export type PlayerStyle = "LOOSE" | "TIGHT" | "PASSIVE" | "AGGRESSIVE";

export type ParsedHandSnapshot = {
  chipResult: number;
  tableSnapshot: TableSnapshot;
};

export type ParsedHand = ParsedHandSnapshot & {
  importanceLevel: HandImportance;
};

export type ParsedTournament = {
  room: string; // площадка, напр. "GGPoker" — пока единственная поддерживаемая
  externalTournamentId: string; // номер турнира из заголовка HH (Tournament #...) — ключ дедупликации
  name: string; // название турнира из заголовка, напр. "Bounty Hunters Deepstack Turbo $5.40 Hold'em No Limit"
  playedAt: string; // момент самой ранней раздачи турнира, ISO-строка (JSON-safe для payload очереди)
  handsCount: number;
  vpipPercent: number;
  pfrPercent: number;
  postflopAggressionFactor: number;
  resultBuyins: number;
  styleDiagnosis: PlayerStyle;
  hands: ParsedHand[];
};

export type ParseError = {
  type: "UNSUPPORTED_FORMAT" | "PARSE_FAILED";
  message: string;
};

export type ParseResult =
  | { ok: true; data: ParsedTournament }
  | { ok: false; error: ParseError };
