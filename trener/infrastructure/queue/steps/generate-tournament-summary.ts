import { Prisma } from "@prisma/client";
import type { StepHandler } from "../types";
import type { BBThreeBetLeakHand, IsoLeakHand, LimpExample, LimpLeak, OpenLeakHand, OpenShoveLeakHand, SqueezeLeakHand, TournamentSummaryHand, VsOpenThreeBetLeakHand } from "@/infrastructure/adapters/llm/types";
import type { TableSnapshot } from "@/parser/types";
import { getLlmAdapter } from "@/infrastructure/adapters/llm";
import { detectHeroOpen } from "@/parser/open-raise";
import { detectHeroLimp } from "@/parser/limp";
import { detectHeroBBDefense } from "@/parser/bb-defense";
import { detectHeroOpenShove } from "@/parser/open-shove";
import { detectHeroVsOpen } from "@/parser/vs-open";
import { detectHeroIso } from "@/parser/iso";
import { detectHeroSqueeze } from "@/parser/squeeze";
import { isOpenSignificantlyWide } from "@/config/poker/rfi-chart";
import { isBBThreeBetSignificantlyWide } from "@/config/poker/bb-defense-chart";
import { isOpenShoveSignificantlyWide } from "@/config/poker/push-fold-chart";
import { isVsOpenThreeBetSignificantlyWide } from "@/config/poker/vs-open-chart";
import { isIsoSignificantlyWide } from "@/config/poker/iso-chart";
import { isSqueezeSignificantlyWide } from "@/config/poker/squeeze-chart";
import { handLabel } from "@/config/poker/hand-codes";

type GenerateTournamentSummaryPayload = {
  tournamentId: string;
};

// Сколько разных открывашек-нарушителей максимум назвать в обзоре.
const MAX_OPEN_LEAK = 5;

// Сколько показательных рук-лимпов максимум приложить к сводке лимпов.
const MAX_LIMP_EXAMPLES = 4;

// Сколько разных 3-бетов-из-BB-нарушителей максимум назвать в обзоре.
const MAX_BB_3BET_LEAK = 5;

// Сколько разных опен-шовов-нарушителей максимум назвать в обзоре.
const MAX_OPEN_SHOVE_LEAK = 5;

// Сколько разных 3-бетов-против-опена-нарушителей максимум назвать в обзоре.
const MAX_VS_OPEN_3BET_LEAK = 5;

// Сколько разных изоляций-нарушителей максимум назвать в обзоре.
const MAX_ISO_LEAK = 5;

// Сколько разных сквизов-нарушителей максимум назвать в обзоре.
const MAX_SQUEEZE_LEAK = 5;

