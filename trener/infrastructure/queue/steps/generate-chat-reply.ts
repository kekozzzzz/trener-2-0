import type { StepHandler } from "../types";
import type { TableSnapshot } from "@/parser/types";
import type { ChatReplyRequest } from "@/infrastructure/adapters/llm/types";
import type { Locale } from "@/i18n/config";
import { getLlmAdapter } from "@/infrastructure/adapters/llm";
import { buildAnalysisSummary } from "@/features/chat/analysis-summary";
import { isChatAvailable } from "@/features/chat/availability";

type GenerateChatReplyPayload = {
  handId: string;
};

// Шаг «Чат по раздаче»: отвечает на последний свободный вопрос игрока в треде.
// Идемпотентность: если сообщений нет или последнее не от PLAYER — ответ уже
// дан (или нечего отвечать), платный вызов пропускается
// (architecture/04-потоки-данных.md, раздел 4).
export const generateChatReplyStep: StepHandler = async (task, db) => {
  const { handId } = task.payload as GenerateChatReplyPayload;

  const hand = await db.hand.findUnique({
    where: { id: handId },
    include: {
      tournament: { include: { player: { select: { locale: true } } } },
      dialogue: true,
      chatMessages: { orderBy: { createdAt: "asc" } },
    },
  });

  if (!hand || hand.tournament.deletedAt) return; // удалено до того, как воркер взял задачу

  const messages = hand.chatMessages;
  const lastMessage = messages[messages.length - 1];
  if (!lastMessage || lastMessage.author !== "PLAYER") return; // идемпотентность

  // Гейт чата (isChatAvailable, sendChatMessage гарантирует его на входе):
  // простая раздача — нужен готовый analysis; критическая — ещё и VERDICT_SHOWN.
  // Любое другое состояние здесь означает нарушение инварианта.
  if (!isChatAvailable(hand)) {
    throw new Error(
      "GENERATE_CHAT_REPLY поставлена с нарушением гейта чата (нет analysis, либо сократовский диалог не дошёл до VERDICT_SHOWN)"
    );
  }

  const { tournament } = hand;

  if (
    tournament.handsCount === null ||
    tournament.vpipPercent === null ||
    tournament.resultBuyins === null ||
    tournament.styleDiagnosis === null
  ) {
    throw new Error(
      "Метрики турнира не посчитаны — PARSE_TOURNAMENT должен выполниться раньше GENERATE_CHAT_REPLY"
    );
  }

  const analysis = hand.analysis as { played?: string; optimal?: string } | null;
  if (!analysis?.played || !analysis?.optimal) {
    throw new Error(
      "В analysis раздачи нет played/optimal — GENERATE_HAND_ANALYSIS должен выполниться раньше GENERATE_CHAT_REPLY"
    );
  }

  const request: ChatReplyRequest = {
    // Язык ответа тренера — язык интерфейса игрока (Player.locale); дефолт ru.
    locale: (tournament.player.locale as Locale) ?? "ru",
    history: messages.map((message) => ({ author: message.author, text: message.text })),
    analysisSummary: buildAnalysisSummary(
      { played: analysis.played, optimal: analysis.optimal },
      hand.dialogue?.verdict ?? null // у простых раздач (STRONG/MEDIUM) диалога и вердикта нет
    ),
    chipResult: hand.chipResult,
    tableSnapshot: hand.tableData as unknown as TableSnapshot,
    tournament: {
      handsCount: tournament.handsCount,
      vpipPercent: tournament.vpipPercent.toNumber(),
      resultBuyins: tournament.resultBuyins.toNumber(),
      styleDiagnosis: tournament.styleDiagnosis,
    },
  };

  const result = await getLlmAdapter().generateChatReply(request, { playerId: tournament.playerId });

  await db.chatMessage.create({
    data: { handId, author: "SYSTEM", text: result.reply },
  });
};
