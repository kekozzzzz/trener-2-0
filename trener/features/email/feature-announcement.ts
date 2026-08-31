// Разовый ручной бродкаст «у нас вышло что-то классное» — не крон, не автоматика.
// Артём/Клод решает, когда фича достаточно крупная, чтобы написать всем разом
// (запрос 2026-08-31: «глобальная классная фича... единоразовая ссылочку скинуть»).
// Содержание меняется от рассылки к рассылке — правится в scripts/notify-feature-launch.ts
// перед каждым запуском, здесь только конструктор письма + подбор адресатов.
import type { PrismaClient } from "@prisma/client";
import { type Locale } from "@/i18n/config";
import type { EmailMessage } from "@/infrastructure/adapters/email";
import { renderEmailHtml, renderEmailText } from "@/features/email/layout";

export type FeatureAnnouncementCopy = {
  subject: string;
  heading: string;
  paragraph: string;
  buttonLabel: string;
  buttonUrl: string;
};

export type FeatureAnnouncementContent = { ru: FeatureAnnouncementCopy; en: FeatureAnnouncementCopy };

export type BroadcastRecipient = { email: string; locale: Locale };

// Все живые аккаунты с email — закрытые/анонимизированные (email NULL) исключены сами
// собой условием email: { not: null }. Без опроса «отписаться» (объём и частота рассылок
// сейчас не требуют этой инфраструктуры) — если рассылки станут частыми, добавить отдельно.
export async function findBroadcastRecipients(db: PrismaClient): Promise<BroadcastRecipient[]> {
  const players = await db.player.findMany({
    where: { email: { not: null } },
    select: { email: true, locale: true },
  });
  return players.map((p) => ({ email: p.email!, locale: p.locale as Locale }));
}

export function buildFeatureAnnouncementEmail(
  to: string,
  content: FeatureAnnouncementContent,
  locale: Locale,
): EmailMessage {
  const t = content[locale];
  const body = { heading: t.heading, paragraphs: [t.paragraph], button: { label: t.buttonLabel, url: t.buttonUrl } };
  return { to, subject: t.subject, text: renderEmailText(body), html: renderEmailHtml(body) };
}
