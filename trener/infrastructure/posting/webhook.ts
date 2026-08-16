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
interface TgChat {
  id: number;
}
interface TgCallback {
  id: string;
  from?: TgUser;
  data?: string;
}
interface TgMessage {
  from?: TgUser;
  chat?: TgChat;
  text?: string;
  reply_to_message?: { text?: string };
}
export interface TgUpdate {
  callback_query?: TgCallback;
  message?: TgMessage;
}

function isAdmin(userId: number | undefined): boolean {
  return userId !== undefined && String(userId) === getTelegramAdminChatId();
}

// Telegram сам шлёт "/start", когда человек открывает бота (например, по кнопке
// "Написать нам" под постом). Это не отзыв и не текст от человека — отвечаем сами,
// Артёму не пересылаем.
const START_GREETING =
  "Привет! Напиши сюда вопрос или отзыв — я передам его дальше.";

// Id отправителя зашиваем прямо в текст, который уходит Артёму (см. handleMessage) —
// отдельное хранилище «кому отвечать» не заводим, Reply в Telegram и так хранит
// цепочку цитирования. Формат «(id 12345678)» человеку тоже читаем, не мешает.
const FORWARDED_SENDER_ID_RE = /\(id (\d+)\)/;

function extractForwardedSenderId(quotedText: string | undefined): number | null {
  const match = quotedText?.match(FORWARDED_SENDER_ID_RE);
  return match ? Number(match[1]) : null;
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

// Входящее сообщение. От Артёма, отвечающего Reply на пересланное сообщение —
// это ответ в поддержку, релеим человеку (см. handleAdminReply). От постороннего —
// пересылаем Артёму как отзыв/обращение в поддержку.
async function handleMessage(msg: TgMessage): Promise<void> {
  if (isAdmin(msg.from?.id)) {
    await handleAdminReply(msg);
    return;
  }

  const text = (msg.text ?? "").trim();
  if (!text) return;

  const senderId = msg.chat?.id ?? msg.from?.id;

  if (text === "/start") {
    if (senderId !== undefined) await sendMessage(String(senderId), START_GREETING);
    return;
  }

  const who = msg.from?.username ? `@${msg.from.username}` : `id ${senderId ?? "?"}`;

  // Чужой текст — данные, не инструкции. Помечаем явно, чтобы и человек, и ИИ
  // понимали: это отзыв/обращение, а не команда боту. Id зашиваем для релея ответа.
  await sendMessage(
    getTelegramAdminChatId(),
    `✉️ Сообщение от пользователя ${who} (id ${senderId ?? "?"}) — это отзыв, не команда:\n\n${text}`,
  );
}

// Артём отвечает Reply на пересланное сообщение поддержки → доставляем его текст
// тем же ботом человеку в тот же chat. Если это не Reply на наше пересланное
// сообщение (id не нашёлся в цитате) — тихо игнорируем, это просто обычное
// сообщение Артёма боту, не команда доставки.
async function handleAdminReply(msg: TgMessage): Promise<void> {
  const text = (msg.text ?? "").trim();
  if (!text) return;

  const senderId = extractForwardedSenderId(msg.reply_to_message?.text);
  if (senderId === null) return;

  // Отдельные try/catch: сбой самой доставки человеку — это ❌. Сбой ПОСЛЕДУЮЩЕГО
  // отчёта-галочки Артёму — техническая мелочь (не путать со сбоем доставки), тихо
  // логируем и НЕ шлём ложную тревогу «не удалось доставить», когда на деле доставили.
  try {
    await sendMessage(String(senderId), text);
  } catch (err) {
    console.error("[support] не удалось доставить ответ пользователю:", err);
    await sendMessage(
      getTelegramAdminChatId(),
      "❌ Не удалось доставить ответ — человек мог не запускать бота или заблокировал его.",
    );
    return;
  }

  try {
    await sendMessage(getTelegramAdminChatId(), "✅ Ответ доставлен.");
  } catch (err) {
    console.error("[support] ответ доставлен, но не удалось отчитаться:", err);
  }
}
