import type { PrismaClient } from "@prisma/client";
import { findWinBackCandidates, buildWinBackEmail } from "@/features/tournaments/win-back-email";
import { findEngagementNudgeCandidates, buildEngagementNudgeEmail } from "@/features/tournaments/engagement-nudge-email";
import {
  findInactiveSubscriberCandidates,
  buildInactiveSubscriberEmail,
} from "@/features/subscription/inactive-subscriber-email";
import { safeSendEmail } from "@/infrastructure/adapters/email";

// Крон трёх lifecycle-писем (план 2026-08-31-письма-редизайн-и-возврат-игрока):
// «второй турнир бесплатно» тем, кто дошёл до лимита и пропал; «разбор ждёт» тем, кто
// загрузил турнир и не открыл ни одной раздачи; «подписка тратится впустую» платящим
// подписчикам без активности. Все три находят кандидатов только в узком окне вокруг
// своего порога — без ретроактивного залпа по всей истории (см. комментарии в
// win-back-email.ts / engagement-nudge-email.ts / inactive-subscriber-email.ts). Дедуп —
// отметка *_sent_at, ставится даже если email в моменте не ушёл (сбой доставки не должен
// зациклить крон на одном игроке).

export type LifecycleEmailsResult = { winBackSent: number; nudgesSent: number; inactivitySent: number };

export async function runLifecycleEmails(db: PrismaClient, now: Date = new Date()): Promise<LifecycleEmailsResult> {
  let winBackSent = 0;
  const winBackCandidates = await findWinBackCandidates(db, now);
  for (const c of winBackCandidates) {
    await safeSendEmail(buildWinBackEmail(c.email, c.locale));
    await db.player.update({ where: { id: c.playerId }, data: { winBackEmailSentAt: now } });
    winBackSent++;
  }

  let nudgesSent = 0;
  const nudgeCandidates = await findEngagementNudgeCandidates(db, now);
  for (const c of nudgeCandidates) {
    await safeSendEmail(buildEngagementNudgeEmail(c.email, c.tournamentId, c.locale));
    await db.tournament.update({ where: { id: c.tournamentId }, data: { engagementNudgeSentAt: now } });
    nudgesSent++;
  }

  let inactivitySent = 0;
  const inactiveCandidates = await findInactiveSubscriberCandidates(db, now);
  for (const c of inactiveCandidates) {
    await safeSendEmail(buildInactiveSubscriberEmail(c.email, c.locale));
    await db.subscription.update({ where: { id: c.subscriptionId }, data: { inactivityReminderSentAt: now } });
    inactivitySent++;
  }

  return { winBackSent, nudgesSent, inactivitySent };
}
