// Транзакционные письма подписки (успешная оплата, напоминание о скором списании/
// истечении). Чистые конструкторы EmailMessage без БД — отправка через safeSendEmail
// в местах вызова. Названия тарифов и суммы берутся из config/plans (правило №3:
// бизнес-конфиг не дублируем в текстах). Язык (locale) приходит параметром: письма
// шлются из крона/вебхука без HTTP-контекста, поэтому перевод — простым словарём
// внутри модуля, а не через next-intl.
import { getAppBaseUrl } from "@/config/app";
import { formatRubles } from "@/config/plans";
import { type Locale } from "@/i18n/config";
import type { EmailMessage } from "@/infrastructure/adapters/email";

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
      text:
        `Оплата прошла успешно. Спасибо!\n\n` +
        `Тариф: ${planTitle}\n` +
        `Списано: ${sum}\n` +
        `Подписка активна до: ${until}\n\n` +
        `Управлять подпиской: ${accountUrl}`,
      html:
        `<p>Оплата прошла успешно. Спасибо!</p>` +
        `<p>Тариф: <b>${planTitle}</b><br>` +
        `Списано: <b>${sum}</b><br>` +
        `Подписка активна до: <b>${until}</b></p>` +
        `<p><a href="${accountUrl}">Управлять подпиской</a></p>`,
    },
    en: {
      subject: "Payment received — Whygrid",
      text:
        `Your payment went through. Thank you!\n\n` +
        `Plan: ${planTitle}\n` +
        `Charged: ${sum}\n` +
        `Subscription active until: ${until}\n\n` +
        `Manage your subscription: ${accountUrl}`,
      html:
        `<p>Your payment went through. Thank you!</p>` +
        `<p>Plan: <b>${planTitle}</b><br>` +
        `Charged: <b>${sum}</b><br>` +
        `Subscription active until: <b>${until}</b></p>` +
        `<p><a href="${accountUrl}">Manage your subscription</a></p>`,
    },
  } as const;
  const t = T[locale];
  return { to, subject: t.subject, text: t.text, html: t.html };
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
      autoText:
        `Напоминаем: ${when} мы автоматически продлим твою подписку «${planTitle}» ` +
        `и спишем оплату с привязанной карты.\n\n` +
        `Если продлевать не нужно — отмени автопродление в кабинете: ${accountUrl}`,
      autoHtml:
        `<p>Напоминаем: <b>${when}</b> мы автоматически продлим твою подписку ` +
        `«${planTitle}» и спишем оплату с привязанной карты.</p>` +
        `<p>Если продлевать не нужно — <a href="${accountUrl}">отмени автопродление в кабинете</a>.</p>`,
      manualSubject: "Подписка скоро истекает — Whygrid",
      manualText:
        `Напоминаем: ${when} твоя подписка «${planTitle}» истекает.\n\n` +
        `Чтобы не потерять доступ к разборам — продли её в кабинете: ${accountUrl}`,
      manualHtml:
        `<p>Напоминаем: <b>${when}</b> твоя подписка «${planTitle}» истекает.</p>` +
        `<p>Чтобы не потерять доступ к разборам — <a href="${accountUrl}">продли её в кабинете</a>.</p>`,
    },
    en: {
      autoSubject: "Subscription renews soon — Whygrid",
      autoText:
        `A heads-up: on ${when} we'll automatically renew your "${planTitle}" subscription ` +
        `and charge your saved card.\n\n` +
        `If you'd rather not renew, turn off auto-renewal in your account: ${accountUrl}`,
      autoHtml:
        `<p>A heads-up: on <b>${when}</b> we'll automatically renew your ` +
        `"${planTitle}" subscription and charge your saved card.</p>` +
        `<p>If you'd rather not renew, <a href="${accountUrl}">turn off auto-renewal in your account</a>.</p>`,
      manualSubject: "Subscription expires soon — Whygrid",
      manualText:
        `A heads-up: your "${planTitle}" subscription expires on ${when}.\n\n` +
        `To keep access to your reviews, renew it in your account: ${accountUrl}`,
      manualHtml:
        `<p>A heads-up: your "${planTitle}" subscription expires on <b>${when}</b>.</p>` +
        `<p>To keep access to your reviews, <a href="${accountUrl}">renew it in your account</a>.</p>`,
    },
  } as const;
  const t = T[locale];
  if (autoRenew) {
    return { to, subject: t.autoSubject, text: t.autoText, html: t.autoHtml };
  }
  return { to, subject: t.manualSubject, text: t.manualText, html: t.manualHtml };
}
