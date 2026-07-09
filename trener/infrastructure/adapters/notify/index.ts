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
//
// Возвращает, дошло ли сообщение. Воркерные вызовы результат игнорируют (для них
// уведомление вторично), а дайджесту он нужен, чтобы крон не рапортовал «отправлено»
// вслепую, когда релей молчал (иначе провал доставки теряется без следа).
export async function safeNotifyAdmin(message: string): Promise<boolean> {
  try {
    await getNotifyAdapter().notifyAdmin(message);
    return true;
  } catch (err) {
    console.error("[notify] не удалось отправить уведомление администратору:", err);
    return false;
  }
}

export type { NotifyPort } from "./types";
