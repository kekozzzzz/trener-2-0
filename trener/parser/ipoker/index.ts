import type { ParseResult } from "../types";
import { assignImportanceLevels, computePostflopAggressionFactor, diagnoseStyle } from "../ggpoker/classify";
import { opponentTokenizer, assignOpponentTokens } from "../shared/opponent-tokens";
import { collectRawActions, parseGame, parsePlayers } from "./hand";

// iPoker — XML. Файл = склейка <root> (один на стол), в каждом <general> мета +
// много <game gamecode>. Турнир один на файл (один tournamentcode); многостольные
// файлы склеиваются роутером заранее. Герой — <nickname> из general.

const GAME_BLOCK = /<game\s+gamecode="(\d+)">([\s\S]*?)<\/game>/g;
const TAG = (name: string) => new RegExp("<" + name + ">([\\s\\S]*?)</" + name + ">");
const HAND_TIMESTAMP = /<startdate>(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})<\/startdate>/g;

// Префлоп-действия героя по сырым type-кодам: добровольный вход — call/bet/raise/
// all-in-call (3/5/23/6/7), рейз (PFR) — 23/6. Посты блайндов/анте (1/2/15) не в счёт.
const VOLUNTARY_TYPES = new Set(["3", "5", "6", "7", "23"]);
const RAISE_TYPES = new Set(["6", "23"]);

function tag(text: string, name: string): string | undefined {
  return TAG(name).exec(text)?.[1]?.trim();
}

function earliestPlayedAt(text: string): string | null {
  let min = Infinity;
  for (const m of text.matchAll(HAND_TIMESTAMP)) {
    const [, y, mo, d, h, mi, s] = m;
    const ts = Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
    if (ts < min) min = ts;
  }
  return min === Infinity ? null : new Date(min).toISOString();
}

type Game = { code: string; xml: string };

function parseGames(text: string): Game[] {
  return [...text.matchAll(GAME_BLOCK)].map((m) => ({ code: m[1], xml: m[2] }));
}

function heroPreflop(gameXml: string, heroName: string): { voluntary: boolean; raised: boolean } {
  let voluntary = false;
  let raised = false;
  for (const a of collectRawActions(gameXml)) {
    if (a.player !== heroName) continue;
    if (a.round !== "0" && a.round !== "1") continue;
    if (VOLUNTARY_TYPES.has(a.type)) voluntary = true;
    if (RAISE_TYPES.has(a.type)) raised = true;
  }
  return { voluntary, raised };
}

export function parseIpokerMtt(buffer: Buffer): ParseResult {
  // Нормализуем CRLF (как в PS-семье) — на единообразие, хотя XML парсим по тегам.
  const text = buffer.toString("utf-8").replace(/\r\n?/g, "\n");

  const tournamentId = tag(text, "tournamentcode");
  if (!tournamentId) {
    return {
      ok: false,
      error: { type: "UNSUPPORTED_FORMAT", message: "Загрузи турнирный XML iPoker" },
    };
  }

  const heroName = tag(text, "nickname");
  if (!heroName) {
    return {
      ok: false,
      error: { type: "PARSE_FAILED", message: "Не удалось определить героя (нет <nickname>)" },
    };
  }

  const tournamentName = tag(text, "tournamentname");
  const name = tournamentName ? `${tournamentName} #${tournamentId}` : `Турнир #${tournamentId}`;
  const tableSizeRaw = tag(text, "tablesize");
  const tableSize = tableSizeRaw ? parseInt(tableSizeRaw, 10) : undefined;
  const playedAt = earliestPlayedAt(text);

  // Дедуп по gamecode (склейка многостольных файлов). Только раздачи с участием героя.
  const seen = new Set<string>();
  const games = parseGames(text).filter((g) => {
    if (seen.has(g.code)) return false;
    seen.add(g.code);
    return parsePlayers(g.xml).some((p) => p.name === heroName);
  });
  const handsCount = games.length;

  if (handsCount === 0) {
    return {
      ok: false,
      error: { type: "PARSE_FAILED", message: "Файл не содержит раздач с участием героя" },
    };
  }

  let vpipHands = 0;
  let pfrHands = 0;
  for (const g of games) {
    const pre = heroPreflop(g.xml, heroName);
    if (pre.voluntary) vpipHands++;
    if (pre.raised) pfrHands++;
  }
  const vpipPercent = Math.round((vpipHands / handsCount) * 10000) / 100;
  const pfrPercent = Math.round((pfrHands / handsCount) * 10000) / 100;

  const snapshots = games.map((g) => parseGame(g.xml, heroName, tableSize));
  const importanceLevels = assignImportanceLevels(snapshots);
  // Момент раздачи — её <startdate>; псевдонимы оппонентов — по <player seat/name>
  // (сырой ник только локально, в вывод идёт «oppN» — см. shared/opponent-tokens).
  const handPlayedAt = (xml: string): string | null => {
    const m = /<startdate>(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})<\/startdate>/.exec(xml);
    if (!m) return null;
    const [, y, mo, d, h, mi, s] = m;
    return new Date(Date.UTC(+y, +mo - 1, +d, +h, +mi, +s)).toISOString();
  };
  const tokenFor = opponentTokenizer();
  const hands = snapshots.map((snapshot, index) => {
    const namesBySeat: Record<number, string> = {};
    for (const p of parsePlayers(games[index].xml)) namesBySeat[p.seat] = p.name;
    assignOpponentTokens(snapshot.tableSnapshot.seats, namesBySeat, tokenFor);
    return {
      ...snapshot,
      importanceLevel: importanceLevels[index],
      playedAt: handPlayedAt(games[index].xml),
    };
  });

  const postflopAggressionFactor = Math.round(computePostflopAggressionFactor(snapshots) * 100) / 100;
  const styleDiagnosis = diagnoseStyle(vpipPercent, pfrPercent, postflopAggressionFactor);

  // Бай-ин iPoker — в валюте (€), не в фишках. Результат меряем в стартовых стеках:
  // суммарный нетто по фишкам (win−bet за все раздачи) / стек героя в первой раздаче.
  const heroStartStack = parsePlayers(games[0].xml).find((p) => p.name === heroName)?.chips ?? 1;
  const netChips = snapshots.reduce((sum, s) => sum + s.chipResult, 0);
  const resultBuyins = Math.round((netChips / (heroStartStack || 1)) * 100) / 100;

  return {
    ok: true,
    data: {
      room: "iPoker",
      externalTournamentId: tournamentId,
      name,
      playedAt: playedAt ?? new Date().toISOString(),
      handsCount,
      vpipPercent,
      pfrPercent,
      postflopAggressionFactor,
      resultBuyins,
      styleDiagnosis,
      hands,
    },
  };
}
