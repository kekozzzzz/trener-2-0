import { prisma } from "@/infrastructure/db/client";
import { aggregateOpenChart, type OpenChartFacts } from "./open-chart";
import { countLeaks, gameDayKey, leakDynamics, type LeakDynamics, type LeakKind } from "./leak-trend";
import { sessionGoal, goalResult, type SessionGoalResult } from "./session-goal";
import { LEAK_WINDOW_DAYS } from "@/config/leaks";

// Сводная характеристика игрока для показа в личном кабинете. Только свой профиль
// (по playerId из сессии — защита от IDOR). null, пока текст ещё не собран.
export type PlayerCharacteristicView = {
  characteristic: string;
  tournamentsCounted: number;
};

export async function getPlayerCharacteristic(playerId: string): Promise<PlayerCharacteristicView | null> {
  const profile = await prisma.playerProfile.findUnique({
    where: { playerId },
    select: { characteristic: true, tournamentsCounted: true },
  });
  if (!profile?.characteristic) return null;
  return { characteristic: profile.characteristic, tournamentsCounted: profile.tournamentsCounted };
}

// Карта открываний игрока для кнопки «Твои чарты». Считается на лету по всем
// раздачам всех учтённых турниров (детерминированно, без LLM, Правило 1). null —
// если учитывать нечего. Только свой playerId — защита от IDOR.
export type OpenChartView = {
  chart: OpenChartFacts;
  tournamentsCounted: number;
};

// Динамика ликов: активные системные ошибки по окну прошлых ИГРОВЫХ ДНЕЙ против
// текущего дня. День = все турниры одной даты по playedAt (за вечер играется несколько
// турниров, сравнивать их друг с другом — шум; решение Артёма 2026-07-02). Всё
// детерминированно (Правило 1, лик-трекер — plans/2026-07-02-лик-трекер.md).
// null — сравнивать не с чем или турнир не этого игрока (IDOR).
export type LeakDynamicsView = {
  trends: LeakDynamics[];
  priorCount: number; // сколько прошлых игровых дней в окне
};

// Хватает на окно дней даже при плотной игре (~15 турниров за вечер); не константа
// бизнеса, а защита запроса от простыни — потому живёт в коде, не в config/leaks.
const LEAK_SCAN_TOURNAMENTS = (LEAK_WINDOW_DAYS + 1) * 15;

