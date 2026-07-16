import type { TournamentStatus, PlayerStyle } from "@prisma/client";
import { prisma } from "@/infrastructure/db/client";

// Строка списка «Мои турниры» / дашборда. Decimal приводим к number здесь,
// чтобы вид для экрана был чистым (как в features/dialogue/queries.ts).
export type TournamentListItem = {
  id: string;
  name: string | null;
  room: string | null;
  playedAt: Date;
  status: TournamentStatus;
  vpipPercent: number | null;
  handsCount: number | null;
  resultBuyins: number | null;
  styleDiagnosis: PlayerStyle | null;
  entryNumber: number; // 1 — первый вход, 2+ — перезаход (re-entry)
  fullyReviewed: boolean;  // турнир пройден целиком: разбор открыт, готов, и каждая карточная раздача завершена/просмотрена
  // Разбор начат, но не закончен: игрок открыл хоть одну карточную раздачу, а до
  // «Пройден» ещё не дошёл. done/total — по тому же критерию, что fullyReviewed
  // (диалоги до вердикта; без диалогов — просмотр простых), чтобы бейдж «В разборе
  // 3/5» на 5/5 превращался ровно в «Пройден». null — не начат или уже пройден.
  reviewProgress: { done: number; total: number } | null;
};

// Турниры игрока: только свои (по playerId из сессии — защита от IDOR),
// без удалённых (deletedAt IS NULL, запрет 5), по дате игры свежие сверху
// (architecture/03-база-данных.md, индекс idx_tournaments_player_timeline).
// Вторичный ключ — дата загрузки (createdAt desc): при одинаковой дате игры
// порядок стабилен, а позже добавленный турнир оказывается выше.
async function queryTournaments(
  playerId: string,
  window?: { take?: number; skip?: number },
): Promise<TournamentListItem[]> {
  const rows = await prisma.tournament.findMany({
    where: { playerId, deletedAt: null },
    orderBy: [{ playedAt: "desc" }, { createdAt: "desc" }],
    ...(window?.take != null ? { take: window.take } : {}),
    ...(window?.skip ? { skip: window.skip } : {}),
    select: {
      id: true,
      name: true,
      room: true,
      playedAt: true,
      status: true,
      analysisUnlocked: true,
      vpipPercent: true,
      handsCount: true,
      resultBuyins: true,
      styleDiagnosis: true,
      entryNumber: true,
    },
  });

  // «Пройден» — тот же критерий, что «Сессия разобрана» на странице турнира: все
  // СОКРАТОВСКИЕ диалоги дошли до вердикта; хвост сильных/средних раздач финишу не
  // мешает (правка Артёма 2026-07-04 — раньше требовали открыть каждую карточную).
  // У турнира без диалоговых раздач — по просмотру простых карточных (viewedAt).
  // Одним запросом на весь список (без N+1).
  const cardHands = await prisma.hand.findMany({
    where: { tournamentId: { in: rows.map((t) => t.id) }, selectedForCard: true },
    select: { tournamentId: true, viewedAt: true, dialogue: { select: { state: true } } },
  });
  const handsByTournament = new Map<
    string,
    { dlgDone: number; dlgTotal: number; simpleDone: number; simpleTotal: number; anyViewed: boolean }
  >();
  for (const h of cardHands) {
    const agg =
      handsByTournament.get(h.tournamentId) ??
      { dlgDone: 0, dlgTotal: 0, simpleDone: 0, simpleTotal: 0, anyViewed: false };
    if (h.dialogue) {
      agg.dlgTotal += 1;
      if (h.dialogue.state === "VERDICT_SHOWN") agg.dlgDone += 1;
    } else {
      agg.simpleTotal += 1;
      if (h.viewedAt !== null) agg.simpleDone += 1;
    }
    // «Начал разбирать» — открыл страницу хоть одной карточной раздачи (viewedAt
    // ставится фоном при каждом открытии, и у диалоговых тоже — mark-viewed.tsx).
    if (h.viewedAt !== null) agg.anyViewed = true;
    handsByTournament.set(h.tournamentId, agg);
  }

  return rows.map((t) => {
    const agg = handsByTournament.get(t.id);
    const sessionDone =
      agg != null &&
      (agg.dlgTotal > 0
        ? agg.dlgDone === agg.dlgTotal
        : agg.simpleTotal > 0 && agg.simpleDone === agg.simpleTotal);
    const fullyReviewed = t.status === "CARD_READY" && t.analysisUnlocked && sessionDone;
    // Прогресс — по той же шкале, что sessionDone: пока есть диалоговые раздачи,
    // считаем вердикты; у турнира без диалогов — просмотр простых карточных.
    const progress =
      agg == null
        ? null
        : agg.dlgTotal > 0
          ? { done: agg.dlgDone, total: agg.dlgTotal }
          : { done: agg.simpleDone, total: agg.simpleTotal };
    const reviewStarted =
      t.status === "CARD_READY" && t.analysisUnlocked && agg != null && agg.anyViewed;
    return {
      id: t.id,
      name: t.name,
      room: t.room,
      playedAt: t.playedAt,
      status: t.status,
      vpipPercent: t.vpipPercent != null ? Number(t.vpipPercent) : null,
      handsCount: t.handsCount,
      resultBuyins: t.resultBuyins != null ? Number(t.resultBuyins) : null,
      styleDiagnosis: t.styleDiagnosis,
      entryNumber: t.entryNumber,
      fullyReviewed,
      reviewProgress: reviewStarted && !fullyReviewed && progress != null && progress.total > 0 ? progress : null,
    };
  });
}

// Все турниры игрока — целиком, без окна.
export function listMyTournaments(playerId: string): Promise<TournamentListItem[]> {
  return queryTournaments(playerId);
}

// Последние N турниров — для секции на дашборде (главная для залогиненного).
export function recentTournaments(playerId: string, limit = 5): Promise<TournamentListItem[]> {
  return queryTournaments(playerId, { take: limit });
}

export type TournamentsPage = {
  items: TournamentListItem[];
  total: number; // всего турниров у игрока (не на странице) — для «1–25 из 137»
  page: number; // фактическая страница: если запросили за пределами — последняя
  perPage: number;
  totalPages: number; // минимум 1, чтобы пустой список не давал «страница 1 из 0»
};

// Одна страница списка «Мои турниры». Страница за пределами диапазона (удалил
// турниры, а ссылка на ?page=9 осталась) не отдаёт пустоту — прижимается к
// последней существующей. Считаем total отдельным count: без него не сказать,
// сколько всего страниц, а тянуть всю таблицу ради этого — то, от чего уходим.
export async function listMyTournamentsPage(
  playerId: string,
  opts: { page: number; perPage: number },
): Promise<TournamentsPage> {
  const perPage = opts.perPage;
  const total = await prisma.tournament.count({ where: { playerId, deletedAt: null } });
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(Math.max(1, opts.page), totalPages);
  const items = await queryTournaments(playerId, { take: perPage, skip: (page - 1) * perPage });
  return { items, total, page, perPage, totalPages };
}
