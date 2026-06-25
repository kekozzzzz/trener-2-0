import { Prisma } from "@prisma/client";
import type { StepHandler } from "../types";
import type { OpenLeakHand, TournamentSummaryHand } from "@/infrastructure/adapters/llm/types";
import type { TableSnapshot } from "@/parser/types";
import { getLlmAdapter } from "@/infrastructure/adapters/llm";
import { detectHeroOpen } from "@/parser/open-raise";
import { isOpenSignificantlyWide } from "@/config/poker/rfi-chart";
import { handLabel } from "@/config/poker/hand-codes";

type GenerateTournamentSummaryPayload = {
  tournamentId: string;
};

// Сколько разных открывашек-нарушителей максимум назвать в обзоре.
const MAX_OPEN_LEAK = 5;

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

  const result = await getLlmAdapter().generateTournamentSummary({
    tournament: {
      handsCount: tournament.handsCount,
      vpipPercent: tournament.vpipPercent.toNumber(),
      resultBuyins: tournament.resultBuyins.toNumber(),
      styleDiagnosis: tournament.styleDiagnosis,
    },
    hands: summaryHands,
    openLeak,
  }, { playerId: tournament.playerId });

  const overview = resolveHandTokens(result.overview, cardHands);
  const summary = { overview };

  await db.tournament.updateMany({
    where: { id: tournamentId, deletedAt: null },
    data: { summary: summary as unknown as Prisma.InputJsonValue },
  });
};
