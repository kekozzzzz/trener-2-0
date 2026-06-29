import type { Position } from "../types";

// Чистые функции позиций — общие для адаптеров румов (PS-семья, iPoker и т.д.).
// Идентичны логике GG/WPN (по расстоянию от баттона в кольце ЗАНЯТЫХ мест).
// GG и WPN держат свои копии (исторически, деплой стабилен) — новые парсеры берут отсюда.

// Позиция по расстоянию d от баттона в кольце занятых мест (0 = баттон, дальше по
// часовой). CO — место прямо перед баттоном, HJ — за ним; всё раньше — EARLY.
export function positionAtDistance(d: number, n: number): Position {
  if (d === 0) return "BTN";
  if (n === 2) return "BB"; // хедз-ап: баттон = SB, второй = BB
  if (d === 1) return "SB";
  if (d === 2) return "BB";
  if (d === n - 1) return "CO";
  if (d === n - 2) return "HJ";
  return "EARLY";
}

// Точное имя места для показа (LJ-стиль): совпадает с коарс-позицией везде, кроме
// склейки EARLY — там по расстоянию d перед HJ идёт LJ, раньше UTG, UTG+1…
export function finePositionName(coarse: Position, d: number, n: number): string {
  if (coarse !== "EARLY") return coarse;
  if (d === n - 3) return "LJ";
  return d === 3 ? "UTG" : `UTG+${d - 3}`;
}

export type ResolvedPosition = { coarse: Position; fine: string };

// Карта имя→{коарс-позиция (для чартов), точное имя (для показа)}. Если баттон в
// раздаче не определён — запасной путь по именам постящих блайнды, остальные OTHER.
export function resolvePositions(
  seatRows: { seatNum: number; name: string }[],
  buttonSeatNum: number | null,
  sbName: string | null,
  bbName: string | null,
): Map<string, ResolvedPosition> {
  const byName = new Map<string, ResolvedPosition>();
  if (buttonSeatNum == null || !seatRows.some((r) => r.seatNum === buttonSeatNum)) {
    for (const row of seatRows) {
      const c: Position = row.name === sbName ? "SB" : row.name === bbName ? "BB" : "OTHER";
      byName.set(row.name, { coarse: c, fine: c });
    }
    return byName;
  }

  const ring = [...seatRows].sort((a, b) => a.seatNum - b.seatNum);
  const n = ring.length;
  const buttonIdx = ring.findIndex((r) => r.seatNum === buttonSeatNum);
  ring.forEach((row, i) => {
    const d = (i - buttonIdx + n) % n;
    const coarse = positionAtDistance(d, n);
    byName.set(row.name, { coarse, fine: finePositionName(coarse, d, n) });
  });
  return byName;
}
