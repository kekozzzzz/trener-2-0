import type { PlayerStyle, TableSnapshot } from "@/parser/types";
import { detectHeroOpen } from "@/parser/open-raise";
import { isOpenSignificantlyWide } from "@/config/poker/rfi-chart";

// Детерминированная сводка игры по ВСЕМ турнирам игрока — фундамент характеристики
// в личном кабинете. Правило 1/2: все числа и сверку открывашек с RFI-чартом считает
// код, LLM получает этот JSON готовым и только формулирует текст, ничего не пересчитывая.
//
// Чистая функция (без БД): шаг очереди грузит метрики турниров и снимки раздач,
// передаёт сюда — так логику легко покрыть юнит-тестом.

// Сколько разных открывашек-нарушителей максимум назвать в характеристике
// (как в обзоре турнира — топ по частоте). Держим в коде агрегатора: это не
// бизнес-настройка, а защита промпта от простыни.
const MAX_OPEN_LEAK = 6;

// При равенстве числа турниров доминирующий стиль выбираем в том же порядке, что
// и diagnoseStyle (parser/ggpoker/classify.ts): LOOSE > TIGHT > PASSIVE > AGGRESSIVE.
const STYLE_PRIORITY: PlayerStyle[] = ["LOOSE", "TIGHT", "PASSIVE", "AGGRESSIVE"];

// Метрики одного учтённого турнира (уже посчитаны парсером, лежат на Tournament).
export type CountedTournament = {
  vpipPercent: number;
  resultBuyins: number;
  handsCount: number;
  styleDiagnosis: PlayerStyle;
};

// Открывашка шире нормы, агрегированная по всей дистанции: рука+позиция и сколько
// раз так открывал. Частота — чтобы промпт мог назвать самые системные.
export type OpenLeakAggregate = { position: string; code: string; count: number };

export type PlayerCharacteristicFacts = {
  tournamentsCounted: number;
  avgVpip: number;
  avgResultBuyins: number;
  avgHandsCount: number;
  styleCounts: Record<PlayerStyle, number>;
  dominantStyle: PlayerStyle;
  openLeak: OpenLeakAggregate[];
};

const round2 = (n: number) => Math.round(n * 100) / 100;

// Открывашки шире нормы по всем раздачам всех турниров: детектор «открылся первым» +
// код руки (parser/open-raise), чарт отсеивает норму и граничные (config/poker/rfi-chart).
// Группируем по позиция+код, чаще встречающиеся — выше, берём топ-N.
function collectOpenLeak(hands: { tableData: unknown }[]): OpenLeakAggregate[] {
  const counts = new Map<string, OpenLeakAggregate>();
  for (const hand of hands) {
    const open = detectHeroOpen(hand.tableData as unknown as TableSnapshot);
    if (!open || !isOpenSignificantlyWide(open.position, open.code)) continue;
    const key = `${open.position}:${open.code}`;
    const entry = counts.get(key);
    if (entry) entry.count += 1;
    else counts.set(key, { position: open.position, code: open.code, count: 1 });
  }
  return [...counts.values()].sort((a, b) => b.count - a.count).slice(0, MAX_OPEN_LEAK);
}

// Собирает факты по всем турнирам игрока. tournaments — метрики (без них считать
// нечего), hands — снимки ВСЕХ раздач этих турниров (для открывашек по дистанции).
// null, если турниров нет — характеристику строить не из чего.
export function aggregatePlayerCharacteristic(
  tournaments: CountedTournament[],
  hands: { tableData: unknown }[],
): PlayerCharacteristicFacts | null {
  const n = tournaments.length;
  if (n === 0) return null;

  let vpipSum = 0;
  let buyinsSum = 0;
  let handsSum = 0;
  const styleCounts: Record<PlayerStyle, number> = { LOOSE: 0, TIGHT: 0, PASSIVE: 0, AGGRESSIVE: 0 };

  for (const t of tournaments) {
    vpipSum += t.vpipPercent;
    buyinsSum += t.resultBuyins;
    handsSum += t.handsCount;
    styleCounts[t.styleDiagnosis] += 1;
  }

  // Доминирующий стиль: больше всего турниров; при равенстве — по STYLE_PRIORITY.
  const dominantStyle = STYLE_PRIORITY.reduce((best, style) =>
    styleCounts[style] > styleCounts[best] ? style : best,
  );

  return {
    tournamentsCounted: n,
    avgVpip: round2(vpipSum / n),
    avgResultBuyins: round2(buyinsSum / n),
    avgHandsCount: round2(handsSum / n),
    styleCounts,
    dominantStyle,
    openLeak: collectOpenLeak(hands),
  };
}
