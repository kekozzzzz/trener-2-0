import type { TableSnapshot } from "./types";

// Размер большого блайнда на момент раздачи. Парсер не хранит его отдельным
// полем, но в снимке есть действие POST_BB с уже разобранной суммой — её и берём.
// Нужен, чтобы показать результат раздачи не только в фишках, но и в больших
// блайндах (BB). Если POST_BB в раздаче нет — вернёт null (тогда BB не показываем).
// Несколько POST_BB (например, опоздавший игрок ставит мёртвый блайнд) равны
// уровню стола — берём максимум на случай нестандартных постов.
export function bigBlindFromSnapshot(snapshot: TableSnapshot): number | null {
  const posts = snapshot.actions
    .filter((a) => a.action === "POST_BB" && a.amount != null)
    .map((a) => a.amount as number);
  if (posts.length === 0) return null;
  return Math.max(...posts);
}
