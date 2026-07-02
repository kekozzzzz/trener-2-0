import type { PrismaClient } from "@prisma/client";
import { getPlan, getRenewalReminderLeadDays } from "@/config/plans";
import { buildRenewalReminderEmail } from "@/features/subscription/subscription-emails";
import { safeSendEmail } from "@/infrastructure/adapters/email";
import { defaultLocale, type Locale } from "@/i18n/config";

// Крон напоминаний: раз в день находит активные подписки, у которых оплаченный период
// заканчивается в ближайшие N дней (config), и шлёт письмо-напоминание. Вариант письма
// зависит от наличия сохранённой карты: есть — «скоро спишем», нет — «истечёт, продли».
//
// Дедуп: отметка renewalReminderSentAt. Шлём один раз за период; при продлении
// (applySucceededPayment) отметка сбрасывается, и для нового периода напоминание
// сработает заново. Отметку ставим даже без email (анонимизированный аккаунт) —
// чтобы такую подписку не перебирать каждый прогон.

const DAY_MS = 24 * 60 * 60 * 1000;

export type ReminderSweepResult = { sent: number };

export async function runSubscriptionReminders(db: PrismaClient): Promise<ReminderSweepResult> {
  const now = new Date();
  const windowEnd = new Date(now.getTime() + getRenewalReminderLeadDays() * DAY_MS);

  const due = await db.subscription.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      renewalReminderSentAt: null,
      // Период ещё не истёк (gt now — иначе это уже забота крона автопродления),
      // но закончится в окне напоминания.
      nextPaymentAt: { gt: now, lte: windowEnd },
    },
    select: {
      id: true,
      planCode: true,
      paymentMethodId: true,
      nextPaymentAt: true,
      player: { select: { email: true, locale: true } },
    },
  });

  let sent = 0;
  for (const s of due) {
    if (s.player.email && s.nextPaymentAt) {
      const planTitle = getPlan(s.planCode)?.title ?? s.planCode;
      // Язык письма — из профиля игрока (крон без HTTP-контекста, куки нет).
      const locale = (s.player.locale as Locale) ?? defaultLocale;
      await safeSendEmail(
        buildRenewalReminderEmail(s.player.email, planTitle, s.nextPaymentAt, s.paymentMethodId != null, locale),
      );
      sent++;
    }
    // Отметку ставим в любом случае (в т.ч. без email) — дедуп будущих прогонов.
    await db.subscription.update({ where: { id: s.id }, data: { renewalReminderSentAt: now } });
  }

  return { sent };
}
