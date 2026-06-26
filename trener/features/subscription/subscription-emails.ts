// Транзакционные письма подписки (успешная оплата, напоминание о скором списании/
// истечении). Чистые конструкторы EmailMessage без БД — отправка через safeSendEmail
// в местах вызова. Названия тарифов и суммы берутся из config/plans (правило №3:
// бизнес-конфиг не дублируем в текстах).
import { getAppBaseUrl } from "@/config/app";
import { formatRubles } from "@/config/plans";
import type { EmailMessage } from "@/infrastructure/adapters/email";

// Дата по-русски: «26 июня 2026».
function formatRuDate(date: Date): string {
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

// «Оплата прошла». Работает и для первой оплаты, и для автопродления — это квитанция:
// что оплачено и до какого числа подписка активна. amountKopecks — фактически списанная
// сумма в копейках рубля (как в журнале платежей).
export function buildPaymentSuccessEmail(
  to: string,
  planTitle: string,
  activeUntil: Date,
  amountKopecks: number,
): EmailMessage {
  const accountUrl = `${getAppBaseUrl()}/account`;
  const until = formatRuDate(activeUntil);
  const sum = formatRubles(amountKopecks);
  return {
    to,
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
  };
}

// Напоминание о скором конце периода. Если карта сохранена (autoRenew) — предупреждаем
// о списании; иначе — что подписка истечёт и нужно продлить вручную.
export function buildRenewalReminderEmail(
  to: string,
  planTitle: string,
  periodEnd: Date,
  autoRenew: boolean,
): EmailMessage {
  const accountUrl = `${getAppBaseUrl()}/account`;
  const when = formatRuDate(periodEnd);
  if (autoRenew) {
    return {
      to,
      subject: "Скоро продление подписки — Whygrid",
      text:
        `Напоминаем: ${when} мы автоматически продлим твою подписку «${planTitle}» ` +
        `и спишем оплату с привязанной карты.\n\n` +
        `Если продлевать не нужно — отмени автопродление в кабинете: ${accountUrl}`,
      html:
        `<p>Напоминаем: <b>${when}</b> мы автоматически продлим твою подписку ` +
        `«${planTitle}» и спишем оплату с привязанной карты.</p>` +
        `<p>Если продлевать не нужно — <a href="${accountUrl}">отмени автопродление в кабинете</a>.</p>`,
    };
  }
  return {
    to,
    subject: "Подписка скоро истекает — Whygrid",
    text:
      `Напоминаем: ${when} твоя подписка «${planTitle}» истекает.\n\n` +
      `Чтобы не потерять доступ к разборам — продли её в кабинете: ${accountUrl}`,
    html:
      `<p>Напоминаем: <b>${when}</b> твоя подписка «${planTitle}» истекает.</p>` +
      `<p>Чтобы не потерять доступ к разборам — <a href="${accountUrl}">продли её в кабинете</a>.</p>`,
  };
}
