import Anthropic from "@anthropic-ai/sdk";
import { ProxyAgent } from "undici";
import {
  getAnthropicApiKey,
  getAnthropicBaseUrl,
  getAnthropicMaxTokens,
  getAnthropicModel,
  getAnthropicProxySecret,
  getAnthropicProxyUrl,
  getLlmCallTimeoutMs,
  getLlmCallRetries,
} from "@/config/llm";
import { getHealthCheckTimeoutMs } from "@/config/health";
import { buildHandAnalysisPrompt, buildHandAnalysisSystemPrompt } from "@/config/prompts/hand-analysis";
import { buildDialogueQuestionPrompt, buildDialogueQuestionSystemPrompt } from "@/config/prompts/dialogue-question";
import { buildVerdictPrompt, buildVerdictSystemPrompt } from "@/config/prompts/verdict";
import { buildChatReplyPrompt, buildChatReplySystemPrompt } from "@/config/prompts/chat-reply";
import { buildTournamentSummaryPrompt, buildTournamentSummarySystemPrompt } from "@/config/prompts/tournament-summary";
import { buildPlayerCharacteristicPrompt, buildPlayerCharacteristicSystemPrompt } from "@/config/prompts/player-characteristic";
import { buildCoachNotesPrompt, buildCoachNotesSystemPrompt } from "@/config/prompts/coach-notes";
import { recordLlmUsage } from "@/features/usage/llm-usage";
import { validateCoachNotes,
  allowedCardSet,
  extractJson,
  validateChatReply,
  validateHandAnalysis,
  validateNextQuestion,
  validatePlayerCharacteristic,
  validateTournamentSummary,
  validateVerdict,
} from "./parse";
import type {
  CoachNotesRequest,
  CoachNotesResult,
  ChatReplyRequest,
  ChatReplyResult,
  HandAnalysisRequest,
  HandAnalysisResult,
  LlmCallMeta,
  LlmPort,
  NextQuestionRequest,
  NextQuestionResult,
  PlayerCharacteristicRequest,
  PlayerCharacteristicResult,
  TournamentSummaryRequest,
  TournamentSummaryResult,
  VerdictRequest,
  VerdictResult,
} from "./types";

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
    //
    // ⚠️ Таймаут ОБЯЗАТЕЛЕН (симметрично OpenRouter, resilient-fetch.ts). Без него у SDK
    // дефолт ~10 мин НА ПОПЫТКУ: зависший релей держит лейн воркера десятки минут, а жнец
    // не подберёт его, пока идёт прогон (single-flight, kick.ts). Это запасной провайдер —
    // включается ровно когда OpenRouter лёг, т.е. в момент, когда релей и так под стрессом.
    // timeout — предел ОДНОЙ попытки; maxRetries из конфига (было жёстко 5 → худшие ~час).
    options.timeout = getLlmCallTimeoutMs();
    options.maxRetries = getLlmCallRetries();
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
  temperature?: number,
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
    // Низкая температура числочувствительным ролям — чтобы модель копировала факты парсера, а не
    // досэмпливала числа (см. openrouter.ts TEMP_PRECISE/TEMP_DIALOGUE). undefined = дефолт SDK.
    ...(temperature !== undefined ? { temperature } : {}),
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

// Температура по ролям (как в openrouter.ts): числочувствительным — низкая, диалогу/чату — повыше.
const TEMP_PRECISE = 0.3;
const TEMP_DIALOGUE = 0.6;

export const anthropicLlmAdapter: LlmPort = {
  async generateHandAnalysis(request: HandAnalysisRequest, meta?: LlmCallMeta): Promise<HandAnalysisResult> {
    const parsed = await callClaude(buildHandAnalysisSystemPrompt(request.locale), buildHandAnalysisPrompt(request), {
      step: "HAND_ANALYSIS",
      playerId: meta?.playerId,
    }, TEMP_PRECISE);
    return validateHandAnalysis(parsed as Partial<HandAnalysisResult>, request);
  },

  async generateNextQuestion(request: NextQuestionRequest, meta?: LlmCallMeta): Promise<NextQuestionResult> {
    const parsed = await callClaude(buildDialogueQuestionSystemPrompt(request.locale), buildDialogueQuestionPrompt(request), {
      step: "DIALOGUE_QUESTION",
      playerId: meta?.playerId,
    }, TEMP_DIALOGUE);
    return validateNextQuestion(parsed as Partial<NextQuestionResult>, request.locale, allowedCardSet(request.tableSnapshot));
  },

  async generateVerdict(request: VerdictRequest, meta?: LlmCallMeta): Promise<VerdictResult> {
    const parsed = await callClaude(buildVerdictSystemPrompt(request.locale), buildVerdictPrompt(request), {
      step: "VERDICT",
      playerId: meta?.playerId,
    }, TEMP_PRECISE);
    return validateVerdict(parsed as Partial<VerdictResult>, request.locale, allowedCardSet(request.tableSnapshot));
  },

  async generateChatReply(request: ChatReplyRequest, meta?: LlmCallMeta): Promise<ChatReplyResult> {
    const parsed = await callClaude(buildChatReplySystemPrompt(request.locale), buildChatReplyPrompt(request), {
      step: "CHAT_REPLY",
      playerId: meta?.playerId,
    }, TEMP_DIALOGUE);
    return validateChatReply(parsed as Partial<ChatReplyResult>, request.locale, allowedCardSet(request.tableSnapshot));
  },

  async generateTournamentSummary(
    request: TournamentSummaryRequest,
    meta?: LlmCallMeta,
  ): Promise<TournamentSummaryResult> {
    const parsed = await callClaude(buildTournamentSummarySystemPrompt(request.locale), buildTournamentSummaryPrompt(request), {
      step: "TOURNAMENT_SUMMARY",
      playerId: meta?.playerId,
    }, TEMP_PRECISE);
    return validateTournamentSummary(parsed as Partial<TournamentSummaryResult>, request.locale);
  },

  async generateCoachNotes(request: CoachNotesRequest, meta?: LlmCallMeta): Promise<CoachNotesResult> {
    const parsed = await callClaude(buildCoachNotesSystemPrompt(request.maxNotes), buildCoachNotesPrompt(request), {
      step: "COACH_NOTES",
      playerId: meta?.playerId,
    }, TEMP_PRECISE);
    return validateCoachNotes(parsed as { notes?: unknown });
  },

  async generatePlayerCharacteristic(
    request: PlayerCharacteristicRequest,
    meta?: LlmCallMeta,
  ): Promise<PlayerCharacteristicResult> {
    const parsed = await callClaude(buildPlayerCharacteristicSystemPrompt(request.locale), buildPlayerCharacteristicPrompt(request), {
      step: "PLAYER_CHARACTERISTIC",
      playerId: meta?.playerId,
    }, TEMP_PRECISE);
    return validatePlayerCharacteristic(parsed as Partial<PlayerCharacteristicResult>, request.locale);
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
