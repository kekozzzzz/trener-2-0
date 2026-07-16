import type { TableSnapshot } from "./types";
import { detectHeroVsOpen } from "./vs-open";
import { vsOpenCellState } from "@/config/poker/vs-open-chart";

// Пропущенный 3-бет НА ВЕЛЬЮ: против одиночного опена Hero просто ЗАКОЛЛИРОВАЛ руку, которую
// чарт велит 3-бетить на велью (ячейка THREEBET — премиум-часть диапазона). Идея Артёма
// 2026-07-16: «пропустил трибет с очевидной рукой — двумя дамами, королями, тузами».
//
// Почему это САМЫЙ ясный из «пропусков»: флэт премиума против опена на микролимитах осознанным
// эксплойтом практически не бывает — почти всегда это зевок велью. Остальные отклонения (шире
// чарта, пропущенный колл в оддсах) двусмысленны — там осознанный выбор реален (решение Артёма
// 2026-07-16: показываем факт+частоту, приговор не выносим).
//
// НЕ считаем пропущенным блеф-3-бет (ячейка THREEBET_BLUFF): он опционален, грань тонкая —
// не 3-бетнуть блефом не ошибка. Правило 1: факт, позицию и код руки считает парсер, не LLM.

export type MissedValue3bet = {
  code: string; // код руки: «AA», «KK», «QQ»…
  position: string; // позиция Hero против опена
};

export function detectHeroMissedValue3bet(snapshot: TableSnapshot): MissedValue3bet | null {
  const vs = detectHeroVsOpen(snapshot);
  if (!vs || vs.action !== "CALL") return null; // 3-бетнул/сбросил — не наш спот
  if (vsOpenCellState(vs.heroPosition, vs.code) !== "THREEBET") return null; // чарт не велит 3-бет на велью
  return { code: vs.code, position: vs.heroPosition };
}
