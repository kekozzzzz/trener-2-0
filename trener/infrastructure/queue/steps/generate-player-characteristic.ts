import type { StepHandler } from "../types";
import { llmMeta } from "./llm-meta";
import type { CountedTournament } from "@/features/profile/aggregate";
import { aggregatePlayerCharacteristic } from "@/features/profile/aggregate";
import { getLlmAdapter } from "@/infrastructure/adapters/llm";
import type { Locale } from "@/i18n/config";

type GeneratePlayerCharacteristicPayload = {
  playerId: string;
};

// Шаг «Характеристика игрока»: пересобирает сводный текст по ВСЕМ турнирам игрока
// (стиль, средний VPIP, открывашки шире нормы по всей дистанции). Ставится при
// готовности карточки очередного турнира. Числа считает агрегатор детерминированно
// (правило 1), LLM только формулирует. Результат — в PlayerProfile (показ в кабинете).
//
// Идемпотентность + контроль расходов: если набор учтённых турниров не изменился и
// текст уже собран — платный вызов пропускается.
export const generatePlayerCharacteristicStep: StepHandler = async (task, db) => {
  const { playerId } = task.payload as GeneratePlayerCharacteristicPayload;

  // Учитываем только турниры с готовыми метриками (после PARSE_TOURNAMENT), не удалённые.
  const tournaments = await db.tournament.findMany({
    where: {
      playerId,
      deletedAt: null,
      status: { in: ["PARSED", "CARD_READY"] },
      vpipPercent: { not: null },
      resultBuyins: { not: null },
      handsCount: { not: null },
      styleDiagnosis: { not: null },
    },
    select: { id: true, vpipPercent: true, resultBuyins: true, handsCount: true, styleDiagnosis: true },
  });

  const count = tournaments.length;

  const existing = await db.playerProfile.findUnique({ where: { playerId } });
  if (existing?.characteristic != null && existing.tournamentsCounted === count) return; // набор не изменился
  if (count === 0) return; // характеристику строить не из чего

  // Все ненулевые после фильтра выше — `!` безопасен.
  const counted: CountedTournament[] = tournaments.map((t) => ({
    vpipPercent: t.vpipPercent!.toNumber(),
    resultBuyins: t.resultBuyins!.toNumber(),
    handsCount: t.handsCount!,
    styleDiagnosis: t.styleDiagnosis!,
  }));

  // Открывашки ищем по ВСЕМ раздачам всех учтённых турниров — утечка видна на всей
  // дистанции, а не на ~10 карточных раздачах одного турнира.
  const allHands = await db.hand.findMany({
    where: { tournamentId: { in: tournaments.map((t) => t.id) } },
    select: { tableData: true },
  });

  const facts = aggregatePlayerCharacteristic(counted, allHands);
  if (!facts) return; // защитно: count > 0 уже гарантирует не-null

  // Язык характеристики — язык интерфейса игрока (Player.locale); дефолт ru.
  const player = await db.player.findUnique({ where: { id: playerId }, select: { locale: true } });

  const result = await getLlmAdapter().generatePlayerCharacteristic(
    {
      locale: (player?.locale as Locale) ?? "ru",
      tournamentsCounted: facts.tournamentsCounted,
      avgVpip: facts.avgVpip,
      avgResultBuyins: facts.avgResultBuyins,
      avgHandsCount: facts.avgHandsCount,
      dominantStyle: facts.dominantStyle,
      styleCounts: facts.styleCounts,
      openLeak: facts.openLeak,
    },
    llmMeta(task, playerId),
  );

  const data = {
    characteristic: result.characteristic,
    avgVpip: facts.avgVpip,
    avgResultBuyins: facts.avgResultBuyins,
    avgHandsCount: facts.avgHandsCount,
    tournamentsCounted: facts.tournamentsCounted,
    recalculatedAt: new Date(),
  };

  await db.playerProfile.upsert({
    where: { playerId },
    create: { playerId, ...data },
    update: data,
  });
};
