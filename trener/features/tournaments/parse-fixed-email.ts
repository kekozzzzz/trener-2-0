// Письмо тем, кто раньше упёрся в ошибку разбора (незнакомый рум / сбой парсинга),
// после того как причину починили. Разовая ручная рассылка по сигнатуре
// (scripts/notify-parse-fixed.ts) — не крон, запускается вручную после деплоя фикса.
import { getAppBaseUrl } from "@/config/app";
import { type Locale } from "@/i18n/config";
import { prisma } from "@/infrastructure/db/client";
import type { EmailMessage } from "@/infrastructure/adapters/email";
import { renderEmailHtml, renderEmailText } from "@/features/email/layout";

export type ParseFixedRecipient = { email: string; locale: Locale };

// Кому писать «починили»: distinct игроки, чьи файлы падали с этой сигнатурой —
// один игрок с несколькими файлами той же сигнатуры получит письмо ровно раз.
// У закрытых/анонимизированных аккаунтов email уже стёрт (NULL) — им не пишем.
export async function findRecipientsForSignature(signature: string): Promise<ParseFixedRecipient[]> {
  const uploads = await prisma.unrecognizedUpload.findMany({
    where: { signature },
    select: { playerId: true },
  });
  const playerIds = [...new Set(uploads.map((u) => u.playerId).filter((id): id is string => id !== null))];
  if (playerIds.length === 0) return [];

  const players = await prisma.player.findMany({
    where: { id: { in: playerIds }, email: { not: null } },
    select: { email: true, locale: true },
  });
  return players.map((p) => ({ email: p.email!, locale: p.locale as Locale }));
}

// support@whygrid.app, не reply — отправитель писем no-reply@whygrid.app сам не
// читается (config/legal.ts), поэтому зовём в поддержку, а не «ответь на письмо».
export function buildParseFixedEmail(to: string, locale: Locale): EmailMessage {
  const url = `${getAppBaseUrl()}/analyze`;
  const T = {
    ru: {
      subject: "Починили — можно грузить снова",
      heading: "Починили — можно грузить снова",
      paragraph: "Ты недавно присылал(а) файл истории раздач, с которым мы тогда не справились. Уже починили - загрузи его ещё раз, должно сработать.",
      button: "Загрузить турнир →",
      note: 'Если снова не выйдет - напиши нам на <a href="mailto:support@whygrid.app" style="color:#0E0E0E;">support@whygrid.app</a>.',
    },
    en: {
      subject: "Fixed — you can upload again",
      heading: "Fixed — you can upload again",
      paragraph: "You recently sent a hand history file we couldn't handle back then. It's fixed now - upload it again, it should work.",
      button: "Upload a tournament →",
      note: 'If it still doesn\'t work, email us at <a href="mailto:support@whygrid.app" style="color:#0E0E0E;">support@whygrid.app</a>.',
    },
  } as const;
  const t = T[locale];
  const content = {
    heading: t.heading,
    paragraphs: [t.paragraph],
    button: { label: t.button, url },
    note: t.note,
  };
  return { to, subject: t.subject, text: renderEmailText(content), html: renderEmailHtml(content) };
}
