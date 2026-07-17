import {
  getAnthropicMaxTokens,
  getAnthropicProxySecret,
  getLlmCallRetries,
  getLlmCallTimeoutMs,
  getOpenRouterApiKey,
  getOpenRouterBaseUrl,
  getOpenRouterModel,
  getOpenRouterReasoning,
} from "@/config/llm";
import { resilientFetch } from "@/infrastructure/adapters/http/resilient-fetch";
import { heroFirstPostflop } from "@/parser/action-order";
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
  heroSuitFixMap,
  extractJson,
  validateChatReply,
  validateHandAnalysis,
  validateNextQuestion,
  validatePlayerCharacteristic,
  validateTournamentSummary,
  validateVerdict,
  noShowdownInHand,
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

// Один HTTP-вызов к OpenAI-совместимому API (OpenRouter → DeepSeek) через релей.
// Возвращает {текст ответа, usage}. Сам не парсит — это делает caller с повтором.
// Режим размышления можно переопределить на вызов (гибрид: CRITICAL-разборы и диалог считаются с
// reasoning low ради качества, обычные note-разборы — по дефолту off ради скорости). undefined = дефолт.
type Reasoning = { enabled: false } | { effort: string };
async function rawCall(
  system: string,
  prompt: string,
  reasoning?: Reasoning,
  temperature?: number,
): Promise<{ text: string; usage: Record<string, unknown>; finishReason: string; providerError: string }> {
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
        // Температура сэмплинга: числочувствительным ролям (разбор/вердикт/сводка) даём НИЗКУЮ —
        // тогда самый вероятный токен обычно «скопировать факт парсера», а не досэмплить выдуманный
        // процент; диалогу/чату оставляем повыше ради живости формулировок. undefined = дефолт модели.
        ...(temperature !== undefined ? { temperature } : {}),
        // Думающие модели (GLM-5.2) без явного режима тратят бюджет токенов на
        // рассуждения и возвращают обрезанный/пустой content. Режим — из env
        // (OPENROUTER_REASONING, дефолт off: латентность как у v3.2 по замеру
        // 2026-07-11). Модели без reasoning (DeepSeek V3.2) параметр игнорируют.
        // Override на вызов (гибрид CRITICAL→low) имеет приоритет над env-дефолтом.
        reasoning: reasoning ?? getOpenRouterReasoning(),
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
    choices?: { message?: { content?: string }; finish_reason?: string; error?: { message?: string } }[];
    usage?: Record<string, unknown>;
  };
  const choice = json.choices?.[0];
  // finish_reason обязателен для диагноза: провайдер отдаёт HTTP 200 и ЧАСТИЧНЫЙ текст, когда
  // апстрим (Gemini) рвёт SSE-стрим на середине («JSON error injected into SSE stream») или
  // ответ упёрся в max_tokens. Без этой проверки обрезок уходил в JSON.parse и падал с враньём
  // «модель вернула невалидный JSON» — на деле модель отвечала нормально, её оборвали.
  return {
    text: choice?.message?.content ?? "",
    usage: json.usage ?? {},
    finishReason: choice?.finish_reason ?? "",
    providerError: choice?.error?.message ?? "",
  };
}

// Вызов с разбором JSON и ОДНИМ повтором при кривом JSON — дешёвые модели изредка
// ломают формат (видели у DeepSeek), повтор гасит разовый сбой, чтобы не ронять разбор.
async function callOpenRouter(
  system: string,
  prompt: string,
  ctx: { step: string; playerId?: string },
  reasoning?: Reasoning,
  temperature?: number,
): Promise<unknown> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    const { text, usage, finishReason, providerError } = await rawCall(system, prompt, reasoning, temperature);
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
    // Ответ оборван — парсить обрезок бессмысленно, сразу вторая попытка (текст в лог честный:
    // это НЕ «модель не умеет JSON», а обрыв генерации; "length" = упёрлись в max_tokens и
    // лечится ANTHROPIC_MAX_TOKENS без передеплоя, "error" = сбой апстрима, лечится повтором).
    if (finishReason === "error" || finishReason === "length" || !text) {
      lastErr = new Error(
        `ответ оборван (finish_reason=${finishReason || "пусто"}${providerError ? `, провайдер: ${providerError}` : ""})`,
      );
      continue;
    }
    try {
      return JSON.parse(extractJson(text));
    } catch (e) {
      lastErr = e; // кривой JSON — пробуем ещё раз (вторая попытка)
    }
  }
  throw new Error(`OpenRouter не дал валидный ответ после повтора: ${(lastErr as Error)?.message ?? ""}`);
}

// Гибрид размышления ОТКАЧЕН 2026-07-14 (инцидент карантина на проде). reasoning low режет
// смысловые галлюцинации, НО на GLM-5.2 латентность CRITICAL-разбора (тяжёлый промпт фактов-v2 +
// размышление) вылетала за 90с → RelayTimeoutError → карантин GENERATE_HAND_ANALYSIS. Ждать 90-120с
// живому игроку недопустимо (скорость — приоритет продукта). Все роли вернулись на env-дефолт (off,
// ~8-9с). Галлюцинации теперь гасит детерминизация Правила 1 v2: парсер сам считает то, на чём модель
// раньше ошибалась, — размышление во многом дублирует эту работу. ВЕРНУТЬ гибрид можно, когда в
// мониторинге моделей (plans/2026-07-14-мониторинг-моделей.md) найдётся БЫСТРАЯ думающая модель:
// восстановить const REASONING_LOW = { effort: "low" } и передать его 4-м аргументом в нужные роли.

