/**
 * Тесты LLM-адаптера OpenRouter (infrastructure/adapters/llm/openrouter) —
 * боевой путь разбора через КЗ-релей. Фокус: ТАЙМАУТ вызова.
 *
 * Зачем: без таймаута зависший релей держит fetch по дефолту undici ~5 минут —
 * воркер очереди всё это время занят задачей, разбор турнира «замерзает», а ретраи
 * с backoff растягивают одну раздачу на минуты. Проверяем, что вызов ограничен по
 * времени (AbortSignal) и что таймаут превращается в обычную ошибку (её подхватит
 * штатный retry/карантин очереди).
 *
 * Сеть не трогаем — global.fetch замокан. playerId не передаём, поэтому учёт расхода
 * (recordLlmUsage, требует БД) не вызывается.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openRouterLlmAdapter } from "@/infrastructure/adapters/llm/openrouter";
import type { PlayerCharacteristicRequest } from "@/infrastructure/adapters/llm/types";

const ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "OPENROUTER_MODEL",
  "ANTHROPIC_PROXY_SECRET",
  "LLM_CALL_TIMEOUT_MS",
  "LLM_CALL_RETRIES",
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.OPENROUTER_API_KEY = "or-key";
  process.env.OPENROUTER_BASE_URL = "https://relay.example/openrouter/api/v1";
  delete process.env.ANTHROPIC_PROXY_SECRET;
  process.env.LLM_CALL_TIMEOUT_MS = "12345";
  process.env.LLM_CALL_RETRIES = "0"; // по умолчанию в тестах без повторов — быстрее и детерминированнее
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

// Минимальный валидный запрос без TableSnapshot — характеристика игрока считается по
// готовым числам, поэтому вход простой.
const REQ: PlayerCharacteristicRequest = {
  locale: "ru",
  tournamentsCounted: 12,
  avgVpip: 24,
  avgResultBuyins: -1.5,
  avgHandsCount: 80,
  dominantStyle: "LOOSE",
  styleCounts: { LOOSE: 8, TIGHT: 2, PASSIVE: 1, AGGRESSIVE: 1 },
  openLeak: [],
};

describe("openRouterLlmAdapter — таймаут вызова", () => {
  it("передаёт AbortSignal в fetch (вызов ограничен по времени)", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: '{"characteristic":"лузово-пассивный"}' } }] }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await openRouterLlmAdapter.generatePlayerCharacteristic(REQ);
    expect(result.characteristic).toBe("лузово-пассивный");

    const init = fetchMock.mock.calls[0][1];
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("таймаут релея (AbortSignal 'TimeoutError') → понятная ошибка с числом мс", async () => {
    // undici при срабатывании AbortSignal.timeout бросает DOMException name='TimeoutError'.
    const fetchMock = vi.fn().mockRejectedValue(
      new DOMException("The operation was aborted due to timeout", "TimeoutError"),
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(openRouterLlmAdapter.generatePlayerCharacteristic(REQ)).rejects.toThrow(
      /таймаут вызова \(12345 мс\)/,
    );
  });

  it("прочие сетевые ошибки пробрасываются как есть (не маскируются под таймаут)", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(openRouterLlmAdapter.generatePlayerCharacteristic(REQ)).rejects.toThrow(/fetch failed/);
  });

  it("временный 502 от релея → повтор по свежему соединению, человек не замечает", async () => {
    process.env.LLM_CALL_RETRIES = "1";
    const fetchMock = vi
      .fn()
      // первый заход — перегруженный релей отдал 502
      .mockResolvedValueOnce({ ok: false, status: 502, text: async () => "bad gateway" } as Response)
      // повтор — уже здоровый ответ
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: '{"characteristic":"ок"}' } }] }),
      } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await openRouterLlmAdapter.generatePlayerCharacteristic(REQ);
    expect(result.characteristic).toBe("ок");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
