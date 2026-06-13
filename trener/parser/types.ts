export type Street = "PREFLOP" | "FLOP" | "TURN" | "RIVER";

export type TableAction = {
  street: Street;
  actor: string; // "Hero" | "Player <место>"
  action: "POST_ANTE" | "POST_SB" | "POST_BB" | "FOLD" | "CHECK" | "CALL" | "BET" | "RAISE" | "ALL_IN";
  amount?: number;
};

export type Seat = {
  label: string; // "Hero" | "Player <место>"
  position: "BTN" | "SB" | "BB" | "OTHER";
  startingStack: number;
};

export type TableSnapshot = {
  seats: Seat[];
  heroCards: string[];
  board: string[];
  actions: TableAction[];
  potTotal: number;
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
