import {
  getDashscopeApiKey,
  getSttBaseUrl,
  getSttEnableItn,
  getSttLanguage,
  getSttModel,
  getSttTimeoutMs,
} from "@/config/stt";
import type { SttPort, TranscribeRequest, TranscribeResult } from "./types";

// Адаптер распознавания речи через Qwen3-ASR-Flash (Alibaba Model Studio / DashScope).
// Звук уезжает в запросе как base64 data-URI — отдельно хостить файл не нужно.
//
// ВНИМАНИЕ: точный формат полей (asr_options сверху vs в parameters, имя поля для
// «контекста») сверяется живым смоук-тестом, когда появится DASHSCOPE_API_KEY.
// Здесь — по документации DashScope на момент написания; при расхождении правится
// только этот файл (порт и эндпоинт не зависят от формы запроса вендора).

const GENERATION_PATH = "/api/v1/services/aigc/multimodal-generation/generation";

type DashscopeContentPart = { text?: string };
type DashscopeResponse = {
  output?: {
    text?: string;
    choices?: Array<{ message?: { content?: DashscopeContentPart[] | string } }>;
  };
};

function buildBody(request: TranscribeRequest): string {
  const dataUri = `data:${request.mimeType};base64,${request.audio.toString("base64")}`;

  // Системное сообщение с «контекстом» (покерный словарь) смещает распознавание —
  // даём только если контекст передан.
  const messages: Array<{ role: string; content: Array<Record<string, string>> }> = [];
  if (request.context) {
    messages.push({ role: "system", content: [{ text: request.context }] });
  }
  messages.push({ role: "user", content: [{ audio: dataUri }] });

  const asrOptions: Record<string, unknown> = { enable_itn: getSttEnableItn() };
  const language = getSttLanguage();
  if (language && language !== "auto") asrOptions.language = language;

  return JSON.stringify({
    model: getSttModel(),
    input: { messages },
    parameters: { asr_options: asrOptions },
  });
}

function extractText(data: DashscopeResponse): string {
  const out = data.output;
  if (!out) throw new Error("Qwen-ASR вернул ответ без output");

  if (typeof out.text === "string") return out.text.trim();

  const content = out.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    const text = content
      .map((part) => part.text ?? "")
      .join("")
      .trim();
    if (text) return text;
  }
  throw new Error("Qwen-ASR вернул ответ без распознанного текста");
}

export const qwenSttAdapter: SttPort = {
  async transcribe(request: TranscribeRequest): Promise<TranscribeResult> {
    const res = await fetch(`${getSttBaseUrl()}${GENERATION_PATH}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${getDashscopeApiKey()}`,
        "Content-Type": "application/json",
      },
      body: buildBody(request),
      signal: AbortSignal.timeout(getSttTimeoutMs()),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Qwen-ASR HTTP ${res.status}: ${detail.slice(0, 300)}`);
    }

    const data = (await res.json()) as DashscopeResponse;
    return { text: extractText(data) };
  },

  // Достижимость DashScope для /api/health: лёгкий запрос к base url. Любой HTTP-ответ
  // означает, что сеть/эндпоинт живы (ключ тут не проверяем — это не должно жечь квоту).
  async ping(): Promise<boolean> {
    try {
      await fetch(getSttBaseUrl(), {
        method: "GET",
        signal: AbortSignal.timeout(getSttTimeoutMs()),
      });
      return true;
    } catch {
      return false;
    }
  },
};
