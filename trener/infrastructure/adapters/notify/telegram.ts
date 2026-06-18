import {
  getTelegramBotToken,
  getTelegramAdminChatId,
  getTelegramBaseUrl,
  getTelegramProxySecret,
} from "@/config/notify";
import type { NotifyPort } from "./types";

// Отправка уведомления администратору через Telegram Bot API — один HTTPS-запрос
// sendMessage, без SDK. На проде baseURL = релей в Казахстане (VM из РФ напрямую
// до api.telegram.org не достаёт); доверие к серту релея уже задано процессу через
// NODE_EXTRA_CA_CERTS, поэтому обычный fetch работает без своего dispatcher.
//
// Токен бота лежит в адресе запроса (так устроен Telegram Bot API) — на релее
// access_log для Telegram-прохода отключён, чтобы токен не попал в логи.
export const telegramNotifyAdapter: NotifyPort = {
  async notifyAdmin(message: string): Promise<void> {
    const base = getTelegramBaseUrl() || "https://api.telegram.org";
    const url = `${base}/bot${getTelegramBotToken()}/sendMessage`;

    const headers: Record<string, string> = { "content-type": "application/json" };
    const secret = getTelegramProxySecret();
    if (secret) headers["x-proxy-secret"] = secret;

    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify({ chat_id: getTelegramAdminChatId(), text: message }),
    });

    if (!response.ok) {
      // Тело не печатаем целиком: ответ Telegram при ошибке может содержать эхо
      // запроса. Достаточно кода — детали смотрим вручную, токен в лог не тянем.
      throw new Error(`Telegram sendMessage не прошёл: HTTP ${response.status}`);
    }
  },
};
