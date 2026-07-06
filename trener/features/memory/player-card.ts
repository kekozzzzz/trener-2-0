import type { PrismaClient } from "@prisma/client";
import type { PlayerCard, PlayerCardLeak } from "@/infrastructure/adapters/llm/types";
import { countLeaks, gameDayKey, leakDynamics, type LeakDynamics, type LeakKind } from "@/features/profile/leak-trend";
import { pruneCoachNotes, type StoredCoachNotes } from "@/features/memory/coach-notes";
import { LEAK_WINDOW_DAYS } from "@/config/leaks";

// «Карточка ученика» — что тренер ЗНАЕТ об игроке по всей его базе, для промптов всех
// ролей (разбор, диалог, вердикт, чат). Правило 1: всё детерминированно — сводная
// характеристика уже сформулирована шагом GENERATE_PLAYER_CHARACTERISTIC на числах
// парсера, системные лики считают те же чистые функции лик-трекера, что и страницы.
// План: plans/2026-07-06-память-тренера-об-игроке.md (фаза 1).
//
// Окно ликов — относительно ИГРОВОГО ДНЯ разбираемого турнира (как в лик-трекере):
// тренер говорит о повторяющихся ошибках «до этого турнира», а не заглядывает в будущее.

// Русские имена ликов для промпта: покерная проза промптов — русская (переводятся
// только языковые директивы, см. config/prompts/hand-analysis.ts).
const LEAK_LABELS: Record<LeakKind, string> = {
  OPEN_WIDE: "открытие первым заметно шире нормы",
  LIMP: "лимпы (вход в банк коллом вместо рейза или фолда)",
  BB_3BET_WIDE: "3-бет из BB заметно шире нормы",
  OPEN_SHOVE_WIDE: "опен-олл-ин на коротком стеке вне пуш-диапазона",
  VS_OPEN_3BET_WIDE: "3-бет против опена заметно шире нормы",
  ISO_WIDE: "изоляция лимпера заметно шире нормы",
  SQUEEZE_WIDE: "сквиз заметно шире нормы",
  FOURBET_WIDE: "4-бет после своего опена заметно шире нормы",
};

// В карточку идёт топ самых частых системных ликов — фон для тренера, не простыня.
const CARD_MAX_LEAKS = 4;

// Хватает на окно дней даже при плотной игре (~15 турниров за вечер) — та же защита
// от простыни, что в features/profile/queries.ts.
const CARD_SCAN_TOURNAMENTS = (LEAK_WINDOW_DAYS + 1) * 15;

// Кэш карточки в памяти воркера: сборка сканирует раздачи окна (тяжёлые JSONB), а
// роли зовут карточку на каждый раунд диалога. Воркер — один долгоживущий процесс
// (pm2), ключ playerId+день турнира, TTL — компромисс между свежестью (догрузка
// турниров прошлых дней меняет окно) и ценой скана.
const CARD_CACHE_TTL_MS = 15 * 60_000;
const CARD_CACHE_MAX = 500;
const cache = new Map<string, { at: number; card: PlayerCard | null }>();

// Чистая сборка списка ликов карточки из динамики лик-трекера (покрыта тестами).
export function buildCardLeaks(dynamics: LeakDynamics[], windowDays: number): PlayerCardLeak[] {
  return dynamics.slice(0, CARD_MAX_LEAKS).map((d) => ({
    label: LEAK_LABELS[d.kind],
    priorTotal: d.priorTotal,
    daysWithLeak: d.window.filter((n) => n > 0).length,
    windowDays,
    improvedLastDay: d.improved,
  }));
}

export async function getPlayerCard(db: PrismaClient, playerId: string, playedAt: Date): Promise<PlayerCard | null> {
  const day = gameDayKey(playedAt);
  const key = `${playerId}:${day}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CARD_CACHE_TTL_MS) return hit.card;

  const card = await buildPlayerCard(db, playerId, day);

  if (cache.size >= CARD_CACHE_MAX) cache.clear(); // простая защита от разрастания
  cache.set(key, { at: Date.now(), card });
  return card;
}

// Сброс кэша карточек игрока — зовёт шаг дневника после новой заметки, чтобы она
// попала в карточку следующего разбора сразу, а не после TTL.
export function invalidatePlayerCardCache(playerId: string): void {
  for (const key of cache.keys()) {
    if (key.startsWith(playerId + ":")) cache.delete(key);
  }
}

async function buildPlayerCard(db: PrismaClient, playerId: string, currentDay: string): Promise<PlayerCard | null> {
  const profile = await db.playerProfile.findUnique({
    where: { playerId },
    select: { characteristic: true, tournamentsCounted: true, coachNotes: true },
  });

  // Окно ликов — как в features/profile/queries.ts: учтённые турниры не позже
  // отчётного дня → группировка по игровым дням → активные лики прошлых дней.
  const tournaments = await db.tournament.findMany({
    where: { playerId, deletedAt: null, status: { in: ["PARSED", "CARD_READY"] } },
    orderBy: { playedAt: "desc" },
    take: CARD_SCAN_TOURNAMENTS,
    select: { id: true, playedAt: true },
  });

  const dayByTournament = new Map<string, string>();
  const daysDesc: string[] = [];
  for (const t of tournaments) {
    const d = gameDayKey(t.playedAt);
    dayByTournament.set(t.id, d);
    if (daysDesc[daysDesc.length - 1] !== d) daysDesc.push(d);
  }

  const priorDays = daysDesc.filter((d) => d < currentDay).slice(0, LEAK_WINDOW_DAYS).reverse();
  let leaks: PlayerCardLeak[] = [];

  if (priorDays.length > 0) {
    const windowDaySet = new Set([currentDay, ...priorDays]);
    const windowIds = tournaments
      .filter((t) => windowDaySet.has(dayByTournament.get(t.id)!))
      .map((t) => t.id);

    const hands = await db.hand.findMany({
      where: { tournamentId: { in: windowIds } },
      select: { tournamentId: true, tableData: true },
    });
    const byDay = new Map<string, { tableData: unknown }[]>();
    for (const hand of hands) {
      const handDay = dayByTournament.get(hand.tournamentId)!;
      const list = byDay.get(handDay);
      if (list) list.push(hand);
      else byDay.set(handDay, [hand]);
    }

    const priorCounts = priorDays.map((d) => countLeaks(byDay.get(d) ?? []));
    const currentCounts = countLeaks(byDay.get(currentDay) ?? []);
    leaks = buildCardLeaks(leakDynamics(priorCounts, currentCounts), priorDays.length);
  }

  // Заметки дневника тренера (фаза 2): протухшие (90 дней / 1000 турниров) отрезает
  // код; «сегодня» для возраста — день разбираемого турнира.
  const stored = (profile?.coachNotes ?? null) as StoredCoachNotes | null;
  const notes = pruneCoachNotes(stored?.notes ?? [], currentDay, profile?.tournamentsCounted ?? 0).map((n) => ({
    date: n.date,
    text: n.text,
  }));

  const characteristic = profile?.characteristic ?? null;
  if (!characteristic && leaks.length === 0 && notes.length === 0) return null; // тренеру нечего вспомнить

  return {
    characteristic,
    tournamentsCounted: profile?.tournamentsCounted ?? 0,
    leaks,
    notes,
  };
}
