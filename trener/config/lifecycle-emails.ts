// Пороги двух писем-напоминаний игроку (правило 3 — бизнес-конфиг не в коде):
// «второй турнир бесплатно» (win-back) и «разбор ждёт» (engagement nudge).
// Оба порога переопределяемы из .env, как getRenewalReminderLeadDays (config/plans.ts).

const WIN_BACK_GRACE_DAYS = 4;
const ENGAGEMENT_NUDGE_HOURS = 24;
const INACTIVE_SUBSCRIBER_DAYS = 7;

// Сколько дней тишины после ЕДИНСТВЕННОГО бесплатного турнира считается «пропал» —
// используется и планировщиком письма-возврата, и гейтом доступа (features/usage/budget.ts),
// чтобы бонус появлялся молча ровно тогда же, когда уходит письмо.
export function getWinBackGraceDays(): number {
  const fromEnv = Number(process.env.WIN_BACK_GRACE_DAYS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : WIN_BACK_GRACE_DAYS;
}

// Через сколько часов после загрузки турнира считать «не открыл ни одной раздачи».
export function getEngagementNudgeHours(): number {
  const fromEnv = Number(process.env.ENGAGEMENT_NUDGE_HOURS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : ENGAGEMENT_NUDGE_HOURS;
}

// Через сколько дней бездействия ПЛАТЯЩЕГО подписчика (нет новых турниров с момента
// последней активности / с начала периода, если не грузил вообще) напомнить, что
// подписка продолжает действовать. Раз за оплаченный период — сброс дедупа при
// продлении, см. features/subscription/apply-payment.ts.
export function getInactiveSubscriberDays(): number {
  const fromEnv = Number(process.env.INACTIVE_SUBSCRIBER_DAYS);
  return Number.isFinite(fromEnv) && fromEnv > 0 ? fromEnv : INACTIVE_SUBSCRIBER_DAYS;
}
