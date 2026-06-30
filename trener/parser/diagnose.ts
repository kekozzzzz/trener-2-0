import type { ParseResult } from "./types";

// Сторож разбора: ловит ДВА класса проблем с присланным файлом —
// (1) формат не распознан / рум узнан, но разбор сорвался (кандидат на новый рум);
// (2) разбор прошёл, но результат подозрителен (тихая поломка: грамматика не подошла
//     к чуть иному формату, а числа всё равно вернулись — прямой риск Правилу 1).
// Возвращает причину + СИГНАТУРУ (первую строку-заголовок, без раздач и ников) для
// сигнала администратору. HH-файл и ники игроков наружу НЕ отдаём.

// storable — стоит ли вообще откладывать этот файл как образец нового рума:
// true только для нераспознанного, но похожего на ТЕКСТ файла. Бинарь/мусор
// (замаскированная малварь, обрезок) хранить не нужно и опасно.
export type ParseAnomaly = { reason: string; signature: string; storable: boolean };

const CARD_RE = /^[2-9TJQKA][shdc]$/;

// Похож ли буфер на текст: ни одного NUL-байта и мало управляющих символов.
// Замаскированный под .txt бинарь/исполняемый так отсекаем — в хранилище он не
// попадёт, а сигнал админу пометит его «нечитаемый». UTF-8 (€, кириллица) — это
// старшие байты (>0x7f), их НЕ считаем подозрительными.
export function isProbablyText(buffer: Buffer): boolean {
  const n = Math.min(buffer.length, 8192);
  if (n === 0) return false;
  let suspicious = 0;
  for (let i = 0; i < n; i++) {
    const b = buffer[i];
    if (b === 0) return false; // NUL — точно не текст
    if (b < 0x09 || (b > 0x0d && b < 0x20)) suspicious++; // управляющие, кроме \t\n\r
  }
  return suspicious / n < 0.1;
}

// Чистим строку-сигнатуру перед отправкой: заменяем управляющие символы пробелом
// (чтобы текст из файла не «поехал» в сообщении). parse_mode не используем — Telegram
// покажет как обычный текст, разметка из файла не исполнится.
function sanitizeSignature(line: string): string {
  let out = "";
  for (const ch of line) {
    const code = ch.codePointAt(0) ?? 0;
    out += code < 0x20 || code === 0x7f ? " " : ch;
  }
  return out.replace(/\s+/g, " ").trim().slice(0, 160);
}

// Первая непустая строка файла — у всех румов это заголовок-сигнатура формата
// (номер раздачи/турнира, бай-ин, дата), без ников оппонентов и без карт.
function signatureOf(buffer: Buffer): string {
  for (const raw of buffer.toString("utf-8").split(/\r?\n/)) {
    const line = sanitizeSignature(raw);
    if (line) return line;
  }
  return "(пустой/нечитаемый файл)";
}

export function diagnoseParse(result: ParseResult, buffer: Buffer): ParseAnomaly | null {
  const signature = signatureOf(buffer);

  if (!result.ok) {
    const text = isProbablyText(buffer);
    const base =
      result.error.type === "UNSUPPORTED_FORMAT"
        ? "формат не распознан (возможно, новый рум)"
        : `рум распознан, но разбор сорвался: ${result.error.message}`;
    const reason = text ? base : `${base}; файл не похож на текст (бинарный/нечитаемый — не сохраняем)`;
    return { reason, signature, storable: text };
  }

  const d = result.data;
  const issues: string[] = [];

  if (d.handsCount <= 0) issues.push("0 раздач");
  if (d.vpipPercent < 0 || d.vpipPercent > 100) issues.push(`VPIP вне 0..100 (${d.vpipPercent})`);
  if (d.pfrPercent < 0 || d.pfrPercent > 100) issues.push(`PFR вне 0..100 (${d.pfrPercent})`);
  // PFR — подмножество добровольного входа, не может превышать VPIP (допуск 1пп на округление).
  if (d.pfrPercent > d.vpipPercent + 1) issues.push(`PFR>VPIP (${d.pfrPercent}>${d.vpipPercent})`);

  // Доля раздач без действий/мест и битые карты — грамматика не подошла к формату.
  const n = d.hands.length || 1;
  let noActions = 0;
  let noSeats = 0;
  let badCards = 0;
  for (const h of d.hands) {
    if (h.tableSnapshot.actions.length === 0) noActions++;
    if (h.tableSnapshot.seats.length === 0) noSeats++;
    for (const c of [...h.tableSnapshot.heroCards, ...h.tableSnapshot.board]) {
      if (c && !CARD_RE.test(c)) {
        badCards++;
        break;
      }
    }
  }
  if (noActions / n > 0.5) issues.push(`у ${noActions}/${n} раздач нет действий`);
  if (noSeats > 0) issues.push(`у ${noSeats}/${n} раздач нет мест`);
  if (badCards > 0) issues.push(`битые карты в ${badCards}/${n} раздачах`);

  // Год вне разумного окна — парсер не вытащил дату (подставился момент загрузки/мусор).
  const year = new Date(d.playedAt).getUTCFullYear();
  if (!Number.isFinite(year) || year < 2007 || year > new Date().getUTCFullYear() + 1) {
    issues.push(`подозрительная дата (${d.playedAt})`);
  }

  if (issues.length === 0) return null;
  return { reason: `${d.room}: ${issues.join("; ")}`, signature, storable: false };
}
