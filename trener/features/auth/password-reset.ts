import { createHash, randomBytes } from "crypto";
import { getAppBaseUrl } from "@/config/app";
import { type Locale } from "@/i18n/config";
import type { EmailMessage } from "@/infrastructure/adapters/email";
import { renderEmailHtml, renderEmailText } from "@/features/email/layout";

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
      heading: "Сброс пароля",
      paragraph: "Кто-то запросил сброс пароля для этого аккаунта. Ссылка ниже действует 1 час.",
      button: "Задать новый пароль →",
      note: "Не запрашивал? Просто игнорируй письмо — пароль не изменится.",
    },
    en: {
      subject: "Password reset — Whygrid",
      heading: "Password reset",
      paragraph: "Someone requested a password reset for this account. The link below is valid for 1 hour.",
      button: "Set a new password →",
      note: "Didn't request this? Just ignore this email — your password won't change.",
    },
  } as const;
  const t = T[locale];
  const content = {
    heading: t.heading,
    paragraphs: [t.paragraph],
    button: { label: t.button, url: link },
    note: t.note,
  };
  return { to, subject: t.subject, text: renderEmailText(content), html: renderEmailHtml(content) };
}
