/**
 * Тесты STT-адаптера OpenRouter (infrastructure/adapters/stt/openrouter) —
 * боевой путь распознавания речи через КЗ-релей.
 *
 * Покрывают:
 *  1. transcribe шлёт POST на /api/v1/chat/completions: Authorization, x-proxy-secret,
 *     тело (model, аудио как input_audio с base64+format, контекст как system).
 *  2. Разбор ответа choices[].message.content.
 *  3. Ответ не-2xx → бросает.
 *  4. index предпочитает openrouter при наличии OPENROUTER_API_KEY.
 *
 * Сеть не трогаем — global.fetch замокан.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { openrouterSttAdapter } from "@/infrastructure/adapters/stt/openrouter";
import { getSttAdapter } from "@/infrastructure/adapters/stt";

const ENV_KEYS = [
  "OPENROUTER_API_KEY",
  "OPENROUTER_BASE_URL",
  "STT_PROXY_SECRET",
  "STT_MODEL",
  "DASHSCOPE_API_KEY",
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.OPENROUTER_API_KEY = "or-key";
  process.env.OPENROUTER_BASE_URL = "https://relay.example/openrouter";
  process.env.STT_PROXY_SECRET = "secret123";
  delete process.env.STT_MODEL;
  delete process.env.DASHSCOPE_API_KEY;
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const REQ = {
  audio: Buffer.from("аудио-байты"),
  mimeType: "audio/webm;codecs=opus",
  context: "Покерные термины: олл-ин",
};

describe("openrouterSttAdapter.transcribe", () => {
  it("шлёт корректный chat/completions с ключом, секретом релея и аудио", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: " распознанный текст " } }] }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await openrouterSttAdapter.transcribe(REQ);
    expect(result.text).toBe("распознанный текст");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://relay.example/openrouter/api/v1/chat/completions");
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer or-key");
    expect(init.headers["x-proxy-secret"]).toBe("secret123");

    const body = JSON.parse(init.body);
    expect(body.model).toBe("mistralai/voxtral-small-24b-2507");
    // system — контекст-словарь, user — инструкция + аудио.
    expect(body.messages[0]).toEqual({ role: "system", content: REQ.context });
    expect(body.messages[1].content[0].type).toBe("text");
    const audioPart = body.messages[1].content[1];
    expect(audioPart.type).toBe("input_audio");
    expect(audioPart.input_audio.format).toBe("webm");
    expect(Buffer.from(audioPart.input_audio.data, "base64").toString()).toBe("аудио-байты");
  });

  it("не шлёт x-proxy-secret, если секрет не задан (прямой путь)", async () => {
    delete process.env.STT_PROXY_SECRET;
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "ок" } }] }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await openrouterSttAdapter.transcribe(REQ);
    expect(fetchMock.mock.calls[0][1].headers["x-proxy-secret"]).toBeUndefined();
  });

  it("ответ не-2xx → бросает", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 402,
      text: async () => "insufficient credits",
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(openrouterSttAdapter.transcribe(REQ)).rejects.toThrow(/HTTP 402/);
  });

  it("getSttAdapter предпочитает openrouter при наличии ключа", () => {
    expect(getSttAdapter()).toBe(openrouterSttAdapter);
  });
});
