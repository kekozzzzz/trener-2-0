import { getAnthropicApiKey } from "@/config/llm";
import { anthropicLlmAdapter } from "./anthropic";
import { fakeLlmAdapter } from "./fake";
import type { LlmPort } from "./types";

// Anthropic если задан ключ, иначе фейк (дев-окружение без ANTHROPIC_API_KEY и тесты).
export function getLlmAdapter(): LlmPort {
  return getAnthropicApiKey() ? anthropicLlmAdapter : fakeLlmAdapter;
}

export type { HandAnalysisRequest, HandAnalysisResult, LlmPort, TournamentContext } from "./types";
