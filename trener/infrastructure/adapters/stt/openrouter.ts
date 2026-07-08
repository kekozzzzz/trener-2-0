import {
  getOpenrouterApiKey,
  getOpenrouterBaseUrl,
  getOpenrouterModel,
  getSttInstruction,
  getSttProxySecret,
  getSttRetries,
  getSttTimeoutMs,
} from "@/config/stt";
import { resilientFetch } from "@/infrastructure/adapters/http/resilient-fetch";
import type { SttPort, TranscribeRequest, TranscribeResult } from "./types";

// Адаптер распознавания речи через OpenRouter (боевая модель — Voxtral, см.
// config/stt.ts getOpenrouterModel), формат OpenAI-совместимый: POST .../chat/completions
// с частью content типа input_audio (звук base64 + формат). На проде ходим через КЗ-релей
// (адрес и секрет в .env) — прямой доступ к OpenRouter с Yandex Cloud нестабилен.
//
// ВНИМАНИЕ: поле format у input_audio принимает ограниченный набор (wav/mp3/...).
// Браузер пишет webm/opus — принимается ли он, проверяется живым смоук-тестом; если
// нет, конвертируем запись. Правится только этот файл — порт и эндпоинт не зависят.

const CHAT_PATH = "/chat/completions";

// MIME записи браузера → значение поля format у OpenRouter.
function audioFormat(mimeType: string): string {
  const sub = mimeType.split("/")[1]?.split(";")[0]?.trim() ?? "";
  if (sub === "mpeg") return "mp3";
  if (sub === "x-m4a" || sub === "mp4") return "m4a";
  return sub || "webm";
}

type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number };
};

function buildBody(request: TranscribeRequest): string {
  const base64 = request.audio.toString("base64");
  const content: Array<Record<string, unknown>> = [
    { type: "text", text: getSttInstruction() },
    { type: "input_audio", input_audio: { data: base64, format: audioFormat(request.mimeType) } },
  ];

  const messages: Array<{ role: string; content: unknown }> = [];
  // Контекст-словарь как system-подсказка (мягкое смещение к покерным терминам).
  if (request.context) {
    messages.push({ role: "system", content: request.context });
  }
  messages.push({ role: "user", content });

  // usage.include — OpenRouter вернёт фактическую цену вызова (usage.cost, USD):
  // у аудио своя тарификация, точнее самим не посчитать. Учёт в LlmUsage.
  return JSON.stringify({ model: getOpenrouterModel(), messages, usage: { include: true } });
}

function extractText(data: ChatResponse): string {
  const content = data.choices?.[0]?.message?.content;
  if (typeof content !== "string" || !content.trim()) {
    throw new Error("OpenRouter вернул ответ без распознанного текста");
  }
  return content.trim();
}

function buildHeaders(): Record<string, string> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getOpenrouterApiKey()}`,
    "Content-Type": "application/json",
  };
  const secret = getSttProxySecret();
  if (secret) headers["x-proxy-secret"] = secret;
  return headers;
}

export const openrouterSttAdapter: SttPort = {
  async transcribe(request: TranscribeRequest): Promise<TranscribeResult> {
    // Таймаут + быстрый повтор при временной икоте релея (обрыв/502/504): голос
    // интерактивен, разовый сбой релея не должен зажигать красную ошибку у микрофона.
    // Полный таймаут не повторяется — уходит наверх. См. resilient-fetch.ts.
    const res = await resilientFetch(
      `${getOpenrouterBaseUrl()}${CHAT_PATH}`,
      {
        method: "POST",
        headers: buildHeaders(),
        body: buildBody(request),
      },
      { timeoutMs: getSttTimeoutMs(), retries: getSttRetries(), label: "STT" },
    );

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenRouter HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }

    const data = (await res.json()) as ChatResponse;
    return {
      text: extractText(data),
      model: getOpenrouterModel(),
      usage: data.usage
        ? {
            inputTokens: data.usage.prompt_tokens ?? 0,
            outputTokens: data.usage.completion_tokens ?? 0,
            costUsd: typeof data.usage.cost === "number" ? data.usage.cost : undefined,
          }
        : undefined,
    };
  },

  // Достижимость для /api/health: лёгкий GET списка моделей через тот же путь/секрет.
  // Любой ответ = маршрут жив (ключ тут не проверяем, квоту не жжём).
  async ping(): Promise<boolean> {
    try {
      const headers: Record<string, string> = {};
      const secret = getSttProxySecret();
      if (secret) headers["x-proxy-secret"] = secret;
      await fetch(`${getOpenrouterBaseUrl()}/models`, {
        method: "GET",
        headers,
        signal: AbortSignal.timeout(getSttTimeoutMs()),
      });
      return true;
    } catch {
      return false;
    }
  },
};
