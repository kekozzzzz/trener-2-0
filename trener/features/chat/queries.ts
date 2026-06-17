import type { MessageAuthor } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";
import { isChatAvailable } from "./availability";

export type ChatMessageView = { author: MessageAuthor; text: string; createdAt: Date };

export type ChatView = {
  available: boolean;
  awaitingReply: boolean;
  messages: ChatMessageView[];
};

// Чтение состояния чата (architecture/04-потоки-данных.md, раздел 4):
// available — гейт isChatAvailable (раздел 0 плана 2026-06-17): простые раздачи
// сразу, критические только после VERDICT_SHOWN;
// awaitingReply — последнее сообщение от игрока, ответ ещё не сгенерирован.
export async function getChat(handId: string): Promise<ChatView | null> {
  const hand = await prisma.hand.findUnique({
    where: { id: handId },
    include: {
      dialogue: true,
      chatMessages: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!hand) return null;

  const messages = hand.chatMessages;
  const lastMessage = messages[messages.length - 1];

  return {
    available: isChatAvailable(hand),
    awaitingReply: lastMessage?.author === "PLAYER",
    messages: messages.map((message) => ({
      author: message.author,
      text: message.text,
      createdAt: message.createdAt,
    })),
  };
}
