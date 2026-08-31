// Письмо «второй турнир тоже бесплатно» — игроку, который дошёл ровно до бесплатного
// лимита (getFreeTournamentLimit(), сейчас 1) и с тех пор не возвращался. Бонус сам
// разблокируется в assessAiAccess (features/usage/budget.ts) по тому же порогу тишины —
// письмо лишь сообщает о том, что уже стало правдой, ничего отдельно не «выдаёт».
//
// Шлётся из infrastructure/jobs/lifecycle-emails.ts (крон), не вручную.
import type { PrismaClient } from "@prisma/client";
import { getAppBaseUrl } from "@/config/app";
import { getFreeTournamentLimit } from "@/config/plans";
import { getWinBackGraceDays } from "@/config/lifecycle-emails";
import { type Locale } from "@/i18n/config";
import type { EmailMessage } from "@/infrastructure/adapters/email";
import { renderEmailHtml, renderEmailText } from "@/features/email/layout";

const DAY_MS = 24 * 60 * 60 * 1000;

export type WinBackCandidate = { playerId: string; email: string; locale: Locale };

// Кандидаты: ровно getFreeTournamentLimit() турниров всего, последний создан ВНУТРИ
// узкого окна вокруг порога тишины (не «порог и старше» — иначе первый запуск нашёл бы
// весь исторический хвост неактивных аккаунтов и разослал бы всем разом, поймано
// Артёмом 2026-08-31), без активной подписки, письмо ещё не отправлено.
export async function findWinBackCandidates(db: PrismaClient, now: Date = new Date()): Promise<WinBackCandidate[]> {
  const freeLimit = getFreeTournamentLimit();
  const graceDays = getWinBackGraceDays();
  const windowStart = new Date(now.getTime() - (graceDays + 1) * DAY_MS);
  const windowEnd = new Date(now.getTime() - graceDays * DAY_MS);

  const players = await db.player.findMany({
    where: {
      winBackEmailSentAt: null,
      email: { not: null },
      closedAt: null,
      tournaments: { some: { deletedAt: null } },
    },
    select: {
      id: true,
      email: true,
      locale: true,
      subscription: { select: { status: true, deletedAt: true, nextPaymentAt: true } },
      tournaments: { where: { deletedAt: null }, orderBy: { createdAt: "asc" }, select: { createdAt: true } },
    },
  });

  const result: WinBackCandidate[] = [];
  for (const p of players) {
    if (p.tournaments.length !== freeLimit) continue;
    const last = p.tournaments[p.tournaments.length - 1];
    if (last.createdAt < windowStart || last.createdAt > windowEnd) continue;

    const sub = p.subscription;
    const active =
      sub != null && sub.status === "ACTIVE" && sub.deletedAt === null && (sub.nextPaymentAt == null || sub.nextPaymentAt > now);
    if (active) continue;

    result.push({ playerId: p.id, email: p.email!, locale: p.locale as Locale });
  }
  return result;
}

export function buildWinBackEmail(to: string, locale: Locale): EmailMessage {
  const analyzeUrl = `${getAppBaseUrl()}/analyze`;
  const changelogUrl = `${getAppBaseUrl()}/changelog`;
  const T = {
    ru: {
      subject: "Мы оставили тебе ещё один бесплатный разбор",
      heading: "Второй турнир — тоже бесплатно",
      paragraph1: "Ты загрузил один турнир и не возвращался. Можешь попробовать ещё один — тоже бесплатно.",
      paragraph2: `С тех пор в тренере многое изменилось — глянь, что именно: <a href="${changelogUrl}" style="color:#0E0E0E;">whygrid.app/changelog</a>`,
      button: "Загрузить турнир →",
      note: "Предложение не сгорает - сработает, когда бы ты ни вернулся.",
      footerNote: "Это письмо приходит один раз.",
    },
    en: {
      subject: "We saved you one more free review",
      heading: "Your second tournament is free too",
      paragraph1: "You uploaded one tournament and never came back. You can try one more - also free.",
      paragraph2: `A lot has changed in the coach since then - see what's new: <a href="${changelogUrl}" style="color:#0E0E0E;">whygrid.app/changelog</a>`,
      button: "Upload a tournament →",
      note: "This offer doesn't expire - it'll work whenever you come back.",
      footerNote: "This email is sent once.",
    },
  } as const;
  const t = T[locale];
  const content = {
    heading: t.heading,
    paragraphs: [t.paragraph1, t.paragraph2],
    button: { label: t.button, url: analyzeUrl },
    note: t.note,
    footerNote: t.footerNote,
  };
  return { to, subject: t.subject, text: renderEmailText(content), html: renderEmailHtml(content) };
}
