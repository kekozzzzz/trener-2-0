import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import os from "os";
import path from "path";

// Подменяем сетевой клиент Telegram — тест не ходит в сеть, только проверяет вызовы.
vi.mock("@/infrastructure/adapters/notify/telegram-api", () => ({
  sendPhoto: vi.fn(),
  sendMessage: vi.fn(),
  answerCallbackQuery: vi.fn(),
}));

import {
  sendPhoto,
  sendMessage,
  answerCallbackQuery,
} from "@/infrastructure/adapters/notify/telegram-api";
import { addPost, getPost } from "@/infrastructure/posting/store";
import { runScheduler } from "@/infrastructure/posting/service";
import { handleTelegramUpdate } from "@/infrastructure/posting/webhook";

const ADMIN = "440359604";
let dir: string;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "post-flow-"));
  process.env.POST_QUEUE_DIR = dir;
  process.env.TELEGRAM_ADMIN_CHAT_ID = ADMIN;
  process.env.TELEGRAM_CHANNEL_ID = "@whygrid";
  fs.writeFileSync(path.join(dir, "sliv-01.png"), Buffer.from("PNGDATA"));
  addPost({
    id: "sliv-01",
    imageFile: "sliv-01.png",
    caption: "Текст поста про слив",
    scheduledAt: "2026-06-29T16:00:00.000Z",
    previewAt: "2026-06-28T16:00:00.000Z",
    status: "QUEUED",
    buttonText: "✍️ Написать нам",
    buttonUrl: "https://t.me/whygrid_bot",
  });
  vi.clearAllMocks();
});
afterEach(() => {
  fs.rmSync(dir, { recursive: true, force: true });
  delete process.env.POST_QUEUE_DIR;
  delete process.env.TELEGRAM_ADMIN_CHAT_ID;
  delete process.env.TELEGRAM_CHANNEL_ID;
});

describe("полный цикл постинга", () => {
  it("превью → одобрение кнопкой → публикация в канал", async () => {
    // 1. Планировщик шлёт превью Артёму с кнопками одобрения.
    const r1 = await runScheduler(new Date("2026-06-28T17:00:00.000Z"));
    expect(r1).toEqual({ previews: 1, published: 0 });
    expect(sendPhoto).toHaveBeenCalledTimes(1);
    const [chatId, photo, opts] = vi.mocked(sendPhoto).mock.calls[0];
    expect(chatId).toBe(ADMIN);
    expect(Buffer.isBuffer(photo)).toBe(true);
    expect(opts?.replyMarkup?.inline_keyboard[0][0]).toMatchObject({
      callback_data: "approve:sliv-01",
    });
    expect(getPost("sliv-01", dir)?.status).toBe("PREVIEW_SENT");

    // 2. Артём жмёт «✅ Опубликовать».
    await handleTelegramUpdate(
      { callback_query: { id: "cbq1", from: { id: 440359604 }, data: "approve:sliv-01" } },
      new Date("2026-06-28T18:00:00.000Z"),
    );
    expect(answerCallbackQuery).toHaveBeenCalledWith("cbq1", { text: "Одобрено ✅" });
    expect(getPost("sliv-01", dir)?.status).toBe("APPROVED");

    // 3. Настало время — планировщик публикует в канал с кнопкой «Написать нам».
    vi.clearAllMocks();
    const r2 = await runScheduler(new Date("2026-06-29T17:00:00.000Z"));
    expect(r2).toEqual({ previews: 0, published: 1 });
    const [chId, , pubOpts] = vi.mocked(sendPhoto).mock.calls[0];
    expect(chId).toBe("@whygrid");
    expect(pubOpts?.replyMarkup?.inline_keyboard[0][0]).toMatchObject({
      text: "✍️ Написать нам",
      url: "https://t.me/whygrid_bot",
    });
    expect(getPost("sliv-01", dir)?.status).toBe("PUBLISHED");
  });

  it("безопасность: чужой не может одобрить пост", async () => {
    await runScheduler(new Date("2026-06-28T17:00:00.000Z")); // PREVIEW_SENT
    vi.clearAllMocks();
    await handleTelegramUpdate({
      callback_query: { id: "cbq2", from: { id: 999999 }, data: "approve:sliv-01" },
    });
    expect(answerCallbackQuery).toHaveBeenCalledWith("cbq2", { text: "Нет доступа" });
    expect(getPost("sliv-01", dir)?.status).toBe("PREVIEW_SENT"); // не одобрено
  });

  it("чужое сообщение пересылается Артёму как отзыв, а не команда", async () => {
    await handleTelegramUpdate({
      message: { from: { id: 999999, username: "stranger" }, text: "сколько стоит?" },
    });
    expect(sendMessage).toHaveBeenCalledTimes(1);
    const [chatId, text] = vi.mocked(sendMessage).mock.calls[0];
    expect(chatId).toBe(ADMIN);
    expect(text).toContain("это отзыв, не команда");
    expect(text).toContain("сколько стоит?");
    expect(text).toContain("@stranger");
  });

  it("не одобренный пост не публикуется по наступлении времени", async () => {
    // время публикации настало, но статус всё ещё QUEUED → канал не трогаем
    const r = await runScheduler(new Date("2026-06-29T17:00:00.000Z"));
    expect(r.published).toBe(0);
  });
});
