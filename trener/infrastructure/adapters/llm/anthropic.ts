import Anthropic from "@anthropic-ai/sdk";
import { getAnthropicApiKey, getAnthropicModel } from "@/config/llm";
import { buildHandAnalysisPrompt, HAND_ANALYSIS_SYSTEM_PROMPT } from "@/config/prompts/hand-analysis";
import type { HandAnalysisRequest, HandAnalysisResult, LlmPort } from "./types";

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

export const anthropicLlmAdapter: LlmPort = {
  async generateHandAnalysis(request: HandAnalysisRequest): Promise<HandAnalysisResult> {
    const client = new Anthropic({ apiKey: getAnthropicApiKey() });

    const message = await client.messages.create({
      model: getAnthropicModel(),
      max_tokens: MAX_TOKENS,
      system: HAND_ANALYSIS_SYSTEM_PROMPT,
      messages: [{ role: "user", content: buildHandAnalysisPrompt(request) }],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      throw new Error("Claude вернул ответ без текстового блока");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(extractJson(textBlock.text));
    } catch {
      throw new Error("Claude вернул невалидный JSON");
    }

    return validate(parsed as Partial<HandAnalysisResult>, request);
  },
};
