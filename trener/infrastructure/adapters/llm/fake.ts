import type { HandAnalysisRequest, HandAnalysisResult, LlmPort } from "./types";

// Детерминированный фейк — без сети и без расходов. Используется в тестах
// и как дев-фоллбэк, когда ANTHROPIC_API_KEY не задан (config/llm.ts).
export const fakeLlmAdapter: LlmPort = {
  async generateHandAnalysis(request: HandAnalysisRequest): Promise<HandAnalysisResult> {
    const { importanceLevel, chipResult } = request;

    const played = `(фейк) Hero сыграл раздачу с итогом ${chipResult} фишек.`;
    const optimal = "(фейк) Альтернативная линия не сформирована — это тестовый разбор.";

    if (importanceLevel === "CRITICAL") {
      return {
        played,
        optimal,
        question: "(фейк) Что ты думал, когда принимал это решение?",
        draftVerdict: "(фейк) Черновик вердикта — ждёт ответа игрока.",
      };
    }

    if (importanceLevel === "STRONG") {
      return { played, optimal, note: "(фейк) Здесь решение было правильным." };
    }

    return { played, optimal, note: "(фейк) Можно было сыграть немного иначе." };
  },
};
