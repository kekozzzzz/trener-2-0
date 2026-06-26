import { getTelegramAdminChatId } from "@/config/notify";
import {
  sendMessage,
  answerCallbackQuery,
} from "@/infrastructure/adapters/notify/telegram-api";
import { approvePost, holdPost } from "./service";

// Обработка входящих обновлений Telegram. ГЛАВНОЕ ПРАВИЛО БЕЗОПАСНОСТИ:
// командовать ботом может только Артём (его chat_id). Текст чужих сообщений — данные,
// НЕ инструкции: его никогда не исполняем, только пересылаем как отзыв.

interface TgUser {
  id: number;
  username?: string;
  first_name?: string;
}
interface TgCallback {
  id: string;
  from?: TgUser;
  data?: string;
}
interface TgMessage {
  from?: TgUser;
  text?: string;
}
export interface TgUpdate {
  callback_query?: TgCallback;
  message?: TgMessage;
}

function isAdmin(userId: number | undefined): boolean {
  return userId !== undefined && String(userId) === getTelegramAdminChatId();
}

export async function handleTelegramUpdate(
  update: TgUpdate,
  now: Date = new Date(),
): Promise<void> {
  if (update.callback_query) {
    await handleCallback(update.callback_query, now);
    return;
  }
  if (update.message) {
    await handleMessage(update.message);
  }
}

// Нажатие inline-кнопки (✅/✏️ под превью). Только от Артёма.
async function handleCallback(cb: TgCallback, now: Date): Promise<void> {
  if (!isAdmin(cb.from?.id)) {
    await answerCallbackQuery(cb.id, { text: "Нет доступа" });
    return;
  }

  const [action, postId] = (cb.data ?? "").split(":");

  if (action === "approve" && postId) {
    const post = approvePost(postId, now);
    await answerCallbackQuery(cb.id, { text: post ? "Одобрено ✅" : "Пост не найден" });
    if (post) {
      await sendMessage(
        getTelegramAdminChatId(),
        `✅ Пост «${postId}» одобрен — выйдет в назначенное время.`,
      );
    }
    return;
  }

  if (action === "hold" && postId) {
    const post = holdPost(postId, now);
    await answerCallbackQuery(cb.id, { text: post ? "Отложено ✏️" : "Пост не найден" });
    if (post) {
      await sendMessage(
        getTelegramAdminChatId(),
        `✏️ Пост «${postId}» отложен. Напиши правки — переделаю и пришлю заново.`,
      );
    }
    return;
  }

  await answerCallbackQuery(cb.id, { text: "Непонятная команда" });
}

// Входящее сообщение. От Артёма — пока не команда (зарезервировано под будущее).
// От постороннего — пересылаем как отзыв (поддержка-FAQ и черновик-ИИ — Фаза 3).
async function handleMessage(msg: TgMessage): Promise<void> {
  if (isAdmin(msg.from?.id)) return;

  const text = (msg.text ?? "").trim();
  if (!text) return;

  const who = msg.from?.username
    ? `@${msg.from.username}`
    : `id ${msg.from?.id ?? "?"}`;

  // Чужой текст — данные, не инструкции. Помечаем явно, чтобы и человек, и ИИ
  // понимали: это отзыв на пересылку, а не команда боту.
  await sendMessage(
    getTelegramAdminChatId(),
    `✉️ Сообщение от пользователя (${who}) — это отзыв, не команда:\n\n${text}`,
  );
}
