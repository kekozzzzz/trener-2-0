import type {
  ChatReplyRequest,
  ChatReplyResult,
  HandAnalysisRequest,
  HandAnalysisResult,
  LlmPort,
  NextQuestionRequest,
  NextQuestionResult,
  VerdictRequest,
  VerdictResult,
} from "./types";

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

  async generateNextQuestion(request: NextQuestionRequest): Promise<NextQuestionResult> {
    const nextRound = request.history.length + 1;
    return {
      question: `(фейк) Раунд ${nextRound}: и почему ты выбрал именно это?`,
    };
  },

  async generateVerdict(request: VerdictRequest): Promise<VerdictResult> {
    const answers = request.history.map((round) => `«${round.answer}»`).join(", ");
    return {
      verdict: `(фейк) ${request.draftVerdict} Ответы игрока учтены: ${answers}.`,
    };
  },

  async generateChatReply(request: ChatReplyRequest): Promise<ChatReplyResult> {
    const lastQuestion = request.history[request.history.length - 1]?.text ?? "";
    return {
      reply: `(фейк) Ответ на вопрос «${lastQuestion}» с учётом разбора: ${request.analysisSummary}`,
    };
  },
};
