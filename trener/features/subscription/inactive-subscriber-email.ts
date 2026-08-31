// Письмо «подписка тратится впустую» — платящему подписчику, который давно не грузил
// новых турниров (один раз что-то сделал и пропал, деньги продолжают списываться).
// Раз за оплаченный период: дедуп-метка сбрасывается при продлении
// (features/subscription/apply-payment.ts), как renewalReminderSentAt.
//
// Шлётся из infrastructure/jobs/lifecycle-emails.ts (крон), не вручную.
import type { PrismaClient } from "@prisma/client";
import { getAppBaseUrl } from "@/config/app";
import { getInactiveSubscriberDays } from "@/config/lifecycle-emails";
import { type Locale } from "@/i18n/config";
import type { EmailMessage } from "@/infrastructure/adapters/email";
import { renderEmailHtml, renderEmailText } from "@/features/email/layout";

const DAY_MS = 24 * 60 * 60 * 1000;

export type InactiveSubscriberCandidate = { subscriptionId: string; email: string; locale: Locale };

// Кандидаты: подписка ACTIVE, оплаченный период ещё не истёк, последняя активность
// (последний турнир, а если ни одного не грузил — начало периода) попала ВНУТРЬ узкого
// окна вокруг порога — та же защита от ретроактивного залпа, что у win-back/nudge.
export async function findInactiveSubscriberCandidates(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<InactiveSubscriberCandidate[]> {
  const thresholdDays = getInactiveSubscriberDays();
  const windowStart = new Date(now.getTime() - (thresholdDays + 1) * DAY_MS);
  const windowEnd = new Date(now.getTime() - thresholdDays * DAY_MS);

  const subs = await db.subscription.findMany({
    where: {
      status: "ACTIVE",
      deletedAt: null,
      inactivityReminderSentAt: null,
      OR: [{ nextPaymentAt: null }, { nextPaymentAt: { gt: now } }],
    },
    select: {
      id: true,
      currentPeriodStart: true,
      player: {
        select: {
          email: true,
          locale: true,
          tournaments: {
            where: { deletedAt: null },
            orderBy: { createdAt: "desc" },
            take: 1,
            select: { createdAt: true },
          },
        },
      },
    },
  });

  const result: InactiveSubscriberCandidate[] = [];
  for (const sub of subs) {
    if (!sub.player.email) continue;
    const lastActivity = sub.player.tournaments[0]?.createdAt ?? sub.currentPeriodStart;
    if (lastActivity < windowStart || lastActivity > windowEnd) continue;
    result.push({ subscriptionId: sub.id, email: sub.player.email, locale: sub.player.locale as Locale });
  }
  return result;
}

export function buildInactiveSubscriberEmail(to: string, locale: Locale): EmailMessage {
  const analyzeUrl = `${getAppBaseUrl()}/tournaments`;
  const T = {
    ru: {
      subject: "Подписка тратится впустую",
      heading: "Подписка тратится впустую",
      paragraph: "Ты не заходил уже неделю, а подписка Whygrid продолжает действовать. Успей воспользоваться, пока оплаченное время не сгорело зря.",
      button: "Перейти к разборам →",
    },
    en: {
      subject: "Your subscription is going to waste",
      heading: "Your subscription is going to waste",
      paragraph: "It's been a week since you last logged in, and your Whygrid subscription is still active. Make use of it before the paid time is gone.",
      button: "Go to your reviews →",
    },
  } as const;
  const t = T[locale];
  const content = { heading: t.heading, paragraphs: [t.paragraph], button: { label: t.button, url: analyzeUrl } };
  return { to, subject: t.subject, text: renderEmailText(content), html: renderEmailHtml(content) };
}
