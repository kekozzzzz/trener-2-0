import type { NotifyPort } from "./types";

// Заглушка: когда бот не настроен (нет токена/chat_id — дев, тесты), уведомления
// просто не отправляются. Продукт работает без сторожа — уведомления вторичны,
// сам факт события (POISONED-задача и т.п.) уже сохранён в БД.
export const noopNotifyAdapter: NotifyPort = {
  async notifyAdmin(): Promise<void> {
    // намеренно ничего не делает
  },

  // Бота нет (дев/тесты) — health по этому каналу не должен падать.
  async ping(): Promise<boolean> {
    return true;
  },
};
