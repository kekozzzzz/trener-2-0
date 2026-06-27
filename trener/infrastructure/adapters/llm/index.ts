import { getAnthropicApiKey, getLlmProvider, getOpenRouterApiKey } from "@/config/llm";
import { anthropicLlmAdapter } from "./anthropic";
import { openRouterLlmAdapter } from "./openrouter";
import { fakeLlmAdapter } from "./fake";
import type { LlmPort } from "./types";

// Выбор адаптера по провайдеру (config/llm, env LLM_PROVIDER — Правило 3):
//  • openrouter (+ключ) → DeepSeek через релей (основной, дешевле в ~16×);
//  • иначе anthropic (+ключ) → Sonnet через релей (запасной, мгновенный откат);
//  • без ключей → фейк (дев-окружение и тесты).
export function getLlmAdapter(): LlmPort {
  if (getLlmProvider() === "openrouter" && getOpenRouterApiKey()) return openRouterLlmAdapter;
  return getAnthropicApiKey() ? anthropicLlmAdapter : fakeLlmAdapter;
}

export type { HandAnalysisRequest, HandAnalysisResult, LlmPort, TournamentContext } from "./types";
