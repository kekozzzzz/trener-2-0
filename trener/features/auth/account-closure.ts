import { createHash, randomBytes } from "crypto";
import { getAppBaseUrl } from "@/config/app";
import type { EmailMessage } from "@/infrastructure/adapters/email";

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

export function buildClosureEmail(to: string, link: string): EmailMessage {
  return {
    to,
    subject: "Закрытие аккаунта — Whygrid",
    text:
      `Ты запросил закрытие аккаунта в Whygrid.\n\n` +
      `Чтобы подтвердить, перейди по ссылке и нажми кнопку на странице (ссылка действует 1 час):\n${link}\n\n` +
      `Закрытие необратимо: доступ к турнирам и истории разборов пропадёт.\n\n` +
      `Если это был не ты — просто проигнорируй письмо, аккаунт останется на месте.`,
    html:
      `<p>Ты запросил закрытие аккаунта в Whygrid.</p>` +
      `<p>Чтобы подтвердить, перейди по ссылке и нажми кнопку на странице (ссылка действует 1 час):</p>` +
      `<p><a href="${link}">${link}</a></p>` +
      `<p>Закрытие необратимо: доступ к турнирам и истории разборов пропадёт.</p>` +
      `<p>Если это был не ты — просто проигнорируй письмо, аккаунт останется на месте.</p>`,
  };
}
