import { createHash, randomBytes } from "crypto";
import { getAppBaseUrl } from "@/config/app";
import type { EmailMessage } from "@/infrastructure/adapters/email";

// Сырой токен (живёт только в ссылке из письма) и его SHA-256 (хранится в базе).
// 32 байта случайности → 64 hex-символа: подобрать перебором невозможно, поэтому
// хватает быстрого SHA-256 (bcrypt для high-entropy токена избыточен).
export function generateResetToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashResetToken(raw) };
}

export function hashResetToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Абсолютная ссылка сброса для письма.
export function buildResetLink(rawToken: string): string {
  return `${getAppBaseUrl()}/reset-password?token=${rawToken}`;
}

// Содержимое письма со ссылкой сброса (HTML + текстовая версия).
export function buildResetEmail(to: string, link: string): EmailMessage {
  return {
    to,
    subject: "Сброс пароля — Whygrid",
    text:
      `Кто-то запросил сброс пароля для этого аккаунта в Whygrid.\n\n` +
      `Чтобы задать новый пароль, перейди по ссылке (действует 1 час):\n${link}\n\n` +
      `Если это был не ты — просто проигнорируй письмо, пароль не изменится.`,
    html:
      `<p>Кто-то запросил сброс пароля для этого аккаунта в Whygrid.</p>` +
      `<p>Чтобы задать новый пароль, перейди по ссылке (действует 1 час):</p>` +
      `<p><a href="${link}">${link}</a></p>` +
      `<p>Если это был не ты — просто проигнорируй письмо, пароль не изменится.</p>`,
  };
}
