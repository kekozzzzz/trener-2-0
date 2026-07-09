import { getEmailApiKey, getEmailApiUrl, getEmailFromAddress, getEmailFromName, getEmailCallTimeoutMs } from "@/config/email";
import type { EmailMessage, EmailPort } from "./types";

// Адаптер Unisender Go (транзакционный продукт) — один HTTPS-запрос на email/send.json,
// без SDK. Документация: https://godocs.unisender.ru/web-api-ref#email-send
// Формат тела v1: { message: { recipients: [{ email }], subject, from_email,
// from_name, body: { html, plaintext } } }. Ключ — в заголовке X-API-KEY.
export const unisenderEmailAdapter: EmailPort = {
  async sendEmail(message: EmailMessage): Promise<void> {
    const response = await fetch(getEmailApiUrl(), {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-API-KEY": getEmailApiKey(),
      },
      // Таймаут против зависшего сервиса: не держим server action (сброс пароля) ~5 мин.
      signal: AbortSignal.timeout(getEmailCallTimeoutMs()),
      body: JSON.stringify({
        message: {
          recipients: [{ email: message.to }],
          subject: message.subject,
          from_email: getEmailFromAddress(),
          from_name: getEmailFromName(),
          body: { html: message.html, plaintext: message.text },
        },
      }),
    });

    if (!response.ok) {
      // Тело при ошибке может содержать эхо письма (адрес получателя) — не тянем
      // его целиком в лог. Кода статуса достаточно, детали смотрим вручную.
      throw new Error(`Unisender Go email/send не прошёл: HTTP ${response.status}`);
    }

    // Даже при HTTP 200 Unisender может вернуть пер-адресный отказ в теле
    // (failure_count). Проверяем, чтобы не считать недоставленное письмо успехом.
    const data = (await response.json().catch(() => null)) as { failure_count?: number } | null;
    if (data && typeof data.failure_count === "number" && data.failure_count > 0) {
      throw new Error("Unisender Go email/send: письмо отклонено (failure_count > 0)");
    }
  },
};
