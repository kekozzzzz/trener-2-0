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

// Один проход опроса: тянем апдейты с последнего offset, прогоняем через общий обработчик,
// двигаем offset за максимальный update_id. Ошибка одного апдейта не валит остальные и
// НЕ откатывает offset (иначе зациклимся на ядовитом апдейте). offset двигаем, только если
// что-то пришло.
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
    }
    if (u.update_id > maxId) maxId = u.update_id;
  }
  if (updates.length > 0) writeOffset(maxId + 1, dir);
  return { processed };
}
