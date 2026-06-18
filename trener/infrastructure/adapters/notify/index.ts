import { isNotifyConfigured } from "@/config/notify";
import { telegramNotifyAdapter } from "./telegram";
import { noopNotifyAdapter } from "./noop";
import type { NotifyPort } from "./types";

// Telegram, если бот настроен (есть токен и chat_id), иначе noop (дев без бота, тесты).
export function getNotifyAdapter(): NotifyPort {
  return isNotifyConfigured() ? telegramNotifyAdapter : noopNotifyAdapter;
}

// Мягкая отправка для мест, где уведомление вторично и не должно ронять основную
// работу (воркер очереди): доставка не удалась — пишем в лог и продолжаем. Сам
// факт события уже зафиксирован в БД, уведомление — лишь сигнал «зайди посмотри».
export async function safeNotifyAdmin(message: string): Promise<void> {
  try {
    await getNotifyAdapter().notifyAdmin(message);
  } catch (err) {
    console.error("[notify] не удалось отправить уведомление администратору:", err);
  }
}

export type { NotifyPort } from "./types";
