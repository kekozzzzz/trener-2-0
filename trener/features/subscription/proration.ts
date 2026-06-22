// Пропорциональный зачёт при апгрейде тарифа в середине периода (Stripe-style).
// Чистая функция без побочных эффектов — вызывается из серверного экшена switchPlan
// и покрыта юнит-тестами. Деньги — целые копейки (правило 3), никаких float-остатков.

const DAY_MS = 24 * 60 * 60 * 1000;

// Сколько списать сегодня при переходе на более дорогой тариф: цена нового тарифа
// минус неиспользованная часть оплаты текущего. Неиспользованное считаем по остатку
// дней до конца оплаченного периода, но НЕ больше одного периода (если оплачено
// вперёд — зачитываем максимум один период, чтобы не уйти в отрицательную доплату).
// Для апгрейда (newPrice > currentPrice) результат всегда > 0.
export function proratedUpgradeKopecks(
  currentPriceKopecks: number,
  newPriceKopecks: number,
  nextPaymentAt: Date,
  now: Date,
  periodDays: number,
): number {
  const periodMs = periodDays * DAY_MS;
  const remainingMs = Math.min(Math.max(nextPaymentAt.getTime() - now.getTime(), 0), periodMs);
  const credit = Math.round((currentPriceKopecks * remainingMs) / periodMs);
  return Math.max(0, newPriceKopecks - credit);
}
