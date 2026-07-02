import { createHash, randomBytes } from "crypto";
import { getAppBaseUrl } from "@/config/app";
import { type Locale } from "@/i18n/config";
import type { EmailMessage } from "@/infrastructure/adapters/email";

// «Волшебная ссылка»: один проход и для входа, и для регистрации без пароля. Сырой
// токен живёт только в ссылке из письма, в базе — его SHA-256 (как у сброса пароля,
// password-reset.ts). 32 байта случайности → перебор невозможен, быстрый SHA-256
// достаточен (bcrypt для high-entropy токена избыточен).
export function generateMagicToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashMagicToken(raw) };
}

export function hashMagicToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Абсолютная ссылка для письма. Клик обрабатывает GET-роут /enter/verify.
export function buildMagicLink(rawToken: string): string {
  return `${getAppBaseUrl()}/enter/verify?token=${rawToken}`;
}

// Письмо со ссылкой. Нейтральный текст: работает и для входа существующего игрока, и
// для первой регистрации — какой случай, решит уже клик по ссылке (есть аккаунт или нет).
export function buildMagicLinkEmail(to: string, link: string, locale: Locale): EmailMessage {
  const T = {
    ru: {
      subject: "Ссылка для входа — Whygrid",
      text:
        `Перейди по ссылке, чтобы войти в Whygrid (или завершить регистрацию, если ты здесь впервые):\n${link}\n\n` +
        `Ссылка действует 15 минут и сработает один раз.\n\n` +
        `Если ты не запрашивал вход — просто проигнорируй это письмо.`,
      html:
        `<p>Перейди по ссылке, чтобы войти в Whygrid (или завершить регистрацию, если ты здесь впервые):</p>` +
        `<p><a href="${link}">${link}</a></p>` +
        `<p>Ссылка действует 15 минут и сработает один раз.</p>` +
        `<p>Если ты не запрашивал вход — просто проигнорируй это письмо.</p>`,
    },
    en: {
      subject: "Sign-in link — Whygrid",
      text:
        `Open this link to sign in to Whygrid (or finish signing up if this is your first time):\n${link}\n\n` +
        `The link is valid for 15 minutes and works once.\n\n` +
        `If you didn't request a sign-in, just ignore this email.`,
      html:
        `<p>Open this link to sign in to Whygrid (or finish signing up if this is your first time):</p>` +
        `<p><a href="${link}">${link}</a></p>` +
        `<p>The link is valid for 15 minutes and works once.</p>` +
        `<p>If you didn't request a sign-in, just ignore this email.</p>`,
    },
  } as const;
  const t = T[locale];
  return { to, subject: t.subject, text: t.text, html: t.html };
}
