// Общие разборщики и валидаторы ответа LLM — не зависят от вендора, поэтому живут
// отдельно и переиспользуются всеми адаптерами (anthropic, openrouter). Так формат
// ответа модели проверяется одинаково, чем бы её ни обслуживали.

import type {
  ChatReplyResult,
  HandAnalysisRequest,
  HandAnalysisResult,
  NextQuestionResult,
  PlayerCharacteristicResult,
  TournamentSummaryResult,
  VerdictResult,
} from "./types";

// Claude/DeepSeek иногда оборачивают JSON в markdown-код-блок несмотря на инструкцию — снимаем его.
export function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  return (fenced ? fenced[1] : text).trim();
}

// Строго: режим ответа сеткой включается ТОЛЬКО литералом "range". Любое другое
// значение (или его отсутствие) — обычный текстовый ответ.
export function parseAnswerMode(value: unknown): "range" | undefined {
  return value === "range" ? "range" : undefined;
}

// Номер действия для схемы стола: неотрицательное целое (число или строка из цифр).
export function parseTableActionIndex(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && value >= 0) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return parseInt(value, 10);
  return undefined;
}

export function validateHandAnalysis(
  result: Partial<HandAnalysisResult>,
  request: HandAnalysisRequest,
): HandAnalysisResult {
  if (typeof result.played !== "string" || typeof result.optimal !== "string") {
    throw new Error("LLM вернул разбор без обязательных полей played/optimal");
  }

  if (request.importanceLevel === "CRITICAL") {
    if (typeof result.question !== "string" || typeof result.draftVerdict !== "string") {
      throw new Error("LLM вернул CRITICAL-разбор без question/draftVerdict");
    }
    return {
      played: result.played,
      optimal: result.optimal,
      question: result.question,
      draftVerdict: result.draftVerdict,
      answerMode: parseAnswerMode(result.answerMode),
      tableActionIndex: parseTableActionIndex(result.tableActionIndex),
    };
  }

  if (typeof result.note !== "string") {
    throw new Error(`LLM вернул ${request.importanceLevel}-разбор без note`);
  }
  return { played: result.played, optimal: result.optimal, note: result.note };
}

export function validateVerdict(result: Partial<VerdictResult>): VerdictResult {
  if (typeof result.verdict !== "string") {
    throw new Error("LLM вернул вердикт без поля verdict");
  }
  return { verdict: result.verdict };
}

export function validateNextQuestion(result: Partial<NextQuestionResult>): NextQuestionResult {
  const complete = result.complete === true;
  // При complete=true вопрос не нужен (диалог завершён) — поле может отсутствовать.
  if (!complete && typeof result.question !== "string") {
    throw new Error("LLM вернул ответ без поля question");
  }
  return {
    complete,
    question: typeof result.question === "string" ? result.question : "",
    answerMode: parseAnswerMode(result.answerMode),
    tableActionIndex: parseTableActionIndex(result.tableActionIndex),
  };
}

export function validateChatReply(result: Partial<ChatReplyResult>): ChatReplyResult {
  if (typeof result.reply !== "string") {
    throw new Error("LLM вернул ответ без поля reply");
  }
  return { reply: result.reply };
}

export function validateTournamentSummary(result: Partial<TournamentSummaryResult>): TournamentSummaryResult {
  if (typeof result.overview !== "string") {
    throw new Error("LLM вернул обзор турнира без overview");
  }
  return { overview: result.overview };
}

export function validatePlayerCharacteristic(
  result: Partial<PlayerCharacteristicResult>,
): PlayerCharacteristicResult {
  if (typeof result.characteristic !== "string") {
    throw new Error("LLM вернул характеристику без поля characteristic");
  }
  return { characteristic: result.characteristic };
}
