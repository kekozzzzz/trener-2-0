/**
 * Тесты getUpdates (infrastructure/adapters/notify/telegram-api) — регресс 2026-07-19:
 * долгоживущий процесс копит протухшие keep-alive соединения к релею, крон раз в минуту
 * ловил AbortSignal.timeout на КАЖДОМ заходе, входящие сообщения не принимались вовсе.
 * Один быстрый повтор на таймаут (без повтора на прочие ошибки — те решает вызывающий).
 *
 * Сеть не трогаем — global.fetch замокан.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { getUpdates } from "@/infrastructure/adapters/notify/telegram-api";

const ENV_KEYS = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_BASE_URL", "TELEGRAM_PROXY_SECRET"] as const;
const savedEnv: Record<string, string | undefined> = {};

function timeoutError(): DOMException {
  return new DOMException("The operation was aborted due to timeout", "TimeoutError");
}

function okResponse(result: unknown[]): Response {
  return { ok: true, json: () => Promise.resolve({ ok: true, result }) } as unknown as Response;
}

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.TELEGRAM_BOT_TOKEN = "123:ABC";
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

describe("getUpdates: повтор на протухшее соединение", () => {
  it("первый заход таймаутом, второй успешен — возвращает результат второго", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce(okResponse([{ update_id: 5 }]));
    vi.stubGlobal("fetch", fetchMock);

    const result = await getUpdates(0);

    expect(result).toEqual([{ update_id: 5 }]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("оба захода таймаутом — бросает ошибку, второй заход был предпринят", async () => {
    const fetchMock = vi.fn().mockRejectedValue(timeoutError());
    vi.stubGlobal("fetch", fetchMock);

    await expect(getUpdates(0)).rejects.toThrow(/timeout|Timeout/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("не-таймаут ошибка (сеть оборвалась) — не повторяет, бросает сразу", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("сеть упала"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(getUpdates(0)).rejects.toThrow("сеть упала");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("вызывающий передал свой signal — повтор не делаем (уважаем чужой контроль)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(timeoutError());
    vi.stubGlobal("fetch", fetchMock);
    const ownSignal = new AbortController().signal;

    await expect(getUpdates(0, { signal: ownSignal })).rejects.toThrow();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("успех с первого захода — не делает лишний второй запрос", async () => {
    const fetchMock = vi.fn().mockResolvedValue(okResponse([]));
    vi.stubGlobal("fetch", fetchMock);

    await getUpdates(0);

    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
