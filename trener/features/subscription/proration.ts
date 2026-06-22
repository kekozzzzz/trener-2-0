// Пропорциональная доплата при апгрейде тарифа в середине периода (Stripe-style).
// Чистая функция без побочных эффектов — вызывается из серверного экшена switchPlan
// и покрыта юнит-тестами. Деньги — целые копейки (правило 3), никаких float-остатков.

const DAY_MS = 24 * 60 * 60 * 1000;

// Доплата сегодня при переходе на более дорогой тариф = РАЗНИЦА цен тарифов за
// ОСТАВШИЕСЯ дни текущего периода. Апгрейд применяется к текущему периоду (период не
// перезапускается, метр бюджета НЕ сбрасывается — иначе «лесенкой» апгрейдов можно было
// бы насуммировать бюджеты всех тарифов). Полную цену нового тарифа человек заплатит при
// следующем автопродлении.
//
// Остаток дней считаем до nextPaymentAt, но не больше одного периода (защита от
// стекинга). Для апгрейда (newPrice > currentPrice) результат >= 0.
export function proratedUpgradeKopecks(
  currentPriceKopecks: number,
  newPriceKopecks: number,
  nextPaymentAt: Date,
  now: Date,
  periodDays: number,
): number {
  const periodMs = periodDays * DAY_MS;
  const remainingMs = Math.min(Math.max(nextPaymentAt.getTime() - now.getTime(), 0), periodMs);
  const diff = Math.max(0, newPriceKopecks - currentPriceKopecks);
  return Math.round((diff * remainingMs) / periodMs);
}
