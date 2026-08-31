// Транзакционные письма аккаунта (регистрация, смена пароля). Чистые конструкторы
// EmailMessage без обращения к БД — их легко покрыть тестом и переиспользовать.
// Отправка — через safeSendEmail в местах вызова (см. actions.ts). Письмо сброса
// пароля живёт отдельно (password-reset.ts), т.к. несёт одноразовый токен.
// Язык письма (locale) приходит параметром: письма шлются и из HTTP-контекста, и из
// крона, поэтому перевод — простым словарём внутри модуля, а не через next-intl.
// Каркас/вёрстка — features/email/layout.ts (единый брендированный вид всех писем).
import { getAppBaseUrl } from "@/config/app";
import { type Locale } from "@/i18n/config";
import type { EmailMessage } from "@/infrastructure/adapters/email";
import { renderEmailHtml, renderEmailText } from "@/features/email/layout";

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
// Сокращено до минимума 2026-08-31 (решение Артёма): «никто длинные приветствия не
// читает» — заголовок, одна строка, кнопка. Без сноски «если регистрировался не ты»:
// регистрация уже случилась, игнор письма её не отменяет — фраза имеет смысл только
// там, где неигнорирование меняет исход (сброс пароля, вход по ссылке, закрытие аккаунта).
export function buildWelcomeEmail(to: string, locale: Locale): EmailMessage {
  const analyzeUrl = `${getAppBaseUrl()}/analyze`;
  const T = {
    ru: {
      subject: "Добро пожаловать в Whygrid",
      heading: "Добро пожаловать",
      paragraph: "Загрузи файл истории раздач турнира и начни разбираться в покере по-настоящему.",
      button: "Загрузить турнир →",
    },
    en: {
      subject: "Welcome to Whygrid",
      heading: "Welcome",
      paragraph: "Upload a hand-history file from one of your tournaments and start actually understanding your poker.",
      button: "Upload a tournament →",
    },
  } as const;
  const t = T[locale];
  const content = {
    heading: t.heading,
    paragraphs: [t.paragraph],
    button: { label: t.button, url: analyzeUrl },
  };
  return { to, subject: t.subject, text: renderEmailText(content), html: renderEmailHtml(content) };
}

// Уведомление безопасности: пароль аккаунта изменён. Шлём и при смене из кабинета,
// и при сбросе по ссылке — чтобы при чужом доступе человек сразу это заметил.
// Упрощено 2026-08-31 (решение Артёма): убрано «если это ты — всё в порядке» (лишнее)
// и кнопка «Сбросить пароль» (бессмысленна — пароль уже изменён, действие не то).
// Остаётся факт + прямой контакт поддержки, если это был не он.
export function buildPasswordChangedEmail(to: string, changedAt: Date, locale: Locale): EmailMessage {
  const when = formatDate(changedAt, locale);
  const T = {
    ru: {
      subject: "Пароль изменён — Whygrid",
      heading: "Пароль изменён",
      fact: `Пароль аккаунта Whygrid изменён ${when}.`,
      contact: 'Если это был не ты — напиши нам: <a href="mailto:support@whygrid.app" style="color:#0E0E0E;">support@whygrid.app</a>',
    },
    en: {
      subject: "Password changed — Whygrid",
      heading: "Password changed",
      fact: `The password for your Whygrid account was changed on ${when}.`,
      contact: 'If this wasn\'t you, email us: <a href="mailto:support@whygrid.app" style="color:#0E0E0E;">support@whygrid.app</a>',
    },
  } as const;
  const t = T[locale];
  const content = { heading: t.heading, paragraphs: [t.fact, t.contact] };
  return { to, subject: t.subject, text: renderEmailText(content), html: renderEmailHtml(content) };
}
