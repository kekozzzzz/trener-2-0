import { LEAK_KINDS, leakDynamics, type LeakCounts, type LeakKind } from "./leak-trend";

// Задание на сессию (plans/2026-07-03-задание-на-сессию.md): тренер даёт ОДНУ цель на
// следующий игровой день — самый частый активный лик окна прошлых дней, — а после
// сессии тот же счётчик ликов детерминированно проверяет выполнение. Правило 1: и
// выбор задания, и проверка — чистая математика поверх лик-трекера, LLM не участвует.
//
// Хранить задание не нужно: для сессии X оно однозначно вычисляется из окна дней ДО X,
// поэтому «какое задание показали до сессии» и «что проверяем после» совпадают всегда.

const zeroCounts = (): LeakCounts =>
  Object.fromEntries(LEAK_KINDS.map((k) => [k, 0])) as LeakCounts;

// Задание на следующую сессию по окну прошлых игровых дней (хронология, старые →
// новые). null — активных системных ликов нет (первые дни игрока или чистая игра):
// блок задания не показываем либо показываем «держи планку» — решается в UI.
export function sessionGoal(priorDays: LeakCounts[]): LeakKind | null {
  // leakDynamics уже отбирает активные лики (≥ LEAK_ACTIVE_MIN_DAYS дней окна)
  // и сортирует по частоте за окно — задание всегда самый системный лик.
  const trends = leakDynamics(priorDays, zeroCounts());
  return trends.length > 0 ? trends[0].kind : null;
}

// Итог задания по сыгранной сессии: violations — сколько раз лик повторился в этот
// день, done — ни разу (это и подсвечиваем лаймом как выполненную цель).
export type SessionGoalResult = {
  kind: LeakKind;
  done: boolean;
  violations: number;
};

export function goalResult(kind: LeakKind, day: LeakCounts): SessionGoalResult {
  const violations = day[kind];
  return { kind, done: violations === 0, violations };
}
