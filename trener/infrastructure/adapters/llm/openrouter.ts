import {
  getAnthropicMaxTokens,
  getAnthropicProxySecret,
  getLlmCallRetries,
  getLlmCallTimeoutMs,
  getOpenRouterApiKey,
  getOpenRouterBaseUrl,
  getOpenRouterModel,
} from "@/config/llm";
import { resilientFetch } from "@/infrastructure/adapters/http/resilient-fetch";
import { getHealthCheckTimeoutMs } from "@/config/health";
import { buildHandAnalysisPrompt, buildHandAnalysisSystemPrompt } from "@/config/prompts/hand-analysis";
import { buildDialogueQuestionPrompt, buildDialogueQuestionSystemPrompt } from "@/config/prompts/dialogue-question";
import { buildVerdictPrompt, buildVerdictSystemPrompt } from "@/config/prompts/verdict";
import { buildChatReplyPrompt, buildChatReplySystemPrompt } from "@/config/prompts/chat-reply";
import { buildTournamentSummaryPrompt, buildTournamentSummarySystemPrompt } from "@/config/prompts/tournament-summary";
import { buildPlayerCharacteristicPrompt, buildPlayerCharacteristicSystemPrompt } from "@/config/prompts/player-characteristic";
import { recordLlmUsage } from "@/features/usage/llm-usage";
import {
  extractJson,
  validateChatReply,
  validateHandAnalysis,
  validateNextQuestion,
  validatePlayerCharacteristic,
  validateTournamentSummary,
  validateVerdict,
} from "./parse";
import type {
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

// Один HTTP-вызов к OpenAI-совместимому API (OpenRouter → DeepSeek) через релей.
// Возвращает {текст ответа, usage}. Сам не парсит — это делает caller с повтором.
async function rawCall(system: string, prompt: string): Promise<{ text: string; usage: Record<string, unknown> }> {
  const headers: Record<string, string> = {
    Authorization: `Bearer ${getOpenRouterApiKey()}`,
    "Content-Type": "application/json",
  };
  // Тот же общий секрет, что и для Anthropic-релея, — защищает релей от посторонних.
  const proxySecret = getAnthropicProxySecret();
  if (proxySecret) headers["x-proxy-secret"] = proxySecret;

  // Устойчивый вызов через релей: таймаут (зависший релей не должен держать лейн воркера
  // ~5 мин — дефолт undici) + быстрый повтор по свежему соединению при временной икоте
  // релея (обрыв/502/504), чтобы разбор не запинался заметно. Полный таймаут не
  // повторяется — уходит наверх, там штатный retry/карантин очереди. См. resilient-fetch.ts.
  const res = await resilientFetch(
    `${getOpenRouterBaseUrl()}/chat/completions`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({
        model: getOpenRouterModel(),
        max_tokens: getAnthropicMaxTokens(),
        messages: [
          { role: "system", content: system },
          { role: "user", content: prompt },
        ],
      }),
    },
    { timeoutMs: getLlmCallTimeoutMs(), retries: getLlmCallRetries(), label: "OpenRouter" },
  );

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`OpenRouter HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const json = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: Record<string, unknown>;
  };
  const text = json.choices?.[0]?.message?.content ?? "";
  if (!text) throw new Error("OpenRouter вернул пустой ответ");
  return { text, usage: json.usage ?? {} };
}

// Вызов с разбором JSON и ОДНИМ повтором при кривом JSON — дешёвые модели изредка
// ломают формат (видели у DeepSeek), повтор гасит разовый сбой, чтобы не ронять разбор.
async function callOpenRouter(
  system: string,
  prompt: string,
  ctx: { step: string; playerId?: string },
): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, usage } = await rawCall(system, prompt);
    if (ctx.playerId) {
      const cached = Number((usage.prompt_tokens_details as { cached_tokens?: number } | undefined)?.cached_tokens ?? 0);
      const promptTokens = Number(usage.prompt_tokens ?? 0);
      await recordLlmUsage({
        playerId: ctx.playerId,
        step: ctx.step,
        model: getOpenRouterModel(),
        usage: {
          inputTokens: Math.max(promptTokens - cached, 0),
          outputTokens: Number(usage.completion_tokens ?? 0),
          cacheWriteTokens: 0,
          cacheReadTokens: cached,
        },
      });
    }
    try {
      return JSON.parse(extractJson(text));
    } catch (e) {
      lastErr = e; // кривой JSON — пробуем ещё раз (вторая попытка)
    }
  }
  throw new Error(`OpenRouter вернул невалидный JSON после повтора: ${(lastErr as Error)?.message ?? ""}`);
}

export const openRouterLlmAdapter: LlmPort = {
  async generateHandAnalysis(request: HandAnalysisRequest, meta?: LlmCallMeta): Promise<HandAnalysisResult> {
    const parsed = await callOpenRouter(buildHandAnalysisSystemPrompt(request.locale), buildHandAnalysisPrompt(request), {
      step: "HAND_ANALYSIS",
      playerId: meta?.playerId,
    });
    return validateHandAnalysis(parsed as Partial<HandAnalysisResult>, request);
  },

  async generateNextQuestion(request: NextQuestionRequest, meta?: LlmCallMeta): Promise<NextQuestionResult> {
    const parsed = await callOpenRouter(buildDialogueQuestionSystemPrompt(request.locale), buildDialogueQuestionPrompt(request), {
      step: "DIALOGUE_QUESTION",
      playerId: meta?.playerId,
    });
    return validateNextQuestion(parsed as Partial<NextQuestionResult>);
  },

  async generateVerdict(request: VerdictRequest, meta?: LlmCallMeta): Promise<VerdictResult> {
    const parsed = await callOpenRouter(buildVerdictSystemPrompt(request.locale), buildVerdictPrompt(request), {
      step: "VERDICT",
      playerId: meta?.playerId,
    });
    return validateVerdict(parsed as Partial<VerdictResult>);
  },

  async generateChatReply(request: ChatReplyRequest, meta?: LlmCallMeta): Promise<ChatReplyResult> {
    const parsed = await callOpenRouter(buildChatReplySystemPrompt(request.locale), buildChatReplyPrompt(request), {
      step: "CHAT_REPLY",
      playerId: meta?.playerId,
    });
    return validateChatReply(parsed as Partial<ChatReplyResult>);
  },

  async generateTournamentSummary(
    request: TournamentSummaryRequest,
    meta?: LlmCallMeta,
  ): Promise<TournamentSummaryResult> {
    const parsed = await callOpenRouter(buildTournamentSummarySystemPrompt(request.locale), buildTournamentSummaryPrompt(request), {
      step: "TOURNAMENT_SUMMARY",
      playerId: meta?.playerId,
    });
    return validateTournamentSummary(parsed as Partial<TournamentSummaryResult>);
  },

  async generatePlayerCharacteristic(
    request: PlayerCharacteristicRequest,
    meta?: LlmCallMeta,
  ): Promise<PlayerCharacteristicResult> {
    const parsed = await callOpenRouter(buildPlayerCharacteristicSystemPrompt(request.locale), buildPlayerCharacteristicPrompt(request), {
      step: "PLAYER_CHARACTERISTIC",
      playerId: meta?.playerId,
    });
    return validatePlayerCharacteristic(parsed as Partial<PlayerCharacteristicResult>);
  },

  // Health-проверка: GET /models тем же путём (через релей), без расхода токенов.
  async ping(): Promise<boolean> {
    try {
      const headers: Record<string, string> = { Authorization: `Bearer ${getOpenRouterApiKey()}` };
      const proxySecret = getAnthropicProxySecret();
      if (proxySecret) headers["x-proxy-secret"] = proxySecret;
      const res = await fetch(`${getOpenRouterBaseUrl()}/models`, {
        headers,
        signal: AbortSignal.timeout(getHealthCheckTimeoutMs()),
      });
      return res.ok;
    } catch {
      return false;
    }
  },
};
