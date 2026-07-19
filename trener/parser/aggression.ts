import type { TableSnapshot } from "./types";
import { tableStateUpTo } from "./table-state";

// Единый ответ на вопрос: игрок ПОСТАВИЛ (агрессия) или лишь ДОЛОЖИЛ (колл)?
//
// Зачем отдельная функция. ВСЕ румы схлопывают колл-олл-ина и пуш в один action="ALL_IN", глагол
// теряется: GG/PokerStars/Winamax/WPN — через «and is all-in» (ветка all-in стоит до разбора
// глагола), 888 и iPoker — вычисляя олл-ин по вкладу (там «and is all-in» вообще не пишут).
// Поэтому проверка `action === "ALL_IN"` НЕ означает «он пушил»: с тем же успехом он доложил
// последнее. Без этой сверки код выдавал модели ложные факты (аудит 18.07):
//   • allin-geometry — «геометрия ТВОЕГО ре-пуша… фолд-эквити… мёртвые деньги заберёшь» на
//     плоском колле чужого олл-ина (у доложившего фолд-эквити ноль);
//   • initiative — «чек-рейз» на чек-КОЛЛЕ олл-ина;
//   • facts (renderShowdownFacts) — «твою ставку он заколлировал» там, где ставки не было.
//
// Критерий намеренно тот же, что уже зашит в tableStateUpTo (isRaise = RAISE || amt > currentBet):
// сравниваем сумму хода с максимальным ИТОГОМ по улице до него. Так метки и банк/SPR не разъедутся.
export function isAggressiveActionAt(snapshot: TableSnapshot, idx: number): boolean {
  const a = snapshot.actions[idx];
  if (!a) return false;
  if (a.action === "BET" || a.action === "RAISE") return true;
  if (a.action !== "ALL_IN") return false;

  // Первый ход на улице — ставить не против чего, это агрессия. Отдельная ветка нужна потому, что
  // tableStateUpTo сбрасывает улицу, лишь ВСТРЕТИВ действие новой: состояние «до» первого хода
  // улицы ещё хранит ставки ПРОШЛОЙ улицы, и сравнение с ними врало бы (короткий ривер-пуш после
  // крупного тёрна выглядел бы коллом).
  const prev = idx > 0 ? snapshot.actions[idx - 1] : null;
  if (!prev || prev.street !== a.street) return true;

  const before = tableStateUpTo(snapshot, idx - 1);
  const highest = before.seats.reduce((m, s) => Math.max(m, s.streetBet), 0);
  return (a.amount ?? 0) > highest;
}

// Индекс ПОСЛЕДНЕЙ агрессии игрока (ставка/рейз/настоящий пуш), -1 если её не было.
export function lastAggressionIndex(snapshot: TableSnapshot, actor: string): number {
  for (let i = snapshot.actions.length - 1; i >= 0; i--) {
    if (snapshot.actions[i].actor !== actor) continue;
    if (isAggressiveActionAt(snapshot, i)) return i;
  }
  return -1;
}
