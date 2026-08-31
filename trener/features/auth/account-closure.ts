import { createHash, randomBytes } from "crypto";
import { getAppBaseUrl } from "@/config/app";
import { type Locale } from "@/i18n/config";
import type { EmailMessage } from "@/infrastructure/adapters/email";
import { renderEmailHtml, renderEmailText } from "@/features/email/layout";

// Закрытие аккаунта — необратимо (мягкое удаление + анонимизация). Подтверждается
// ссылкой из письма (доступ к ящику = подтверждение владельца), как сброс пароля.
// Сырой токен живёт только в письме, в базе — SHA-256.
export function generateClosureToken(): { raw: string; hash: string } {
  const raw = randomBytes(32).toString("hex");
  return { raw, hash: hashClosureToken(raw) };
}

export function hashClosureToken(raw: string): string {
  return createHash("sha256").update(raw).digest("hex");
}

// Ссылка ведёт на страницу подтверждения с кнопкой — само закрытие происходит по
// нажатию (POST), а не по клику, чтобы почтовый сканер не закрыл аккаунт молча.
export function buildClosureLink(rawToken: string): string {
  return `${getAppBaseUrl()}/account/close/confirm?token=${rawToken}`;
}

export function buildClosureEmail(to: string, link: string, locale: Locale): EmailMessage {
  const T = {
    ru: {
      subject: "Закрытие аккаунта — Whygrid",
      heading: "Закрытие аккаунта",
      paragraph: "Ты запросил закрытие аккаунта Whygrid. Это необратимо: доступ к турнирам и истории разборов пропадёт.",
      paragraph2: "Чтобы подтвердить, перейди по ссылке и нажми кнопку на странице (ссылка действует 1 час).",
      button: "Подтвердить закрытие →",
      note: "Не запрашивал? Игнорируй письмо — аккаунт останется на месте.",
    },
    en: {
      subject: "Account closure — Whygrid",
      heading: "Account closure",
      paragraph: "You've requested to close your Whygrid account. This is permanent: access to your tournaments and review history will be gone.",
      paragraph2: "To confirm, open the link and press the button on the page (the link is valid for 1 hour).",
      button: "Confirm closure →",
      note: "Didn't request this? Ignore this email — your account stays as is.",
    },
  } as const;
  const t = T[locale];
  const content = {
    heading: t.heading,
    paragraphs: [t.paragraph, t.paragraph2],
    button: { label: t.button, url: link },
    note: t.note,
  };
  return { to, subject: t.subject, text: renderEmailText(content), html: renderEmailHtml(content) };
}
