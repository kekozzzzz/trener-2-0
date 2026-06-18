/**
 * Тесты адаптера уведомлений Telegram (infrastructure/adapters/notify).
 *
 * Покрывают:
 *  1. notifyAdmin шлёт корректный sendMessage: верный URL (base/bot<token>/sendMessage),
 *     chat_id и text в теле, заголовок x-proxy-secret для релея.
 *  2. Пустой TELEGRAM_BASE_URL → ходим на api.telegram.org напрямую.
 *  3. Ответ не-2xx → notifyAdmin бросает (адаптер честен про ошибку).
 *  4. safeNotifyAdmin глушит ошибку доставки (воркер от неё не падает).
 *
 * Сеть не трогаем — global.fetch замокан.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { telegramNotifyAdapter } from "@/infrastructure/adapters/notify/telegram";
import { safeNotifyAdmin } from "@/infrastructure/adapters/notify";

const ENV_KEYS = [
  "TELEGRAM_BOT_TOKEN",
  "TELEGRAM_ADMIN_CHAT_ID",
  "TELEGRAM_BASE_URL",
  "TELEGRAM_PROXY_SECRET",
] as const;

const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.TELEGRAM_BOT_TOKEN = "123:ABC";
  process.env.TELEGRAM_ADMIN_CHAT_ID = "440359604";
  process.env.TELEGRAM_BASE_URL = "https://92.60.75.87/tg";
  process.env.TELEGRAM_PROXY_SECRET = "secret-xyz";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("telegramNotifyAdapter.notifyAdmin", () => {
  it("шлёт sendMessage на релей с chat_id, text и x-proxy-secret", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await telegramNotifyAdapter.notifyAdmin("тревога: задача упала");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://92.60.75.87/tg/bot123:ABC/sendMessage");
    expect(init.method).toBe("POST");
    expect(init.headers["x-proxy-secret"]).toBe("secret-xyz");
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe("440359604");
    expect(body.text).toBe("тревога: задача упала");
  });

  it("без TELEGRAM_BASE_URL ходит на api.telegram.org напрямую", async () => {
    process.env.TELEGRAM_BASE_URL = "";
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await telegramNotifyAdapter.notifyAdmin("привет");

    const [url] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.telegram.org/bot123:ABC/sendMessage");
  });

  it("ответ не-2xx → бросает ошибку (без тела ответа в сообщении)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 500 } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(telegramNotifyAdapter.notifyAdmin("x")).rejects.toThrow(/HTTP 500/);
  });
});

describe("safeNotifyAdmin", () => {
  it("глушит ошибку доставки — не пробрасывает наверх", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("сеть упала"));
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    // Не должно бросить, несмотря на падение fetch.
    await expect(safeNotifyAdmin("тревога")).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
