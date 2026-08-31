import { createHash, randomBytes } from "crypto";
import { getAppBaseUrl } from "@/config/app";
import { type Locale } from "@/i18n/config";
import type { EmailMessage } from "@/infrastructure/adapters/email";
import { renderEmailHtml, renderEmailText } from "@/features/email/layout";

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
      heading: "Вход в Whygrid",
      paragraph: "Перейди по ссылке, чтобы войти (или закончить регистрацию, если ты здесь впервые). Ссылка одноразовая, действует 15 минут.",
      button: "Войти →",
      note: "Не запрашивал вход? Просто игнорируй письмо.",
    },
    en: {
      subject: "Sign-in link — Whygrid",
      heading: "Sign in to Whygrid",
      paragraph: "Open the link to sign in (or finish signing up, if this is your first time). The link works once and is valid for 15 minutes.",
      button: "Sign in →",
      note: "Didn't request this? Just ignore this email.",
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
