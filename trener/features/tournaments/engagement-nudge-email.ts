// Письмо «разбор ждёт» — игроку, который загрузил турнир (разбор открыт), но не
// открыл НИ ОДНОЙ раздачи. Сигнал — Hand.viewedAt: ставится, когда игрок открывает
// конкретную раздачу (app/tournament/[id]/hands/[handId]/actions.ts). Если пусто у
// всех отобранных для карточки раздач — считаем, что человек вообще не заглядывал.
//
// Шлётся из infrastructure/jobs/lifecycle-emails.ts (крон), не вручную.
import type { PrismaClient } from "@prisma/client";
import { getAppBaseUrl } from "@/config/app";
import { getEngagementNudgeHours } from "@/config/lifecycle-emails";
import { type Locale } from "@/i18n/config";
import type { EmailMessage } from "@/infrastructure/adapters/email";
import { renderEmailHtml, renderEmailText } from "@/features/email/layout";

const HOUR_MS = 60 * 60 * 1000;

export type EngagementNudgeCandidate = { tournamentId: string; email: string; locale: Locale };

// Кандидаты: турнир создан ВНУТРИ узкого окна вокруг порога (не «порог и старше» —
// та же причина, что у win-back: без окна первый запуск нашёл бы весь исторический
// хвост непросмотренных турниров и разослал бы всем разом). Разбор открыт, есть хотя бы
// одна отобранная для карточки раздача, ни одна не просмотрена, письмо ещё не отправлено.
export async function findEngagementNudgeCandidates(
  db: PrismaClient,
  now: Date = new Date(),
): Promise<EngagementNudgeCandidate[]> {
  const thresholdHours = getEngagementNudgeHours();
  const windowStart = new Date(now.getTime() - (thresholdHours + 24) * HOUR_MS);
  const windowEnd = new Date(now.getTime() - thresholdHours * HOUR_MS);

  const tournaments = await db.tournament.findMany({
    where: {
      deletedAt: null,
      analysisUnlocked: true,
      engagementNudgeSentAt: null,
      createdAt: { gte: windowStart, lte: windowEnd },
    },
    select: {
      id: true,
      hands: { where: { selectedForCard: true }, select: { viewedAt: true } },
      player: { select: { email: true, locale: true } },
    },
  });

  const result: EngagementNudgeCandidate[] = [];
  for (const t of tournaments) {
    if (t.hands.length === 0) continue; // нечего смотреть — разбор пуст
    if (t.hands.some((h) => h.viewedAt !== null)) continue; // хоть одну уже открыл
    if (!t.player.email) continue;
    result.push({ tournamentId: t.id, email: t.player.email, locale: t.player.locale as Locale });
  }
  return result;
}

export function buildEngagementNudgeEmail(to: string, tournamentId: string, locale: Locale): EmailMessage {
  const tournamentUrl = `${getAppBaseUrl()}/tournament/${tournamentId}`;
  const T = {
    ru: {
      subject: "Разбор твоего турнира уже готов",
      heading: "Не забыл?",
      paragraph: "Ты загрузил турнир, но пока не открыл ни одной раздачи. Разбор уже готов - загляни, это пара минут.",
      button: "Посмотреть разбор →",
    },
    en: {
      subject: "Your tournament review is ready",
      heading: "Still there?",
      paragraph: "You uploaded a tournament but haven't opened a single hand yet. The review is ready - take a look, it's a couple of minutes.",
      button: "View the review →",
    },
  } as const;
  const t = T[locale];
  const content = { heading: t.heading, paragraphs: [t.paragraph], button: { label: t.button, url: tournamentUrl } };
  return { to, subject: t.subject, text: renderEmailText(content), html: renderEmailHtml(content) };
}
