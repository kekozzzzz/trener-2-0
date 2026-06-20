import { isEmailConfigured } from "@/config/email";
import { unisenderEmailAdapter } from "./unisender";
import { noopEmailAdapter } from "./noop";
import type { EmailMessage, EmailPort } from "./types";

// Unisender Go, если настроен (есть API-ключ), иначе noop (дев без ключа, тесты).
export function getEmailAdapter(): EmailPort {
  return isEmailConfigured() ? unisenderEmailAdapter : noopEmailAdapter;
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
