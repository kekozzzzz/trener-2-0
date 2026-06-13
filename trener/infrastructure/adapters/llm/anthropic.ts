import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey, getAnthropicModel } from "@/config/llm";
import { buildHandAnalysisPrompt, HAND_ANALYSIS_SYSTEM_PROMPT } from "@/config/prompts/hand-analysis";
import { buildVerdictPrompt, VERDICT_SYSTEM_PROMPT } from "@/config/prompts/verdict";
import type { HandAnalysisRequest, HandAnalysisResult, LlmPort, VerdictRequest, VerdictResult } from "./types";

const MAX_TOKENS = 1024;

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

async function callClaude(system: string, prompt: string): Promise<unknown> {
  const client = new Anthropic({ apiKey: getAnthropicApiKey() });

  const message = await client.messages.create({
    model: getAnthropicModel(),
    max_tokens: MAX_TOKENS,
    system,
    messages: [{ role: "user", content: prompt }],
  });

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
  async generateHandAnalysis(request: HandAnalysisRequest): Promise<HandAnalysisResult> {
    const parsed = await callClaude(HAND_ANALYSIS_SYSTEM_PROMPT, buildHandAnalysisPrompt(request));
    return validate(parsed as Partial<HandAnalysisResult>, request);
  },

  async generateVerdict(request: VerdictRequest): Promise<VerdictResult> {
    const parsed = await callClaude(VERDICT_SYSTEM_PROMPT, buildVerdictPrompt(request));
    return validateVerdict(parsed as Partial<VerdictResult>);
  },
};
