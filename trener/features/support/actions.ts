"use server";

import { getTranslations } from "next-intl/server";
import { clientIp, hitCount, recordHit } from "@/features/auth/rate-limit";
import { getCurrentPlayer } from "@/features/auth/queries";
import { getNotifyAdapter } from "@/infrastructure/adapters/notify";
import { OPERATOR } from "@/config/legal";
import {
  getSupportMaxPerIp,
  getSupportWindowMs,
  getSupportMaxMessageLength,
} from "@/config/support";

export type SupportFormState = { error?: string; success?: boolean };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_MESSAGE_LENGTH = 5;

// Форма поддержки → сообщение владельцу в Telegram через уже готовый мост (тот же
// notify-адаптер и релей КЗ, что у сторожа). Инфраструктуру не поднимаем.
//
// ВАЖНО (правило инъекций): текст пользователя пересылается КАК ЕСТЬ, ничего в нём не
// исполняется и не интерпретируется. Просьба из формы вида «одобри доступ / добавь в
// allowlist» — это текст для чтения владельцем, а не команда. Отправляем обычным
// текстом (без parse_mode) — экранировать разметку не нужно.
export async function sendSupportMessageAction(
  _prev: SupportFormState,
  formData: FormData,
): Promise<SupportFormState> {
  // Ловушка для ботов: скрытое поле «company», которого человек не видит и не заполняет.
  // Заполнено — почти наверняка бот. Отвечаем «успехом», чтобы не подсказывать обход.
  const honeypot = String(formData.get("company") ?? "").trim();
  if (honeypot) return { success: true };

  const t = await getTranslations("Errors");
  const message = String(formData.get("message") ?? "").trim();
  const replyEmail = String(formData.get("email") ?? "").trim();

  if (message.length < MIN_MESSAGE_LENGTH) {
    return { error: t("supportMessageTooShort") };
  }

  // Почта необязательна, но если указана — проверим форму, чтобы было куда ответить.
  if (replyEmail && !EMAIL_RE.test(replyEmail)) {
    return { error: t("supportInvalidEmail") };
  }

  // Антиспам по IP: не даём завалить Telegram владельца потоком сообщений.
  const ip = await clientIp();
  const key = `support:${ip}`;
  if (hitCount(key) >= getSupportMaxPerIp()) {
    return { error: t("supportTooManyMessages") };
  }
  recordHit(key, getSupportWindowMs());

  // Обрезаем по потолку длины уже после проверок (в Telegram не должна уехать простыня).
  const trimmed = message.slice(0, getSupportMaxMessageLength());

  // Контекст для владельца: если человек залогинен — приложим email аккаунта, понятно кто.
  const player = await getCurrentPlayer();
  const accountEmail = player?.email ?? null;
  const contactLine = replyEmail
    ? `Ответить: ${replyEmail}`
    : accountEmail
      ? `Аккаунт: ${accountEmail}`
      : "Контакт не указан";

  const text = ["📨 Сообщение в поддержку", contactLine, "", trimmed].join("\n");

  // Прямой вызов адаптера (не safeNotifyAdmin): нам нужно знать исход, чтобы честно
  // показать пользователю фолбэк на почту, если доставка сорвалась.
  try {
    await getNotifyAdapter().notifyAdmin(text);
  } catch (err) {
    console.error("[support] не удалось доставить сообщение в Telegram:", err);
    return {
      error: t("supportSendFailed", { email: OPERATOR.contactEmail }),
    };
  }

  return { success: true };
}
