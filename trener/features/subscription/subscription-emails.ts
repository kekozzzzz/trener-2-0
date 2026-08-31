// Транзакционные письма подписки (успешная оплата, напоминание о скором списании/
// истечении). Чистые конструкторы EmailMessage без БД — отправка через safeSendEmail
// в местах вызова. Названия тарифов и суммы берутся из config/plans (правило №3:
// бизнес-конфиг не дублируем в текстах). Язык (locale) приходит параметром: письма
// шлются из крона/вебхука без HTTP-контекста, поэтому перевод — простым словарём
// внутри модуля, а не через next-intl. Каркас — features/email/layout.ts.
import { getAppBaseUrl } from "@/config/app";
import { formatRubles } from "@/config/plans";
import { type Locale } from "@/i18n/config";
import type { EmailMessage } from "@/infrastructure/adapters/email";
import { renderEmailHtml, renderEmailText } from "@/features/email/layout";

// Дата на языке игрока: «26 июня 2026» / «June 26, 2026».
function formatDate(date: Date, locale: Locale): string {
  return date.toLocaleDateString(locale === "en" ? "en-US" : "ru-RU", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// «Оплата прошла». Работает и для первой оплаты, и для автопродления — это квитанция:
// что оплачено и до какого числа подписка активна. amountKopecks — фактически списанная
// сумма в копейках рубля (как в журнале платежей).
export function buildPaymentSuccessEmail(
  to: string,
  planTitle: string,
  activeUntil: Date,
  amountKopecks: number,
  locale: Locale,
): EmailMessage {
  const accountUrl = `${getAppBaseUrl()}/account`;
  const until = formatDate(activeUntil, locale);
  const sum = formatRubles(amountKopecks);
  const T = {
    ru: {
      subject: "Оплата прошла — Whygrid",
      heading: "Оплата прошла",
      paragraph: `Спасибо! Тариф <b>${planTitle}</b>, списано <b>${sum}</b>, подписка активна до <b>${until}</b>.`,
      button: "Управлять подпиской →",
    },
    en: {
      subject: "Payment received — Whygrid",
      heading: "Payment received",
      paragraph: `Thank you! Plan <b>${planTitle}</b>, charged <b>${sum}</b>, subscription active until <b>${until}</b>.`,
      button: "Manage subscription →",
    },
  } as const;
  const t = T[locale];
  const content = { heading: t.heading, paragraphs: [t.paragraph], button: { label: t.button, url: accountUrl } };
  return { to, subject: t.subject, text: renderEmailText(content), html: renderEmailHtml(content) };
}

// Напоминание о скором конце периода. Если карта сохранена (autoRenew) — предупреждаем
// о списании; иначе — что подписка истечёт и нужно продлить вручную.
export function buildRenewalReminderEmail(
  to: string,
  planTitle: string,
  periodEnd: Date,
  autoRenew: boolean,
  locale: Locale,
): EmailMessage {
  const accountUrl = `${getAppBaseUrl()}/account`;
  const when = formatDate(periodEnd, locale);
  const T = {
    ru: {
      autoSubject: "Скоро продление подписки — Whygrid",
      autoHeading: "Скоро продление",
      autoParagraph: `${when} мы автоматически продлим тариф <b>${planTitle}</b> и спишем оплату с привязанной карты.`,
      autoButton: "Управлять подпиской →",
      autoNote: "Не хочешь продлевать — отмени автопродление в кабинете.",
      manualSubject: "Подписка скоро истекает — Whygrid",
      manualHeading: "Подписка истекает",
      manualParagraph: `${when} твоя подписка <b>${planTitle}</b> истекает.`,
      manualButton: "Продлить →",
    },
    en: {
      autoSubject: "Subscription renews soon — Whygrid",
      autoHeading: "Renewal coming up",
      autoParagraph: `On ${when} we'll automatically renew your <b>${planTitle}</b> plan and charge your saved card.`,
      autoButton: "Manage subscription →",
      autoNote: "Don't want to renew? Turn off auto-renewal in your account.",
      manualSubject: "Subscription expires soon — Whygrid",
      manualHeading: "Subscription expiring",
      manualParagraph: `On ${when} your <b>${planTitle}</b> subscription expires.`,
      manualButton: "Renew →",
    },
  } as const;
  const t = T[locale];
  if (autoRenew) {
    const content = {
      heading: t.autoHeading,
      paragraphs: [t.autoParagraph],
      button: { label: t.autoButton, url: accountUrl },
      note: t.autoNote,
    };
    return { to, subject: t.autoSubject, text: renderEmailText(content), html: renderEmailHtml(content) };
  }
  const content = {
    heading: t.manualHeading,
    paragraphs: [t.manualParagraph],
    button: { label: t.manualButton, url: accountUrl },
  };
  return { to, subject: t.manualSubject, text: renderEmailText(content), html: renderEmailHtml(content) };
}
