/**
 * Тесты email-адаптера Unisender Go (infrastructure/adapters/email).
 *
 * Покрывают:
 *  1. sendEmail шлёт POST на email/send.json: верный URL, заголовок X-API-KEY,
 *     тело message.recipients/subject/from_email/from_name/body.{html,plaintext}.
 *  2. Ответ не-2xx → бросает (адаптер честен про ошибку, без тела в сообщении).
 *  3. HTTP 200, но failure_count > 0 → бросает (письмо не считается доставленным).
 *  4. safeSendEmail глушит ошибку доставки (вторичные письма не роняют вызывающего).
 *
 * Сеть не трогаем — global.fetch замокан.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { unisenderEmailAdapter } from "@/infrastructure/adapters/email/unisender";
import { safeSendEmail } from "@/infrastructure/adapters/email";

const ENV_KEYS = ["EMAIL_API_KEY", "EMAIL_API_URL", "EMAIL_FROM_ADDRESS", "EMAIL_FROM_NAME"] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.EMAIL_API_KEY = "test-api-key";
  process.env.EMAIL_API_URL = "https://go1.unisender.ru/ru/transactional/api/v1/email/send.json";
  process.env.EMAIL_FROM_ADDRESS = "no-reply@whygrid.app";
  process.env.EMAIL_FROM_NAME = "Whygrid";
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const MSG = { to: "player@example.com", subject: "Сброс пароля", html: "<b>ссылка</b>", text: "ссылка" };

describe("unisenderEmailAdapter.sendEmail", () => {
  it("шлёт корректный запрос на email/send.json с X-API-KEY и телом", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ status: "success" }) } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await unisenderEmailAdapter.sendEmail(MSG);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://go1.unisender.ru/ru/transactional/api/v1/email/send.json");
    expect(init.method).toBe("POST");
    expect(init.headers["X-API-KEY"]).toBe("test-api-key");
    const body = JSON.parse(init.body);
    expect(body.message.recipients).toEqual([{ email: "player@example.com" }]);
    expect(body.message.subject).toBe("Сброс пароля");
    expect(body.message.from_email).toBe("no-reply@whygrid.app");
    expect(body.message.from_name).toBe("Whygrid");
    expect(body.message.body).toEqual({ html: "<b>ссылка</b>", plaintext: "ссылка" });
  });

  it("ответ не-2xx → бросает (без тела ответа в сообщении)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: false, status: 401, json: async () => ({}) } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(unisenderEmailAdapter.sendEmail(MSG)).rejects.toThrow(/HTTP 401/);
  });

  it("HTTP 200 но failure_count > 0 → бросает", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ failure_count: 1 }) } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(unisenderEmailAdapter.sendEmail(MSG)).rejects.toThrow(/failure_count/);
  });
});

describe("safeSendEmail", () => {
  it("глушит ошибку доставки — не пробрасывает наверх", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("сеть упала"));
    vi.stubGlobal("fetch", fetchMock);
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(safeSendEmail(MSG)).resolves.toBeUndefined();
    expect(errorSpy).toHaveBeenCalled();
  });
});
