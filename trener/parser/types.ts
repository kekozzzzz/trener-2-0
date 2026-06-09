export type ParsedTournament = {
  handsCount: number;
  vpipPercent: number;
  resultBuyins: number;
};

export type ParseError = {
  type: "UNSUPPORTED_FORMAT" | "PARSE_FAILED";
  message: string;
};

export type ParseResult =
  | { ok: true; data: ParsedTournament }
  | { ok: false; error: ParseError };
