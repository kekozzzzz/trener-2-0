import { prisma } from "@/infrastructure/db/client";
import { enqueue } from "@/infrastructure/queue";

type SendChatMessageInput = {
  handId: string;
  text: string;
};

type SendChatMessageResult =
  | { ok: true }
  | { ok: false; error: "HAND_NOT_FOUND" | "CHAT_NOT_AVAILABLE" | "EMPTY_MESSAGE" | "AWAITING_REPLY" };

// Свободный вопрос игрока по разобранной раздаче (architecture/04-потоки-данных.md,
// раздел 4). Гейт: чат открыт только после VERDICT_SHOWN (правило 2, план
// 2026-06-15-чат-по-раздаче.md, раздел 0). Один открытый вопрос за раз —
// если последнее сообщение уже от PLAYER без ответа, новое не принимается
// (та же идемпотентная защита, что в generate-chat-reply.ts).
export async function sendChatMessage(input: SendChatMessageInput): Promise<SendChatMessageResult> {
  const text = input.text.trim();

  const hand = await prisma.hand.findUnique({
    where: { id: input.handId },
    include: {
      dialogue: true,
      chatMessages: { orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  if (!hand) return { ok: false, error: "HAND_NOT_FOUND" };

  if (hand.dialogue?.state !== "VERDICT_SHOWN") {
    return { ok: false, error: "CHAT_NOT_AVAILABLE" };
  }

  if (hand.chatMessages[0]?.author === "PLAYER") {
    return { ok: false, error: "AWAITING_REPLY" };
  }

  if (!text) return { ok: false, error: "EMPTY_MESSAGE" };

  await prisma.$transaction(async (tx) => {
    await tx.chatMessage.create({
      data: { handId: input.handId, author: "PLAYER", text },
    });
    await enqueue(tx, { type: "GENERATE_CHAT_REPLY", payload: { handId: input.handId } });
  });

  return { ok: true };
}
