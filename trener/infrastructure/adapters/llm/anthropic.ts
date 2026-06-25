import Anthropic from "@anthropic-ai/sdk";
import { ProxyAgent } from "undici";
import {
  getAnthropicApiKey,
  getAnthropicBaseUrl,
  getAnthropicMaxTokens,
  getAnthropicModel,
  getAnthropicProxySecret,
  getAnthropicProxyUrl,
} from "@/config/llm";
import { getHealthCheckTimeoutMs } from "@/config/health";
import { buildHandAnalysisPrompt, HAND_ANALYSIS_SYSTEM_PROMPT } from "@/config/prompts/hand-analysis";
import { buildDialogueQuestionPrompt, DIALOGUE_QUESTION_SYSTEM_PROMPT } from "@/config/prompts/dialogue-question";
import { buildVerdictPrompt, VERDICT_SYSTEM_PROMPT } from "@/config/prompts/verdict";
import { buildChatReplyPrompt, CHAT_REPLY_SYSTEM_PROMPT } from "@/config/prompts/chat-reply";
import { buildTournamentSummaryPrompt, TOURNAMENT_SUMMARY_SYSTEM_PROMPT } from "@/config/prompts/tournament-summary";
import { recordLlmUsage } from "@/features/usage/llm-usage";
import type {
  ChatReplyRequest,
  ChatReplyResult,
  HandAnalysisRequest,
  HandAnalysisResult,
  LlmCallMeta,
  LlmPort,
  NextQuestionRequest,
  NextQuestionResult,
  TournamentSummaryRequest,
  TournamentSummaryResult,
  VerdictRequest,
  VerdictResult,
} from "./types";

// Claude иногда оборачивает JSON в markdown-код-блок несмотря на инструкцию — снимаем его.
function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return (fenced ? fenced[1] : text).trim();
}

function validate(result: Partial<HandAnalysisResult>, request: HandAnalysisRequest): HandAnalysisResult {
  if (typeof result.played !== "string" || typeof result.optimal !== "string") {
    throw new Error("Claude вернул разбор без обязательных полей played/optimal");
  }

  if (request.importanceLevel === "CRITICAL") {
    if (typeof result.question !== "string" || typeof result.draftVerdict !== "string") {
      throw new Error("Claude вернул CRITICAL-разбор без question/draftVerdict");
    }
    return { played: result.played, optimal: result.optimal, question: result.question, draftVerdict: result.draftVerdict };
  }

  if (typeof result.note !== "string") {
    throw new Error(`Claude вернул ${request.importanceLevel}-разбор без note`);
  }
  return { played: result.played, optimal: result.optimal, note: result.note };
}

function validateVerdict(result: Partial<VerdictResult>): VerdictResult {
  if (typeof result.verdict !== "string") {
    throw new Error("Claude вернул вердикт без поля verdict");
  }
  return { verdict: result.verdict };
}

function validateNextQuestion(result: Partial<NextQuestionResult>): NextQuestionResult {
  if (typeof result.question !== "string") {
    throw new Error("Claude вернул ответ без поля question");
  }
  return { question: result.question };
}

function validateChatReply(result: Partial<ChatReplyResult>): ChatReplyResult {
  if (typeof result.reply !== "string") {
    throw new Error("Claude вернул ответ без поля reply");
  }
  return { reply: result.reply };
}

function validateTournamentSummary(result: Partial<TournamentSummaryResult>): TournamentSummaryResult {
  if (typeof result.overview !== "string" || !Array.isArray(result.moments)) {
    throw new Error("Claude вернул обзор турнира без overview/moments");
  }
  // Берём только корректные моменты (число hand + строка label); индекс в диапазон
  // раздач проверяет шаг очереди при мапинге index→handId.
  const moments = result.moments.filter(
    (m): m is { hand: number; label: string } =>
      typeof m?.hand === "number" && Number.isInteger(m.hand) && typeof m?.label === "string"
  );
  return { overview: result.overview, moments };
}

// CONNECT-прокси для обхода гео-блокировки Claude (см. getAnthropicProxyUrl).
// Логин/пароль (если заданы в URL) уходят в заголовок Proxy-Authorization;
// сам uri передаём без них, чтобы не зависеть от того, как разбирает userinfo undici.
function buildProxyDispatcher(proxyUrl: string): ProxyAgent {
  const url = new URL(proxyUrl);
  const uri = `${url.protocol}//${url.host}`;
  if (url.username || url.password) {
    const creds = `${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`;
    const token = `Basic ${Buffer.from(creds).toString("base64")}`;
    return new ProxyAgent({ uri, token });
  }
  return new ProxyAgent({ uri });
}

// Клиент строим один раз: ключ и адрес прокси берутся из окружения процесса
// и в рантайме не меняются. ProxyAgent тоже переиспользуем (пул соединений).
let cachedClient: Anthropic | null = null;

