import { prisma } from "@/infrastructure/db/client";
import { enqueue } from "@/infrastructure/queue";
import { getChatMessageMaxLength } from "@/config/chat";
import { assessAiAccess } from "@/features/usage/budget";
import { isSubscriptionGateEnabled } from "@/config/plans";
import { isChatAvailable } from "./availability";

type SendChatMessageInput = {
  handId: string;
  text: string;
};

type SendChatMessageResult =
  | { ok: true }
  | {
      ok: false;
      error:
        | "HAND_NOT_FOUND"
        | "CHAT_NOT_AVAILABLE"
        | "EMPTY_MESSAGE"
        | "MESSAGE_TOO_LONG"
        | "AWAITING_REPLY"
        | "PAYWALL"
        | "LIMIT_REACHED";
    };

// Свободный вопрос игрока по разобранной раздаче (architecture/04-потоки-данных.md,
// раздел 4). Гейт: isChatAvailable (план 2026-06-17, раздел 0) — простые раздачи
// сразу, критические только после VERDICT_SHOWN (правило 2). Один открытый вопрос
// за раз — если последнее сообщение уже от PLAYER без ответа, новое не принимается
// (та же идемпотентная защита, что в generate-chat-reply.ts).
export async function sendChatMessage(input: SendChatMessageInput): Promise<SendChatMessageResult> {
  const text = input.text.trim();

  const hand = await prisma.hand.findUnique({
    where: { id: input.handId },
    include: {
      dialogue: true,
      chatMessages: { orderBy: { createdAt: "desc" }, take: 1 },
      tournament: { select: { id: true, playerId: true } },
    },
  });
  if (!hand) return { ok: false, error: "HAND_NOT_FOUND" };

  if (!isChatAvailable(hand)) {
    return { ok: false, error: "CHAT_NOT_AVAILABLE" };
  }

  if (hand.chatMessages[0]?.author === "PLAYER") {
    return { ok: false, error: "AWAITING_REPLY" };
  }

  if (!text) return { ok: false, error: "EMPTY_MESSAGE" };

  // Лимит длины (config/chat.ts, architecture/07-безопасность.md, раздел 2):
  // тормоз для платных токенов и злоупотреблений — проверяем после trim.
  if (text.length > getChatMessageMaxLength()) return { ok: false, error: "MESSAGE_TOO_LONG" };

  // Гейт бюджета: ответ в чате — платный вызов Claude.
  if (isSubscriptionGateEnabled()) {
    const access = await assessAiAccess(prisma, hand.tournament.playerId, { tournamentId: hand.tournamentId });
    if (!access.allowed) return { ok: false, error: access.reason };
  }

  await prisma.$transaction(async (tx) => {
    await tx.chatMessage.create({
      data: { handId: input.handId, author: "PLAYER", text },
    });
    await enqueue(tx, { type: "GENERATE_CHAT_REPLY", payload: { handId: input.handId } });
  });

  return { ok: true };
}
