import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Подменяем сетевой клиент Telegram: getUpdates отдаёт заготовленные апдейты, отправки —
// заглушки. Тест не ходит в сеть, проверяет логику опроса и движение offset.
vi.mock("@/infrastructure/adapters/notify/telegram-api", () => ({
  getUpdates: vi.fn(),
  sendPhoto: vi.fn(),
  sendMessage: vi.fn(),
  answerCallbackQuery: vi.fn(),
}));

import { getUpdates } from "@/infrastructure/adapters/notify/telegram-api";
import { addPost, getPost } from "@/infrastructure/posting/store";
import { pollTelegramOnce, readOffset } from "@/infrastructure/posting/poll";

const ADMIN = "440359604";
let dir: string;

function offsetPath() {
  return path.join(dir, "tg-offset");
}

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "post-poll-"));
  process.env.POST_QUEUE_DIR = dir;
  process.env.TELEGRAM_ADMIN_CHAT_ID = ADMIN;
  process.env.TELEGRAM_CHANNEL_ID = "@whygrid";
  fs.writeFileSync(path.join(dir, "sliv-01.png"), Buffer.from("PNGDATA"));
  addPost({
    id: "sliv-01",
    imageFile: "sliv-01.png",
    caption: "Текст",
    scheduledAt: "2026-06-29T16:00:00.000Z",
    previewAt: "2026-06-28T16:00:00.000Z",
    status: "PREVIEW_SENT",
  });
  vi.clearAllMocks();
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.POST_QUEUE_DIR;
  delete process.env.TELEGRAM_ADMIN_CHAT_ID;
  delete process.env.TELEGRAM_CHANNEL_ID;
});

describe("опрос Telegram (getUpdates)", () => {
  it("нажатие ✅ из getUpdates одобряет пост и двигает offset", async () => {
    vi.mocked(getUpdates).mockResolvedValue([
      { update_id: 100, callback_query: { id: "c1", from: { id: 440359604 }, data: "approve:sliv-01" } },
    ]);

    const r = await pollTelegramOnce(new Date("2026-06-28T18:00:00.000Z"));

    expect(r).toEqual({ processed: 1 });
    expect(getPost("sliv-01", dir)?.status).toBe("APPROVED");
    // offset с нуля → следующий запрос с update_id+1
    expect(vi.mocked(getUpdates)).toHaveBeenCalledWith(0);
    expect(fs.readFileSync(offsetPath(), "utf8")).toBe("101");
  });

  it("offset продолжается с сохранённого и подтверждает прошлую пачку", async () => {
    fs.writeFileSync(offsetPath(), "50");
    vi.mocked(getUpdates).mockResolvedValue([
      { update_id: 50, callback_query: { id: "c2", from: { id: 440359604 }, data: "hold:sliv-01" } },
    ]);

    await pollTelegramOnce(new Date("2026-06-28T18:00:00.000Z"));

    expect(vi.mocked(getUpdates)).toHaveBeenCalledWith(50);
    expect(readOffset(dir)).toBe(51);
    expect(getPost("sliv-01", dir)?.status).toBe("HELD");
  });

  it("пусто — offset не трогаем", async () => {
    fs.writeFileSync(offsetPath(), "77");
    vi.mocked(getUpdates).mockResolvedValue([]);

    const r = await pollTelegramOnce();

    expect(r).toEqual({ processed: 0 });
    expect(readOffset(dir)).toBe(77);
  });

  it("чужой не одобряет пост, но offset всё равно двигается", async () => {
    vi.mocked(getUpdates).mockResolvedValue([
      { update_id: 200, callback_query: { id: "c3", from: { id: 999999 }, data: "approve:sliv-01" } },
    ]);

    await pollTelegramOnce();

    expect(getPost("sliv-01", dir)?.status).toBe("PREVIEW_SENT"); // не одобрено
    expect(readOffset(dir)).toBe(201); // апдейт обработан (отклонён), повторять не нужно
  });
});
