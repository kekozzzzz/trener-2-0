import fs from "fs";
import path from "path";
import { getPostQueueDir } from "@/config/posting";
import { getTelegramAdminChatId, getTelegramChannelId } from "@/config/notify";
import {
  sendPhoto,
  type InlineKeyboard,
} from "@/infrastructure/adapters/notify/telegram-api";
import { dueForPreview, dueForPublish, getPost, setStatus } from "./store";
import type { QueuedPost } from "./types";

// Логика автопостинга: собрать превью, опубликовать, обработать одобрение. Сетевые
// детали — в telegram-api, состояние — в store. Маршруты (cron, webhook) только зовут
// эти функции. `now` передаётся явно для тестируемости.

function readImage(post: QueuedPost): Buffer {
  return fs.readFileSync(path.join(getPostQueueDir(), post.imageFile));
}

// Кнопки одобрения под превью (callback_data разбирает webhook).
function approvalKeyboard(postId: string): InlineKeyboard {
  return {
    inline_keyboard: [
      [
        { text: "✅ Опубликовать", callback_data: `approve:${postId}` },
        { text: "✏️ Поправить", callback_data: `hold:${postId}` },
      ],
    ],
  };
}

// Кнопка-ссылка под боевым постом (напр. «✍️ Написать нам»), если задана.
function contactKeyboard(post: QueuedPost): InlineKeyboard | undefined {
  if (post.buttonText && post.buttonUrl) {
    return { inline_keyboard: [[{ text: post.buttonText, url: post.buttonUrl }]] };
  }
  return undefined;
}

// Время публикации по-московски для текста превью.
function formatMsk(iso: string): string {
  const fmt = new Intl.DateTimeFormat("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return fmt.format(new Date(iso));
}

// Отправить Артёму превью поста с кнопками одобрения. Помечает PREVIEW_SENT.
export async function sendPreview(post: QueuedPost, now: Date = new Date()): Promise<void> {
  const caption = `Пост в очереди — выйдет ${formatMsk(post.scheduledAt)} МСК:\n\n${post.caption}`;
  await sendPhoto(getTelegramAdminChatId(), readImage(post), {
    caption,
    replyMarkup: approvalKeyboard(post.id),
  });
  setStatus(post.id, "PREVIEW_SENT", now);
}

// Опубликовать пост в канал. Помечает PUBLISHED.
export async function publishPost(post: QueuedPost, now: Date = new Date()): Promise<void> {
  await sendPhoto(getTelegramChannelId(), readImage(post), {
    caption: post.caption,
    replyMarkup: contactKeyboard(post),
  });
  setStatus(post.id, "PUBLISHED", now);
}

// Один проход планировщика (зовётся из cron): разослать готовые превью и опубликовать
// одобренное. Ошибка по одному посту не валит остальные — логируем и идём дальше.
export async function runScheduler(
  now: Date = new Date(),
): Promise<{ previews: number; published: number }> {
  let previews = 0;
  let published = 0;

  for (const post of dueForPreview(now)) {
    try {
      await sendPreview(post, now);
      previews++;
    } catch (err) {
      console.error(`[posting] превью не отправлено (${post.id}):`, err);
    }
  }

  for (const post of dueForPublish(now)) {
    try {
      await publishPost(post, now);
      published++;
    } catch (err) {
      console.error(`[posting] публикация не прошла (${post.id}):`, err);
    }
  }

  return { previews, published };
}

// Одобрение (✅): пост уйдёт в канал в назначенное время. Идемпотентно.
export function approvePost(postId: string, now: Date = new Date()): QueuedPost | null {
  if (!getPost(postId)) return null;
  return setStatus(postId, "APPROVED", now);
}

// Отложить (✏️): пост придерживается, Артём правит. Идемпотентно.
export function holdPost(postId: string, now: Date = new Date()): QueuedPost | null {
  if (!getPost(postId)) return null;
  return setStatus(postId, "HELD", now);
}
