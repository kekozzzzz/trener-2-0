import fs from "fs";
import path from "path";
import { getPostQueueDir } from "@/config/posting";
import { getUpdates } from "@/infrastructure/adapters/notify/telegram-api";
import { handleTelegramUpdate, type TgUpdate } from "./webhook";

// Опрос Telegram (getUpdates) ВМЕСТО вебхука: в нашей сети Telegram не достукивается до
// релея КЗ входящим (таймаут), поэтому нажатия ✅/✏️ и входящие тянем сами — тем же
// исходящим каналом через релей, который работает. Апдейты прогоняем через ТОТ ЖЕ общий
// обработчик `handleTelegramUpdate`, что и вебхук, — логика одобрения/безопасности одна.
//
// offset (update_id последнего обработанного + 1) храним в файле рядом с очередью — как и
// саму очередь, без БД. Запись атомарна (tmp + rename).

function offsetFile(dir: string): string {
  return path.join(dir, "tg-offset");
}

// Прочитать offset. Нет файла / мусор — 0 (с начала; Telegram хранит апдейты ~24ч).
export function readOffset(dir: string = getPostQueueDir()): number {
  try {
    const n = parseInt(fs.readFileSync(offsetFile(dir), "utf8").trim(), 10);
    return Number.isFinite(n) && n >= 0 ? n : 0;
  } catch {
    return 0;
  }
}

function writeOffset(n: number, dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
  const tmp = offsetFile(dir) + ".tmp";
  fs.writeFileSync(tmp, String(n), "utf8");
  fs.renameSync(tmp, offsetFile(dir));
}

function failuresFile(dir: string): string {
  return path.join(dir, "poll-failures.json");
}

// Краткое человекочитаемое описание апдейта — чтобы в тревоге сторожа было видно,
// КАКОЕ именно нажатие/сообщение не применилось, не только технический update_id.
function summarizeUpdate(u: TgUpdate): string {
  if (u.callback_query?.data) return `нажатие «${u.callback_query.data}»`;
  if (u.message?.text) return `сообщение: ${u.message.text.slice(0, 80)}`;
  return "апдейт без текста";
}

// Обработка апдейта упала (чаще всего — временный сбой сети до релея). offset ниже всё
// равно сдвигается (иначе зациклимся на «ядовитом» апдейте навсегда), а значит сам Telegram
// это нажатие больше не пришлёт — теряется молча. Записываем факт сюда, файл живёт на ВМ;
// отдельный сторож на релее (независимый канал, не зависит от того же сломанного пути)
// читает его и шлёт Артёму тревогу с конкретикой, что понажимать заново. Копим последние
// 50 — файл не растёт бесконечно, старые сбои уже неактуальны.
function recordFailure(dir: string, updateId: number, summary: string, err: unknown): void {
  const file = failuresFile(dir);
  let failures: Array<{ updateId: number; at: string; summary: string; error: string }> = [];
  try {
    failures = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    failures = [];
  }
  failures.push({
    updateId,
    at: new Date().toISOString(),
    summary,
    error: err instanceof Error ? err.message : String(err),
  });
  if (failures.length > 50) failures = failures.slice(-50);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = file + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(failures, null, 2), "utf8");
  fs.renameSync(tmp, file);
}

// Один проход опроса: тянем апдейты с последнего offset, прогоняем через общий обработчик,
// двигаем offset за максимальный update_id. Ошибка одного апдейта не валит остальные и
// НЕ откатывает offset (иначе зациклимся на ядовитом апдейте) — но теперь хотя бы не теряется
// молча, см. recordFailure выше. offset двигаем, только если что-то пришло.
export async function pollTelegramOnce(
  now: Date = new Date(),
  dir: string = getPostQueueDir(),
): Promise<{ processed: number }> {
  const offset = readOffset(dir);
  const updates = await getUpdates(offset);
  let processed = 0;
  let maxId = offset - 1;
  for (const u of updates) {
    try {
      await handleTelegramUpdate(u as unknown as TgUpdate, now);
      processed++;
    } catch (err) {
      console.error(`[poll] ошибка апдейта ${u.update_id}:`, err);
      recordFailure(dir, u.update_id, summarizeUpdate(u as unknown as TgUpdate), err);
    }
    if (u.update_id > maxId) maxId = u.update_id;
  }
  if (updates.length > 0) writeOffset(maxId + 1, dir);
  return { processed };
}