// Общий хвост обоих запросов динамики: учтённые турниры игрока не позже отчётного дня
// → группировка по игровым дням → счётчики дней → активные лики против текущего дня.
// currentDay — день, «на фоне» которого смотрим (null = самый свежий день игрока).
async function buildLeakDynamicsByDay(
  playerId: string,
  currentDay: string | null,
): Promise<LeakDynamicsView | null> {
  const tournaments = await prisma.tournament.findMany({
    where: { playerId, deletedAt: null, status: { in: ["PARSED", "CARD_READY"] } },
    orderBy: { playedAt: "desc" },
    take: LEAK_SCAN_TOURNAMENTS,
    select: { id: true, playedAt: true },
  });

  // Турнир → день; дни в хронологии (старые → новые), текущий и прошлые окна.
  const dayByTournament = new Map<string, string>();
  const daysDesc: string[] = [];
  for (const t of tournaments) {
    const day = gameDayKey(t.playedAt);
    dayByTournament.set(t.id, day);
    if (daysDesc[daysDesc.length - 1] !== day) daysDesc.push(day);
  }

  const day = currentDay ?? daysDesc[0];
  if (!day) return null;
  const priorDays = daysDesc.filter((d) => d < day).slice(0, LEAK_WINDOW_DAYS).reverse();
  if (priorDays.length === 0) return null;

  const windowDays = new Set([day, ...priorDays]);
  const windowIds = tournaments.filter((t) => windowDays.has(dayByTournament.get(t.id)!)).map((t) => t.id);

  const hands = await prisma.hand.findMany({
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
  const currentCounts = countLeaks(byDay.get(day) ?? []);

  return { trends: leakDynamics(priorCounts, currentCounts), priorCount: priorDays.length };
}

// Для страницы турнира: динамика игрового дня ЭТОГО турнира против прошлых дней.
// У всех турниров одного вечера блок одинаковый — это и есть смысл (день целиком).
export async function getTournamentLeakDynamics(
  playerId: string,
  tournamentId: string,
): Promise<LeakDynamicsView | null> {
  const current = await prisma.tournament.findFirst({
    where: { id: tournamentId, playerId, deletedAt: null },
    select: { playedAt: true },
  });
  if (!current) return null;
  return buildLeakDynamicsByDay(playerId, gameDayKey(current.playedAt));
}

// Для «Моих турниров»: самый свежий игровой день на фоне прошлых.
export async function getProfileLeakTrend(playerId: string): Promise<LeakDynamicsView | null> {
  return buildLeakDynamicsByDay(playerId, null);
}

// Задание на сессию (plans/2026-07-03-задание-на-сессию.md): goal — цель на СЛЕДУЮЩУЮ
// сессию (топ-лик окна последних игровых дней, включая самый свежий); goalStats —
// насколько лик системный (строка-контекст под заданием); last — итог ПОСЛЕДНЕЙ
// сыгранной сессии по её СОБСТВЕННОМУ заданию (окно дней до неё — то самое, что
// показывалось игроку перед той сессией: задание детерминировано, храним ничего).
export type SessionGoalView = {
  goal: LeakKind;
  goalStats: { days: number; window: number; total: number };
  last: SessionGoalResult | null;
};

// Цель сессии КОНКРЕТНОГО турнира (страница турнира): цель, действовавшая для его
// игрового дня (окно дней ДО него), и итог по этому дню. У турниров одного вечера
// блок одинаковый — как и динамика. null — цели не было (нет системных ликов до дня).
export type TournamentSessionGoal = {
  goal: LeakKind;
  result: SessionGoalResult;
};

export async function getTournamentSessionGoal(
  playerId: string,
  tournamentId: string,
): Promise<TournamentSessionGoal | null> {
  const current = await prisma.tournament.findFirst({
    where: { id: tournamentId, playerId, deletedAt: null },
    select: { playedAt: true },
  });
  if (!current) return null;
  const day = gameDayKey(current.playedAt);

  const tournaments = await prisma.tournament.findMany({
    where: { playerId, deletedAt: null, status: { in: ["PARSED", "CARD_READY"] } },
    orderBy: { playedAt: "desc" },
    take: LEAK_SCAN_TOURNAMENTS,
    select: { id: true, playedAt: true },
  });

  const dayByTournament = new Map<string, string>();
  const daysDesc: string[] = [];
  for (const t of tournaments) {
    const d = gameDayKey(t.playedAt);
    dayByTournament.set(t.id, d);
    if (daysDesc[daysDesc.length - 1] !== d) daysDesc.push(d);
  }

  const priorDays = daysDesc.filter((d) => d < day).slice(0, LEAK_WINDOW_DAYS).reverse();
  if (priorDays.length === 0) return null;

  const wanted = new Set([day, ...priorDays]);
  const ids = tournaments.filter((t) => wanted.has(dayByTournament.get(t.id)!)).map((t) => t.id);
  const hands = await prisma.hand.findMany({
    where: { tournamentId: { in: ids } },
    select: { tournamentId: true, tableData: true },
  });
  const byDay = new Map<string, { tableData: unknown }[]>();
  for (const hand of hands) {
    const handDay = dayByTournament.get(hand.tournamentId)!;
    const list = byDay.get(handDay);
    if (list) list.push(hand);
    else byDay.set(handDay, [hand]);
  }

  const goal = sessionGoal(priorDays.map((d) => countLeaks(byDay.get(d) ?? [])));
  if (!goal) return null;

  return { goal, result: goalResult(goal, countLeaks(byDay.get(day) ?? [])) };
}

export async function getSessionGoalView(playerId: string): Promise<SessionGoalView | null> {
  const tournaments = await prisma.tournament.findMany({
    where: { playerId, deletedAt: null, status: { in: ["PARSED", "CARD_READY"] } },
    orderBy: { playedAt: "desc" },
    take: LEAK_SCAN_TOURNAMENTS,
    select: { id: true, playedAt: true },
  });

  const dayByTournament = new Map<string, string>();
  const daysDesc: string[] = [];
  for (const t of tournaments) {
    const day = gameDayKey(t.playedAt);
    dayByTournament.set(t.id, day);
    if (daysDesc[daysDesc.length - 1] !== day) daysDesc.push(day);
  }

  // Последние WINDOW+1 дней в хронологии: окно следующего задания + день для итога.
  const windowDaysChrono = daysDesc.slice(0, LEAK_WINDOW_DAYS + 1).reverse();
  if (windowDaysChrono.length === 0) return null;

  const wanted = new Set(windowDaysChrono);
  const ids = tournaments.filter((t) => wanted.has(dayByTournament.get(t.id)!)).map((t) => t.id);
  const hands = await prisma.hand.findMany({
    where: { tournamentId: { in: ids } },
    select: { tournamentId: true, tableData: true },
  });
  const byDay = new Map<string, { tableData: unknown }[]>();
  for (const hand of hands) {
    const handDay = dayByTournament.get(hand.tournamentId)!;
    const list = byDay.get(handDay);
    if (list) list.push(hand);
    else byDay.set(handDay, [hand]);
  }
  const counts = windowDaysChrono.map((d) => countLeaks(byDay.get(d) ?? []));

  // Цель на следующую сессию: окно = последние LEAK_WINDOW_DAYS дней (со свежим).
  const nextWindow = counts.slice(-LEAK_WINDOW_DAYS);
  const goal = sessionGoal(nextWindow);
  if (!goal) return null;

  const goalStats = {
    days: nextWindow.filter((c) => c[goal] > 0).length,
    window: nextWindow.length,
    total: nextWindow.reduce((sum, c) => sum + c[goal], 0),
  };

  // Итог последней сессии — по заданию, действовавшему ДЛЯ неё (окно дней до неё).
  const lastGoal = sessionGoal(counts.slice(0, -1).slice(-LEAK_WINDOW_DAYS));
  const last = lastGoal ? goalResult(lastGoal, counts[counts.length - 1]) : null;

  return { goal, goalStats, last };
}

export async function getOpenChart(playerId: string): Promise<OpenChartView | null> {
  // Тот же фильтр учтённых турниров, что у характеристики — счётчик и порог
  // надёжности (CHARACTERISTIC_RELIABLE_FROM) совпадают с показанным в профиле.
  const tournaments = await prisma.tournament.findMany({
    where: {
      playerId,
      deletedAt: null,
      status: { in: ["PARSED", "CARD_READY"] },
      vpipPercent: { not: null },
      resultBuyins: { not: null },
      handsCount: { not: null },
      styleDiagnosis: { not: null },
    },
    select: { id: true },
  });
  if (tournaments.length === 0) return null;

  const hands = await prisma.hand.findMany({
    where: { tournamentId: { in: tournaments.map((t) => t.id) } },
    select: { tableData: true },
  });

  return { chart: aggregateOpenChart(hands), tournamentsCounted: tournaments.length };
}