// Температура сэмплинга по ролям (P0 против галлюцинаций 2026-07-14): числочувствительным ролям
// (разбор/вердикт/сводка/заметки/характеристика) — НИЗКАЯ, тогда самый вероятный токен обычно
// «скопировать факт парсера», а не досэмплить выдуманный процент; диалогу и чату — повыше ради
// живости вопросов. Значения стабильны, env-переопределения не заводим.
const TEMP_PRECISE = 0.3;
const TEMP_DIALOGUE = 0.6;

export const openRouterLlmAdapter: LlmPort = {
  async generateHandAnalysis(request: HandAnalysisRequest, meta?: LlmCallMeta): Promise<HandAnalysisResult> {
    const parsed = await callOpenRouter(
      buildHandAnalysisSystemPrompt(request.locale),
      buildHandAnalysisPrompt(request),
      { step: "HAND_ANALYSIS", playerId: meta?.playerId },
      undefined,
      TEMP_PRECISE,
    );
    return validateHandAnalysis(parsed as Partial<HandAnalysisResult>, request);
  },

  async generateNextQuestion(request: NextQuestionRequest, meta?: LlmCallMeta): Promise<NextQuestionResult> {
    const parsed = await callOpenRouter(
      buildDialogueQuestionSystemPrompt(request.locale),
      buildDialogueQuestionPrompt(request),
      { step: "DIALOGUE_QUESTION", playerId: meta?.playerId },
      undefined,
      TEMP_DIALOGUE,
    );
    return validateNextQuestion(parsed as Partial<NextQuestionResult>, request.locale, allowedCardSet(request.tableSnapshot), heroSuitFixMap(request.tableSnapshot), heroFirstPostflop(request.tableSnapshot));
  },

  async generateVerdict(request: VerdictRequest, meta?: LlmCallMeta): Promise<VerdictResult> {
    const parsed = await callOpenRouter(
      buildVerdictSystemPrompt(request.locale),
      buildVerdictPrompt(request),
      { step: "VERDICT", playerId: meta?.playerId },
      undefined,
      TEMP_PRECISE,
    );
    return validateVerdict(parsed as Partial<VerdictResult>, request.locale, allowedCardSet(request.tableSnapshot), heroSuitFixMap(request.tableSnapshot), heroFirstPostflop(request.tableSnapshot), noShowdownInHand(request.tableSnapshot));
  },

  async generateChatReply(request: ChatReplyRequest, meta?: LlmCallMeta): Promise<ChatReplyResult> {
    const parsed = await callOpenRouter(
      buildChatReplySystemPrompt(request.locale),
      buildChatReplyPrompt(request),
      { step: "CHAT_REPLY", playerId: meta?.playerId },
      undefined,
      TEMP_DIALOGUE,
    );
    return validateChatReply(parsed as Partial<ChatReplyResult>, request.locale, allowedCardSet(request.tableSnapshot), heroSuitFixMap(request.tableSnapshot), heroFirstPostflop(request.tableSnapshot), noShowdownInHand(request.tableSnapshot));
  },

  async generateTournamentSummary(
    request: TournamentSummaryRequest,
    meta?: LlmCallMeta,
  ): Promise<TournamentSummaryResult> {
    const parsed = await callOpenRouter(
      buildTournamentSummarySystemPrompt(request.locale),
      buildTournamentSummaryPrompt(request),
      { step: "TOURNAMENT_SUMMARY", playerId: meta?.playerId },
      undefined,
      TEMP_PRECISE,
    );
    return validateTournamentSummary(parsed as Partial<TournamentSummaryResult>, request.locale);
  },

  async generateCoachNotes(request: CoachNotesRequest, meta?: LlmCallMeta): Promise<CoachNotesResult> {
    const parsed = await callOpenRouter(
      buildCoachNotesSystemPrompt(request.maxNotes),
      buildCoachNotesPrompt(request),
      { step: "COACH_NOTES", playerId: meta?.playerId },
      undefined,
      TEMP_PRECISE,
    );
    return validateCoachNotes(parsed as { notes?: unknown });
  },

  async generatePlayerCharacteristic(
    request: PlayerCharacteristicRequest,
    meta?: LlmCallMeta,
  ): Promise<PlayerCharacteristicResult> {
    const parsed = await callOpenRouter(
      buildPlayerCharacteristicSystemPrompt(request.locale),
      buildPlayerCharacteristicPrompt(request),
      { step: "PLAYER_CHARACTERISTIC", playerId: meta?.playerId },
      undefined,
      TEMP_PRECISE,
    );
    return validatePlayerCharacteristic(parsed as Partial<PlayerCharacteristicResult>, request.locale);
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
