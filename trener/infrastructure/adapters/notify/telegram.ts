import { getTelegramAdminChatId } from "@/config/notify";
import { getHealthCheckTimeoutMs } from "@/config/health";
import { sendMessage, getMe } from "./telegram-api";
import type { NotifyPort } from "./types";

// Адаптер уведомлений администратору поверх низкоуровневого клиента telegram-api.
// Сетевые детали (релей КЗ, x-proxy-secret, токен в URL) живут в клиенте — здесь
// только бизнес-смысл «сообщи администратору» и «жив ли канal».
export const telegramNotifyAdapter: NotifyPort = {
  async notifyAdmin(message: string): Promise<void> {
    // Бросает при ошибке доставки — решение «глушить или нет» за вызывающим.
    await sendMessage(getTelegramAdminChatId(), message);
  },

  // Проверка доступности канала для /api/health: getMe через релей, без сообщения.
  // НЕ бросает — ошибку гасим в false, чтобы агрегатор пометил «telegram: fail», а не
  // уронил весь health-запрос.
  async ping(): Promise<boolean> {
    return getMe({ signal: AbortSignal.timeout(getHealthCheckTimeoutMs()) });
  },
};
