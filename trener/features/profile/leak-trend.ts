import type { TableSnapshot } from "@/parser/types";
import { detectHeroOpen } from "@/parser/open-raise";
import { detectHeroLimp } from "@/parser/limp";
import { detectHeroBBDefense } from "@/parser/bb-defense";
import { detectHeroOpenShove } from "@/parser/open-shove";
import { detectHeroVsOpen } from "@/parser/vs-open";
import { detectHeroIso } from "@/parser/iso";
import { detectHeroSqueeze } from "@/parser/squeeze";
import { detectHeroDefVs3bet } from "@/parser/def-vs-3bet";
import { isOpenSignificantlyWide } from "@/config/poker/rfi-chart";
import { isBBThreeBetSignificantlyWide } from "@/config/poker/bb-defense-chart";
import { isOpenShoveSignificantlyWide } from "@/config/poker/push-fold-chart";
import { isVsOpenThreeBetSignificantlyWide } from "@/config/poker/vs-open-chart";
import { isIsoSignificantlyWide } from "@/config/poker/iso-chart";
import { isSqueezeSignificantlyWide } from "@/config/poker/squeeze-chart";
import { isFourBetSignificantlyWide } from "@/config/poker/def-vs-3bet-chart";
import { LEAK_ACTIVE_MIN_DAYS } from "@/config/leaks";

// Лик-трекер: динамика ошибок между ИГРОВЫМИ ДНЯМИ («в прошлые дни лимпил 4-2-3 раза —
// сегодня ни разу»). Единица — день, не турнир: за вечер играется несколько турниров,
// сравнивать их друг с другом — шум (решение Артёма 2026-07-02). Правило 1: сами лики
// находят существующие детекторы parser/* и чарты config/poker/* — здесь только
// счётчики во времени, LLM не участвует.
//
// Чистые функции (без БД): вызывающий код группирует раздачи по игровым дням в
// хронологии и передаёт сюда — логика целиком покрывается юнит-тестами.

// Виды отслеживаемых ликов — по одному на каждый существующий детектор «шире нормы»
// плюс лимпы (там лик — сам факт, кроме SB-комплита, который детектор не флагает).
export type LeakKind =
  | "OPEN_WIDE" // открытие первым шире RFI-чарта
  | "LIMP" // опен-лимп или овер-лимп (SB-комплит не считается)
  | "BB_3BET_WIDE" // 3-бет из BB шире чарта защиты
  | "OPEN_SHOVE_WIDE" // опен-шов на коротком вне пуш-диапазона
  | "VS_OPEN_3BET_WIDE" // 3-бет против опена (не BB) шире чарта
  | "ISO_WIDE" // изоляция лимпера шире чарта
  | "SQUEEZE_WIDE" // сквиз шире чарта
  | "FOURBET_WIDE"; // 4-бет после своего опена шире чарта

export const LEAK_KINDS: LeakKind[] = [
  "OPEN_WIDE",
  "LIMP",
  "BB_3BET_WIDE",
  "OPEN_SHOVE_WIDE",
  "VS_OPEN_3BET_WIDE",
  "ISO_WIDE",
  "SQUEEZE_WIDE",
  "FOURBET_WIDE",
];

export type LeakCounts = Record<LeakKind, number>;

const emptyCounts = (): LeakCounts => ({
  OPEN_WIDE: 0,
  LIMP: 0,
  BB_3BET_WIDE: 0,
  OPEN_SHOVE_WIDE: 0,
  VS_OPEN_3BET_WIDE: 0,
  ISO_WIDE: 0,
  SQUEEZE_WIDE: 0,
  FOURBET_WIDE: 0,
});

// Ключ игрового дня по playedAt турнира. UTC — дата берётся ровно как в HH-файле
// (страницы показывают её так же, timeZone UTC), локальный пояс сервера не влияет.
export function gameDayKey(playedAt: Date): string {
  return playedAt.toISOString().slice(0, 10);
}

// Счётчики ликов по набору раздач (обычно — все раздачи одного игрового дня).
// Каждая раздача может дать не больше одного инкремента на вид лика (детекторы
// взаимоисключающие по споту).
export function countLeaks(hands: { tableData: unknown }[]): LeakCounts {
  const counts = emptyCounts();

  for (const hand of hands) {
    const snap = hand.tableData as unknown as TableSnapshot;

    const open = detectHeroOpen(snap);
    if (open && isOpenSignificantlyWide(open.position, open.code)) counts.OPEN_WIDE += 1;

    if (detectHeroLimp(snap)) counts.LIMP += 1;

    const def = detectHeroBBDefense(snap);
    if (def?.action === "3BET" && isBBThreeBetSignificantlyWide(def.openerPosition, def.code)) {
      counts.BB_3BET_WIDE += 1;
    }

    const shove = detectHeroOpenShove(snap);
    if (shove && isOpenShoveSignificantlyWide(shove.band, shove.position, shove.code)) {
      counts.OPEN_SHOVE_WIDE += 1;
    }

    const vs = detectHeroVsOpen(snap);
    if (vs?.action === "3BET" && isVsOpenThreeBetSignificantlyWide(vs.heroPosition, vs.code)) {
      counts.VS_OPEN_3BET_WIDE += 1;
    }

    const iso = detectHeroIso(snap);
    if (iso && isIsoSignificantlyWide(iso.heroPosition, iso.code)) counts.ISO_WIDE += 1;

    const sq = detectHeroSqueeze(snap);
    if (sq && isSqueezeSignificantlyWide(sq.heroPosition, sq.code)) counts.SQUEEZE_WIDE += 1;

    const fb = detectHeroDefVs3bet(snap);
    if (fb?.action === "4BET" && isFourBetSignificantlyWide(fb.heroPosition, fb.code)) {
      counts.FOURBET_WIDE += 1;
    }
  }

  return counts;
}

// Динамика одного активного лика: счётчики по прошлым игровым дням окна (хронологически,
// старые → новые) и счётчик текущего дня. improved — лик был системным, а в текущем
// дне не встретился ни разу (это и подсвечиваем как прогресс).
export type LeakDynamics = {
  kind: LeakKind;
  window: number[];
  current: number;
  priorTotal: number;
  improved: boolean;
};

// Активные лики окна против текущего игрового дня. prior — счётчики ПРОШЛЫХ дней окна
// в хронологии (вызывающий код сам режет окно по LEAK_WINDOW_DAYS), current — счётчики
// текущего дня. Лик активен, если встретился в ≥ LEAK_ACTIVE_MIN_DAYS прошлых днях:
// один день — случайность, от двух — паттерн. Сортировка — самые частые по сумме за
// окно сверху. Пустой результат — трекать пока нечего.
export function leakDynamics(prior: LeakCounts[], current: LeakCounts): LeakDynamics[] {
  const result: LeakDynamics[] = [];

  for (const kind of LEAK_KINDS) {
    const window = prior.map((c) => c[kind]);
    const daysWithLeak = window.filter((n) => n > 0).length;
    if (daysWithLeak < LEAK_ACTIVE_MIN_DAYS) continue;

    const priorTotal = window.reduce((sum, n) => sum + n, 0);
    result.push({
      kind,
      window,
      current: current[kind],
      priorTotal,
      improved: current[kind] === 0,
    });
  }

  return result.sort((a, b) => b.priorTotal - a.priorTotal);
}
