import { isEmailConfigured, isSmtpConfigured } from "@/config/email";
import { unisenderEmailAdapter } from "./unisender";
import { smtpEmailAdapter } from "./smtp";
import { noopEmailAdapter } from "./noop";
import type { EmailMessage, EmailPort } from "./types";

// Порядок выбора: SMTP (ящик support@whygrid.app) — основной канал с 2026-09; Unisender
// Go — запасной, если заданы его переменные, но не SMTP (правило 4, переключение без
// нового деплоя); иначе noop (дев без настроек, тесты).
export function getEmailAdapter(): EmailPort {
  if (isSmtpConfigured()) return smtpEmailAdapter;
  if (isEmailConfigured()) return unisenderEmailAdapter;
  return noopEmailAdapter;
}

// Мягкая отправка для мест, где письмо вторично и не должно ронять основную работу.
// Для писем, которые важно доставить (сброс пароля), используется queue-шаг —
// там адаптер зовётся напрямую и ошибка уводит задачу в retry/карантин.
export async function safeSendEmail(message: EmailMessage): Promise<void> {
  try {
    await getEmailAdapter().sendEmail(message);
  } catch (err) {
    console.error("[email] не удалось отправить письмо:", err);
  }
}

export type { EmailMessage, EmailPort } from "./types";
