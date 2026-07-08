/**
 * Тесты устойчивого fetch к релею (infrastructure/adapters/http/resilient-fetch).
 * Общий для LLM-разбора и распознавания речи: таймаут + быстрый повтор при временной
 * икоте релея. Цель — человек не замечает разового сбоя.
 *
 * Проверяем:
 *  1. Успех с первого раза — один вызов fetch, signal проставлен.
 *  2. Временный 5xx/429 → повтор по свежему соединению, возвращается здоровый ответ.
 *  3. Обрыв соединения (сетевой TypeError) → повтор.
 *  4. Полный таймаут (AbortSignal 'TimeoutError') → НЕ повторяется, RelayTimeoutError.
 *  5. Не-повторяемый 4xx (напр. 402) отдаётся вызывающему без повтора.
 *  6. Исчерпание повторов → последняя ошибка наверх.
 */

import { describe, it, expect, vi, afterEach } from "vitest";
import { resilientFetch, RelayTimeoutError } from "@/infrastructure/adapters/http/resilient-fetch";

const OPTS = { timeoutMs: 5000, retries: 2, label: "TEST" };

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const ok = (status = 200) => ({ ok: status < 400, status, text: async () => "", json: async () => ({}) }) as Response;

describe("resilientFetch", () => {
  it("успех с первого раза — один fetch, signal проставлен", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok());
    vi.stubGlobal("fetch", fetchMock);

    const res = await resilientFetch("https://relay/x", { method: "POST" }, OPTS);
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
    expect(fetchMock.mock.calls[0][1].method).toBe("POST");
  });

  it("временный 502 → повтор, возвращается здоровый ответ", async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(ok(502)).mockResolvedValueOnce(ok(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await resilientFetch("https://relay/x", {}, { ...OPTS, retries: 1 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("обрыв соединения → повтор", async () => {
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(ok(200));
    vi.stubGlobal("fetch", fetchMock);

    const res = await resilientFetch("https://relay/x", {}, { ...OPTS, retries: 1 });
    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("полный таймаут → НЕ повторяется, RelayTimeoutError", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new DOMException("timed out", "TimeoutError"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(resilientFetch("https://relay/x", {}, OPTS)).rejects.toBeInstanceOf(RelayTimeoutError);
    expect(fetchMock).toHaveBeenCalledTimes(1); // висяк не молотим повторами
  });

  it("не-повторяемый 402 отдаётся вызывающему без повтора", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(402));
    vi.stubGlobal("fetch", fetchMock);

    const res = await resilientFetch("https://relay/x", {}, OPTS);
    expect(res.status).toBe(402);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("исчерпание повторов на 503 → возвращается последний ответ (вызывающий увидит !ok)", async () => {
    const fetchMock = vi.fn().mockResolvedValue(ok(503));
    vi.stubGlobal("fetch", fetchMock);

    const res = await resilientFetch("https://relay/x", {}, { ...OPTS, retries: 2 });
    expect(res.status).toBe(503);
    expect(fetchMock).toHaveBeenCalledTimes(3); // 1 основной + 2 повтора
  });
});
