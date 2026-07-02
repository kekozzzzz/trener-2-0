import { createHash, randomBytes } from "crypto";
import { getAppBaseUrl } from "@/config/app";
import { type Locale } from "@/i18n/config";
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
export function buildResetEmail(to: string, link: string, locale: Locale): EmailMessage {
  const T = {
    ru: {
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
    },
    en: {
      subject: "Password reset — Whygrid",
      text:
        `Someone requested a password reset for this Whygrid account.\n\n` +
        `To set a new password, open this link (valid for 1 hour):\n${link}\n\n` +
        `If it wasn't you, just ignore this email — your password won't change.`,
      html:
        `<p>Someone requested a password reset for this Whygrid account.</p>` +
        `<p>To set a new password, open this link (valid for 1 hour):</p>` +
        `<p><a href="${link}">${link}</a></p>` +
        `<p>If it wasn't you, just ignore this email — your password won't change.</p>`,
    },
  } as const;
  const t = T[locale];
  return { to, subject: t.subject, text: t.text, html: t.html };
}
