import { sniffTournamentKey } from "@/parser";

export type MergeableFile = { fileBuffer: Buffer; originalFilename: string };

// Первый таймстемп файла — для хронологичного порядка склейки многостольных файлов.
// Текстовые румы (GG/WPN/PS) — "YYYY/MM/DD HH:MM:SS"; iPoker XML — "YYYY-MM-DD HH:MM:SS".
const FIRST_TS = /(\d{4})[/-](\d{2})[/-](\d{2}) (\d{2}):(\d{2}):(\d{2})/;
function firstTimestamp(buffer: Buffer): number {
  const m = FIRST_TS.exec(buffer.toString("utf-8"));
  if (!m) return Number.POSITIVE_INFINITY;
  const [, y, mo, d, h, mi, s] = m;
  return Date.UTC(+y, +mo - 1, +d, +h, +mi, +s);
}

/**
 * Склейка файлов одного турнира в один. WPN (ACR/PokerKing) пишет ОТДЕЛЬНЫЙ файл на
 * каждый стол, а при балансировке игрока пересаживают — так один турнир оказывается
 * разбит на несколько файлов. Группируем по ключу (площадка+номер турнира) и склеиваем
 * в один буфер по времени: парсер агрегирует все раздачи как один турнир. Файлы без
 * распознанного ключа турнира остаются каждый сам по себе.
 */
export function mergeSameTournamentFiles(items: MergeableFile[]): MergeableFile[] {
  const groups = new Map<string, MergeableFile[]>();
  let soloCounter = 0;

  for (const item of items) {
    const key = sniffTournamentKey(item.fileBuffer);
    const groupKey = key ? `${key.room}#${key.tournamentId}` : `__solo_${soloCounter++}`;
    const arr = groups.get(groupKey);
    if (arr) arr.push(item);
    else groups.set(groupKey, [item]);
  }

  const merged: MergeableFile[] = [];
  for (const arr of groups.values()) {
    if (arr.length === 1) {
      merged.push(arr[0]);
      continue;
    }
    const ordered = [...arr].sort((a, b) => firstTimestamp(a.fileBuffer) - firstTimestamp(b.fileBuffer));
    const fileBuffer = Buffer.concat(
      ordered.flatMap((it, i) => (i === 0 ? [it.fileBuffer] : [Buffer.from("\n\n"), it.fileBuffer])),
    );
    merged.push({ fileBuffer, originalFilename: ordered[0].originalFilename });
  }

  return merged;
}
