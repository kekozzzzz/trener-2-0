import type { EmailMessage, EmailPort } from "./types";

// Заглушка: когда email не настроен (нет API-ключа — дев, тесты), письма не уходят.
// Тему и адресата логируем (без тела) — в деве удобно видеть, что письмо «отправилось
// бы», а ссылку сброса при необходимости берём из логов отдельной строкой в шаге.
export const noopEmailAdapter: EmailPort = {
  async sendEmail(message: EmailMessage): Promise<void> {
    console.info(`[email:noop] письмо не отправлено (email не настроен): "${message.subject}" → ${message.to}`);
  },
};
