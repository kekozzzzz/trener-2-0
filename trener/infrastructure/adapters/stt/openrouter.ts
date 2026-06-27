import {
  getOpenrouterApiKey,
  getOpenrouterBaseUrl,
  getOpenrouterModel,
  getSttInstruction,
  getSttProxySecret,
  getSttTimeoutMs,
} from "@/config/stt";
import type { SttPort, TranscribeRequest, TranscribeResult } from "./types";

// Адаптер распознавания речи через OpenRouter (модель qwen3-asr-flash), формат
// OpenAI-совместимый: POST /api/v1/chat/completions с частью content типа
// input_audio (звук base64 + формат). На проде ходим через КЗ-релей (адрес и секрет
// в .env) — прямой доступ к OpenRouter с Yandex Cloud нестабилен.
//
// ВНИМАНИЕ: поле format у input_audio принимает ограниченный набор (wav/mp3/...).
// Браузер пишет webm/opus — принимается ли он, проверяется живым смоук-тестом; если
// нет, конвертируем запись. Правится только этот файл — порт и эндпоинт не зависят.

const CHAT_PATH = "/api/v1/chat/completions";

// MIME записи браузера → значение поля format у OpenRouter.
function audioFormat(mimeType: string): string {
  const sub = mimeType.split("/")[1]?.split(";")[0]?.trim() ?? "";
  if (sub === "mpeg") return "mp3";
  if (sub === "x-m4a" || sub === "mp4") return "m4a";
  return sub || "webm";
}

type ChatResponse = {
  choices?: Array<{ message?: { content?: string } }>;
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

  return JSON.stringify({ model: getOpenrouterModel(), messages });
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
    const res = await fetch(`${getOpenrouterBaseUrl()}${CHAT_PATH}`, {
      method: "POST",
      headers: buildHeaders(),
      body: buildBody(request),
      signal: AbortSignal.timeout(getSttTimeoutMs()),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`OpenRouter HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }

    const data = (await res.json()) as ChatResponse;
    return { text: extractText(data) };
  },

  // Достижимость для /api/health: лёгкий GET списка моделей через тот же путь/секрет.
  // Любой ответ = маршрут жив (ключ тут не проверяем, квоту не жжём).
  async ping(): Promise<boolean> {
    try {
      const headers: Record<string, string> = {};
      const secret = getSttProxySecret();
      if (secret) headers["x-proxy-secret"] = secret;
      await fetch(`${getOpenrouterBaseUrl()}/api/v1/models`, {
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
