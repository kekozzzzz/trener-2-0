/**
 * Тесты STT-адаптера Qwen3-ASR (infrastructure/adapters/stt/qwen).
 *
 * Покрывают:
 *  1. transcribe шлёт POST на DashScope: верный URL, заголовок Authorization,
 *     тело (model, аудио как base64 data-URI, контекст как system-сообщение,
 *     asr_options.enable_itn/language).
 *  2. Разбор ответа в обеих формах (output.choices[].message.content и output.text).
 *  3. Ответ не-2xx → бросает.
 *  4. index выбирает фейк без ключа и qwen с ключом.
 *
 * Сеть не трогаем — global.fetch замокан.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { qwenSttAdapter } from "@/infrastructure/adapters/stt/qwen";
import { fakeSttAdapter } from "@/infrastructure/adapters/stt/fake";
import { getSttAdapter } from "@/infrastructure/adapters/stt";

const ENV_KEYS = [
  "DASHSCOPE_API_KEY",
  "OPENROUTER_API_KEY",
  "STT_BASE_URL",
  "STT_LANGUAGE",
  "STT_ENABLE_ITN",
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  // OpenRouter в этих тестах не должен перебивать выбор qwen-адаптера.
  delete process.env.OPENROUTER_API_KEY;
  process.env.DASHSCOPE_API_KEY = "test-key";
  process.env.STT_BASE_URL = "https://dashscope-intl.aliyuncs.com";
  process.env.STT_LANGUAGE = "ru";
  process.env.STT_ENABLE_ITN = "true";
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
  mimeType: "audio/webm",
  context: "Покерные термины: олл-ин, катофф",
};

describe("qwenSttAdapter.transcribe", () => {
  it("шлёт корректный запрос на DashScope с ключом, аудио и контекстом", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ output: { choices: [{ message: { content: [{ text: "распознано" }] } }] } }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await qwenSttAdapter.transcribe(REQ);
    expect(result.text).toBe("распознано");

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(
      "https://dashscope-intl.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation",
    );
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toBe("Bearer test-key");

    const body = JSON.parse(init.body);
    expect(body.model).toBe("qwen3-asr-flash");
    expect(body.parameters.asr_options).toEqual({ enable_itn: true, language: "ru" });

    const messages = body.input.messages;
    expect(messages[0]).toEqual({ role: "system", content: [{ text: REQ.context }] });
    const audioPart = messages[1].content[0].audio as string;
    expect(audioPart.startsWith("data:audio/webm;base64,")).toBe(true);
    // base64 — это исходные байты аудио.
    const b64 = audioPart.split(",")[1];
    expect(Buffer.from(b64, "base64").toString()).toBe("аудио-байты");
  });

  it("разбирает ответ в форме output.text", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ output: { text: "  привет  " } }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    const result = await qwenSttAdapter.transcribe(REQ);
    expect(result.text).toBe("привет");
  });

  it("не шлёт system-сообщение, если контекст не передан", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ output: { text: "ок" } }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await qwenSttAdapter.transcribe({ audio: Buffer.from("x"), mimeType: "audio/webm" });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.input.messages).toHaveLength(1);
    expect(body.input.messages[0].role).toBe("user");
  });

  it("ответ не-2xx → бросает", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      text: async () => "unauthorized",
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(qwenSttAdapter.transcribe(REQ)).rejects.toThrow(/HTTP 401/);
  });

  it("опускает language при auto", async () => {
    process.env.STT_LANGUAGE = "auto";
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ output: { text: "ок" } }),
    } as Response);
    vi.stubGlobal("fetch", fetchMock);

    await qwenSttAdapter.transcribe(REQ);
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body.parameters.asr_options).toEqual({ enable_itn: true });
  });
});

describe("getSttAdapter", () => {
  it("без ключа возвращает фейк", () => {
    delete process.env.DASHSCOPE_API_KEY;
    expect(getSttAdapter()).toBe(fakeSttAdapter);
  });

  it("с ключом возвращает qwen", () => {
    process.env.DASHSCOPE_API_KEY = "test-key";
    expect(getSttAdapter()).toBe(qwenSttAdapter);
  });
});