function getClient(): Anthropic {
  if (cachedClient) return cachedClient;

  const options: ConstructorParameters<typeof Anthropic>[0] = { apiKey: getAnthropicApiKey() };

  // Вариант 1 — наш HTTPS-релей (nginx-шлюз на VPS в Казахстане): SDK шлёт запросы на
  // baseURL, релей пересылает их к Anthropic с не-российского IP (снимает гео-блок 403).
  // Секрет подписывает запрос, чтобы релей не был открытым. Сертификат релея самоподписанный —
  // доверяем именно ему (пиннинг через ANTHROPIC_PROXY_CA), не отключая проверку TLS.
  const baseUrl = getAnthropicBaseUrl();
  if (baseUrl) {
    options.baseURL = baseUrl;
    // Доверие к самоподписанному сертификату релея задаётся переменной окружения
    // NODE_EXTRA_CA_CERTS (путь к cert.pem) — её читает встроенный в Node fetch.
    // Свой undici-Agent сюда НЕ передаём: версия пакета undici в проекте не совпадает
    // со встроенной в Node, и передача Agent в глобальный fetch валит каждый вызов
    // (UND_ERR_INVALID_ARG: invalid onRequestStart method).
    options.maxRetries = 5;
    const proxySecret = getAnthropicProxySecret();
    if (proxySecret) {
      options.defaultHeaders = { "x-proxy-secret": proxySecret };
    }
  }

  // Вариант 2 — CONNECT-прокси (туннель к зарубежному VPS). Оставлен как запасной путь.
  const proxyUrl = getAnthropicProxyUrl();
  if (proxyUrl) {
    options.fetchOptions = {
      dispatcher: buildProxyDispatcher(proxyUrl),
    } as unknown as typeof options.fetchOptions;
  }

  cachedClient = new Anthropic(options);
  return cachedClient;
}

async function callClaude(
  system: string,
  prompt: string,
  ctx: { step: string; playerId?: string },
): Promise<unknown> {
  const client = getClient();

  // Кэшируем системный промпт (тренерский «мозг», ~3000 токенов). При загрузке турнира
  // 10 разборов раздач идут подряд с одним и тем же system — первый пишет кэш (1.25×),
  // остальные читают почти даром (0.1×), это режет вход примерно на треть. На счёт и
  // скорость влияет, на ответы модели — нет. Изменчивые данные лежат в user-сообщении
  // ПОСЛЕ system, поэтому кэш системного префикса они не инвалидируют.
  const message = await client.messages.create({
    model: getAnthropicModel(),
    max_tokens: getAnthropicMaxTokens(),
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: prompt }],
  });

  // Учёт расхода (вторично — recordLlmUsage не бросает): берём реальный usage из ответа,
  // включая токены записи/чтения кэша, чтобы потом честно посчитать «кэш-нетто».
  if (ctx.playerId) {
    await recordLlmUsage({
      playerId: ctx.playerId,
      step: ctx.step,
      model: getAnthropicModel(),
      usage: {
        inputTokens: message.usage.input_tokens ?? 0,
        outputTokens: message.usage.output_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
      },
    });
  }

  const textBlock = message.content.find((block) => block.type === "text");
  if (!textBlock || textBlock.type !== "text") {
    throw new Error("Claude вернул ответ без текстового блока");
  }

  try {
    return JSON.parse(extractJson(textBlock.text));
  } catch {
    throw new Error("Claude вернул невалидный JSON");
  }
}

export const anthropicLlmAdapter: LlmPort = {
  async generateHandAnalysis(request: HandAnalysisRequest, meta?: LlmCallMeta): Promise<HandAnalysisResult> {
    const parsed = await callClaude(HAND_ANALYSIS_SYSTEM_PROMPT, buildHandAnalysisPrompt(request), {
      step: "HAND_ANALYSIS",
      playerId: meta?.playerId,
    });
    return validate(parsed as Partial<HandAnalysisResult>, request);
  },

  async generateNextQuestion(request: NextQuestionRequest, meta?: LlmCallMeta): Promise<NextQuestionResult> {
    const parsed = await callClaude(DIALOGUE_QUESTION_SYSTEM_PROMPT, buildDialogueQuestionPrompt(request), {
      step: "DIALOGUE_QUESTION",
      playerId: meta?.playerId,
    });
    return validateNextQuestion(parsed as Partial<NextQuestionResult>);
  },

  async generateVerdict(request: VerdictRequest, meta?: LlmCallMeta): Promise<VerdictResult> {
    const parsed = await callClaude(VERDICT_SYSTEM_PROMPT, buildVerdictPrompt(request), {
      step: "VERDICT",
      playerId: meta?.playerId,
    });
    return validateVerdict(parsed as Partial<VerdictResult>);
  },

  async generateChatReply(request: ChatReplyRequest, meta?: LlmCallMeta): Promise<ChatReplyResult> {
    const parsed = await callClaude(CHAT_REPLY_SYSTEM_PROMPT, buildChatReplyPrompt(request), {
      step: "CHAT_REPLY",
      playerId: meta?.playerId,
    });
    return validateChatReply(parsed as Partial<ChatReplyResult>);
  },

  async generateTournamentSummary(
    request: TournamentSummaryRequest,
    meta?: LlmCallMeta,
  ): Promise<TournamentSummaryResult> {
    const parsed = await callClaude(TOURNAMENT_SUMMARY_SYSTEM_PROMPT, buildTournamentSummaryPrompt(request), {
      step: "TOURNAMENT_SUMMARY",
      playerId: meta?.playerId,
    });
    return validateTournamentSummary(parsed as Partial<TournamentSummaryResult>);
  },

  // Проверка доступности Claude для /api/health: GET /v1/models тем же клиентом
  // (тот же baseURL/релей, заголовок x-proxy-secret и доверие серту через
  // NODE_EXTRA_CA_CERTS), что и боевые вызовы — но без расхода токенов. maxRetries:0 —
  // на health ждать незачем. НЕ бросает: ошибку гасим в false.
  async ping(): Promise<boolean> {
    try {
      await getClient().models.list({ limit: 1 }, { timeout: getHealthCheckTimeoutMs(), maxRetries: 0 });
      return true;
    } catch {
      return false;
    }
  },
};