// Открывашки заметно шире нормы по ВСЕМ раздачам турнира: детектор находит
// «открылся первым» + код руки (parser/open-raise), чарт отсеивает норму и
// граничные (config/poker/rfi-chart). Правило 1/2 — числа и сверку считает код.
// Группируем по позиция+код, чаще встречающиеся — выше, берём топ-N.
function collectOpenLeak(hands: { tableData: unknown }[]): OpenLeakHand[] {
  const counts = new Map<string, { leak: OpenLeakHand; count: number }>();
  for (const hand of hands) {
    const open = detectHeroOpen(hand.tableData as unknown as TableSnapshot);
    if (!open || !isOpenSignificantlyWide(open.position, open.code)) continue;
    const key = `${open.position}:${open.code}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { leak: { position: open.position, code: open.code }, count: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_OPEN_LEAK)
    .map((e) => e.leak);
}

// Лимпы Hero по ВСЕМ раздачам турнира: детектор находит «открыл лимпом / долимпил»
// (parser/limp), считаем сколько каждого и берём несколько показательных рук
// (дедуп по позиция+код+вид). Правило 1 — факт лимпа считает код, LLM формулирует.
function collectLimpLeak(hands: { tableData: unknown }[]): LimpLeak {
  let openLimps = 0;
  let overLimps = 0;
  const examples = new Map<string, LimpExample>();
  for (const hand of hands) {
    const limp = detectHeroLimp(hand.tableData as unknown as TableSnapshot);
    if (!limp) continue;
    if (limp.kind === "OPEN") openLimps += 1;
    else overLimps += 1;
    const key = `${limp.position}:${limp.code}:${limp.kind}`;
    if (!examples.has(key)) examples.set(key, { position: limp.position, code: limp.code, kind: limp.kind });
  }
  return { openLimps, overLimps, examples: [...examples.values()].slice(0, MAX_LIMP_EXAMPLES) };
}

// 3-беты из BB заметно шире нормы по ВСЕМ раздачам турнира: детектор находит спот
// защиты BB + 3-бет Hero (parser/bb-defense), чарт отсеивает норму и граничные
// (config/poker/bb-defense-chart). Правило 1 — позицию открывашки и код считает код.
// Группируем по позиция-открывашки+код, чаще встречающиеся — выше, берём топ-N.
function collectBBThreeBetLeak(hands: { tableData: unknown }[]): BBThreeBetLeakHand[] {
  const counts = new Map<string, { leak: BBThreeBetLeakHand; count: number }>();
  for (const hand of hands) {
    const def = detectHeroBBDefense(hand.tableData as unknown as TableSnapshot);
    if (!def || def.action !== "3BET") continue;
    if (!isBBThreeBetSignificantlyWide(def.openerPosition, def.code)) continue;
    const key = `${def.openerPosition}:${def.code}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { leak: { openerPosition: def.openerPosition, code: def.code }, count: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_BB_3BET_LEAK)
    .map((e) => e.leak);
}

// Опен-шовы заметно шире нормы по ВСЕМ раздачам турнира: детектор находит «первым в
// банк олл-ин на коротком» + стек-бэнд (parser/open-shove), чарт отсеивает норму и
// граничные (config/poker/push-fold-chart). Правило 1 — позицию/стек/код считает код.
// Группируем по позиция+бэнд+код, чаще встречающиеся — выше, берём топ-N.
function collectOpenShoveLeak(hands: { tableData: unknown }[]): OpenShoveLeakHand[] {
  const counts = new Map<string, { leak: OpenShoveLeakHand; count: number }>();
  for (const hand of hands) {
    const shove = detectHeroOpenShove(hand.tableData as unknown as TableSnapshot);
    if (!shove || !isOpenShoveSignificantlyWide(shove.band, shove.position, shove.code)) continue;
    const key = `${shove.position}:${shove.band}:${shove.code}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { leak: { position: shove.position, band: shove.band, code: shove.code }, count: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_OPEN_SHOVE_LEAK)
    .map((e) => e.leak);
}

// 3-беты против опена (Hero не в BB) заметно шире нормы по ВСЕМ раздачам турнира:
// детектор находит спот «против одиночного опена» + 3-бет Hero (parser/vs-open), чарт
// отсеивает норму и граничные (config/poker/vs-open-chart). Правило 1 — позицию и код
// считает код. Группируем по наша-позиция+код, чаще встречающиеся — выше, топ-N.
function collectVsOpenThreeBetLeak(hands: { tableData: unknown }[]): VsOpenThreeBetLeakHand[] {
  const counts = new Map<string, { leak: VsOpenThreeBetLeakHand; count: number }>();
  for (const hand of hands) {
    const vs = detectHeroVsOpen(hand.tableData as unknown as TableSnapshot);
    if (!vs || vs.action !== "3BET") continue;
    if (!isVsOpenThreeBetSignificantlyWide(vs.heroPosition, vs.code)) continue;
    const key = `${vs.heroPosition}:${vs.code}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { leak: { position: vs.heroPosition, code: vs.code }, count: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_VS_OPEN_3BET_LEAK)
    .map((e) => e.leak);
}

// Изоляции заметно шире нормы по ВСЕМ раздачам турнира: детектор находит «лимпер
// впереди + Hero изолирует рейзом» (parser/iso), чарт отсеивает норму и граничные
// (config/poker/iso-chart = RFI минус низ). Правило 1 — позицию и код считает код.
// Группируем по наша-позиция+код, чаще встречающиеся — выше, топ-N.
function collectIsoLeak(hands: { tableData: unknown }[]): IsoLeakHand[] {
  const counts = new Map<string, { leak: IsoLeakHand; count: number }>();
  for (const hand of hands) {
    const iso = detectHeroIso(hand.tableData as unknown as TableSnapshot);
    if (!iso || !isIsoSignificantlyWide(iso.heroPosition, iso.code)) continue;
    const key = `${iso.heroPosition}:${iso.code}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { leak: { position: iso.heroPosition, code: iso.code }, count: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_ISO_LEAK)
    .map((e) => e.leak);
}

// Сквизы заметно шире нормы по ВСЕМ раздачам турнира: детектор находит «опен + коллер
// впереди + Hero 3-бетит поверх» (parser/squeeze), чарт отсеивает норму (config/poker/
// squeeze-chart — велью-тяжёлый). Правило 1 — позицию и код считает код. Топ-N.
function collectSqueezeLeak(hands: { tableData: unknown }[]): SqueezeLeakHand[] {
  const counts = new Map<string, { leak: SqueezeLeakHand; count: number }>();
  for (const hand of hands) {
    const sq = detectHeroSqueeze(hand.tableData as unknown as TableSnapshot);
    if (!sq || !isSqueezeSignificantlyWide(sq.heroPosition, sq.code)) continue;
    const key = `${sq.heroPosition}:${sq.code}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { leak: { position: sq.heroPosition, code: sq.code }, count: 1 });
  }
  return [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .slice(0, MAX_SQUEEZE_LEAK)
    .map((e) => e.leak);
}

// Заменяет токены ссылок {{h:N}} в overview на {{h:handId|карты}} по списку раздач
// карточки (N — индекс в этом списке). Индекс вне диапазона → токен убираем
// (ссылка на несуществующую раздачу невозможна). Карты руки берём из снимка
// парсера, не из текста LLM (правило 2 — модель карты не пишет сама).
function resolveHandTokens(
  overview: string,
  cardHands: { id: string; tableData: unknown }[]
): string {
  return overview.replace(/\{\{\s*h:\s*(\d+)\s*\}\}/g, (_match, n: string) => {
    const index = Number(n);
    const hand = cardHands[index];
    if (!hand) return "";
    const snapshot = hand.tableData as unknown as TableSnapshot;
    const label = handLabel(snapshot.heroCards ?? []) ?? "раздача";
    return `{{h:${hand.id}|${label}}}`;
  });
}

// Шаг «Обзор турнира»: собирает общую картину (overview с инлайн-ссылками на
// раздачи + вывод по открывашкам) из уже посчитанных метрик, готовых разборов
// раздач карточки и детерминированно найденных открывашек (правило 1 — LLM ничего
// не пересчитывает). Ставится один раз при готовности карточки.
// Идемпотентность: если summary уже сохранён — платный вызов пропускается.
export const generateTournamentSummaryStep: StepHandler = async (task, db) => {
  const { tournamentId } = task.payload as GenerateTournamentSummaryPayload;

  const tournament = await db.tournament.findUnique({ where: { id: tournamentId } });
  if (!tournament || tournament.deletedAt) return; // удалено до того, как воркер взял задачу
  if (tournament.summary !== null) return; // обзор уже собран

  if (
    tournament.handsCount === null ||
    tournament.vpipPercent === null ||
    tournament.resultBuyins === null ||
    tournament.styleDiagnosis === null
  ) {
    throw new Error(
      "Метрики турнира не посчитаны — PARSE_TOURNAMENT должен выполниться раньше GENERATE_TOURNAMENT_SUMMARY"
    );
  }

  // Раздачи карточки с готовым разбором, в стабильном порядке (как на карточке) —
  // индекс в этом списке и есть ссылка, по которой LLM указывает раздачу.
  const cardHands = await db.hand.findMany({
    where: { tournamentId, selectedForCard: true, analysis: { not: Prisma.DbNull } },
    include: { dialogue: true },
    orderBy: { createdAt: "asc" },
  });

  if (cardHands.length === 0) return; // нечего обобщать

  const summaryHands: TournamentSummaryHand[] = [];
  cardHands.forEach((hand, index) => {
    const analysis = hand.analysis as { played?: string; optimal?: string; note?: string } | null;
    if (!analysis?.played || !analysis?.optimal) return; // защитно: разбор без played/optimal пропускаем
    summaryHands.push({
      index,
      importanceLevel: hand.importanceLevel,
      chipResult: hand.chipResult,
      played: analysis.played,
      optimal: analysis.optimal,
      note: analysis.note ?? undefined,
      verdict: hand.dialogue?.verdict ?? undefined,
    });
  });

  if (summaryHands.length === 0) return;

  // Открывашки ищем по ВСЕМ раздачам турнира (не только карточным) — утечка
  // открытий видна на всей дистанции, а не на ~10 отобранных раздачах.
  const allHands = await db.hand.findMany({
    where: { tournamentId },
    select: { tableData: true },
  });
  const openLeak = collectOpenLeak(allHands);
  const limpLeak = collectLimpLeak(allHands);
  const bbThreeBetLeak = collectBBThreeBetLeak(allHands);
  const openShoveLeak = collectOpenShoveLeak(allHands);
  const vsOpenThreeBetLeak = collectVsOpenThreeBetLeak(allHands);
  const isoLeak = collectIsoLeak(allHands);
  const squeezeLeak = collectSqueezeLeak(allHands);

  const result = await getLlmAdapter().generateTournamentSummary({
    tournament: {
      handsCount: tournament.handsCount,
      vpipPercent: tournament.vpipPercent.toNumber(),
      resultBuyins: tournament.resultBuyins.toNumber(),
      styleDiagnosis: tournament.styleDiagnosis,
    },
    hands: summaryHands,
    openLeak,
    limpLeak,
    bbThreeBetLeak,
    openShoveLeak,
    vsOpenThreeBetLeak,
    isoLeak,
    squeezeLeak,
  }, { playerId: tournament.playerId });

  const overview = resolveHandTokens(result.overview, cardHands);
  const summary = { overview };

  await db.tournament.updateMany({
    where: { id: tournamentId, deletedAt: null },
    data: { summary: summary as unknown as Prisma.InputJsonValue },
  });
};
