// Транзакционные письма аккаунта (регистрация, смена пароля). Чистые конструкторы
// EmailMessage без обращения к БД — их легко покрыть тестом и переиспользовать.
// Отправка — через safeSendEmail в местах вызова (см. actions.ts). Письмо сброса
// пароля живёт отдельно (password-reset.ts), т.к. несёт одноразовый токен.
// Язык письма (locale) приходит параметром: письма шлются и из HTTP-контекста, и из
// крона, поэтому перевод — простым словарём внутри модуля, а не через next-intl.
import { getAppBaseUrl } from "@/config/app";
import { type Locale } from "@/i18n/config";
import type { EmailMessage } from "@/infrastructure/adapters/email";

// Дата в теле письма на языке игрока: «26 июня 2026» / «June 26, 2026».
function formatDate(date: Date, locale: Locale): string {
  return date.toLocaleDateString(locale === "en" ? "en-US" : "ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Приветствие после регистрации. Доступ НЕ блокируем (мягкая модель, решение
// 2026-06-26): письмо лишь подтверждает регистрацию и зовёт начать разбор.
export function buildWelcomeEmail(to: string, locale: Locale): EmailMessage {
  const url = getAppBaseUrl();
  const T = {
    ru: {
      subject: "Добро пожаловать в Whygrid",
      text:
        `Привет!\n\n` +
        `Ты зарегистрировался в Whygrid — сократовском тренере по турнирному покеру.\n\n` +
        `Как начать: загрузи файл истории рук (HH) своего турнира — первый разбор бесплатный. ` +
        `Тренер не подсказывает готовый ответ, а задаёт вопросы, чтобы ты сам нашёл сильное решение.\n\n` +
        `Открыть: ${url}\n\n` +
        `Если регистрировался не ты — просто проигнорируй это письмо.`,
      html:
        `<p>Привет!</p>` +
        `<p>Ты зарегистрировался в Whygrid — сократовском тренере по турнирному покеру.</p>` +
        `<p>Как начать: загрузи файл истории рук (HH) своего турнира — первый разбор бесплатный. ` +
        `Тренер не подсказывает готовый ответ, а задаёт вопросы, чтобы ты сам нашёл сильное решение.</p>` +
        `<p><a href="${url}">Открыть Whygrid</a></p>` +
        `<p>Если регистрировался не ты — просто проигнорируй это письмо.</p>`,
    },
    en: {
      subject: "Welcome to Whygrid",
      text:
        `Hi!\n\n` +
        `You've just signed up for Whygrid — a Socratic coach for tournament poker.\n\n` +
        `To get started, upload a hand history (HH) file from one of your tournaments — your first review is free. ` +
        `The coach doesn't hand you the answer; it asks questions so you arrive at the strong play yourself.\n\n` +
        `Open: ${url}\n\n` +
        `If you didn't sign up, just ignore this email.`,
      html:
        `<p>Hi!</p>` +
        `<p>You've just signed up for Whygrid — a Socratic coach for tournament poker.</p>` +
        `<p>To get started, upload a hand history (HH) file from one of your tournaments — your first review is free. ` +
        `The coach doesn't hand you the answer; it asks questions so you arrive at the strong play yourself.</p>` +
        `<p><a href="${url}">Open Whygrid</a></p>` +
        `<p>If you didn't sign up, just ignore this email.</p>`,
    },
  } as const;
  const t = T[locale];
  return { to, subject: t.subject, text: t.text, html: t.html };
}

// Уведомление безопасности: пароль аккаунта изменён. Шлём и при смене из кабинета,
// и при сбросе по ссылке — чтобы при чужом доступе человек сразу это заметил.
export function buildPasswordChangedEmail(to: string, changedAt: Date, locale: Locale): EmailMessage {
  const resetUrl = `${getAppBaseUrl()}/forgot-password`;
  const when = formatDate(changedAt, locale);
  const T = {
    ru: {
      subject: "Пароль изменён — Whygrid",
      text:
        `Пароль к твоему аккаунту в Whygrid изменён (${when}).\n\n` +
        `Если это сделал ты — всё в порядке, ничего делать не нужно.\n\n` +
        `Если это был не ты — немедленно сбрось пароль: ${resetUrl}\n` +
        `и напиши нам на support@whygrid.app.`,
      html:
        `<p>Пароль к твоему аккаунту в Whygrid изменён (${when}).</p>` +
        `<p>Если это сделал ты — всё в порядке, ничего делать не нужно.</p>` +
        `<p>Если это был не ты — немедленно <a href="${resetUrl}">сбрось пароль</a> ` +
        `и напиши нам на <a href="mailto:support@whygrid.app">support@whygrid.app</a>.</p>`,
    },
    en: {
      subject: "Password changed — Whygrid",
      text:
        `The password for your Whygrid account was changed (${when}).\n\n` +
        `If that was you, all good — no action needed.\n\n` +
        `If it wasn't you, reset your password right away: ${resetUrl}\n` +
        `and email us at support@whygrid.app.`,
      html:
        `<p>The password for your Whygrid account was changed (${when}).</p>` +
        `<p>If that was you, all good — no action needed.</p>` +
        `<p>If it wasn't you, <a href="${resetUrl}">reset your password</a> right away ` +
        `and email us at <a href="mailto:support@whygrid.app">support@whygrid.app</a>.</p>`,
    },
  } as const;
  const t = T[locale];
  return { to, subject: t.subject, text: t.text, html: t.html };
}
