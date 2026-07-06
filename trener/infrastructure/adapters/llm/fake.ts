import type {
  CoachNotesRequest,
  CoachNotesResult,
  ChatReplyRequest,
  ChatReplyResult,
  HandAnalysisRequest,
  HandAnalysisResult,
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
import { lastActionIndex } from "@/parser/table-state";

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
        // Диапазонный вопрос — в деве показывает сетку 13×13 (answerMode "range"),
        // чтобы видеть фичу без обращения к Claude.
        question: "(фейк) Какие руки ты даёшь оппоненту в этом споте? Отметь их на сетке.",
        draftVerdict: "(фейк) Черновик вердикта — ждёт ответа игрока.",
        answerMode: "range",
        // В деве показываем схему стола на последнем действии раздачи.
        tableActionIndex: lastActionIndex(request.tableSnapshot),
      };
    }

    if (importanceLevel === "STRONG") {
      return { played, optimal, note: "(фейк) Здесь решение было правильным." };
    }

    return { played, optimal, note: "(фейк) Можно было сыграть немного иначе." };
  },

  async generateNextQuestion(request: NextQuestionRequest): Promise<NextQuestionResult> {
    // Дев-сигнал завершения: если в последнем ответе игрока есть «понял» / «всё ясно»
    // — фейк закрывает диалог (в проде это решает Claude по смыслу ответа). Позволяет
    // в деве дойти до вердикта за нужное число раундов, просто написав «понял».
    const lastAnswer = request.history[request.history.length - 1]?.answer ?? "";
    const complete = lastAnswer.toLowerCase().includes("понял") || lastAnswer.toLowerCase().includes("всё ясно");
    if (complete) {
      return { complete: true, question: "" };
    }

    const nextRound = request.history.length + 1;
    return {
      complete: false,
      question: `(фейк) Раунд ${nextRound}: и почему ты выбрал именно это?`,
      tableActionIndex: lastActionIndex(request.tableSnapshot),
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

  async generateTournamentSummary(request: TournamentSummaryRequest): Promise<TournamentSummaryResult> {
    // Детерминированно: ссылаемся токенами на первые 3 раздачи карточки + при
    // наличии добавляем фразу про открывашки (для проверки сборки в тестах).
    const links = request.hands
      .slice(0, 3)
      .map((h) => `раздача {{h:${h.index}}} (${h.chipResult} фишек)`)
      .join(", ");
    const leak =
      request.openLeak.length > 0
        ? ` Открывашки шире нормы: ${request.openLeak.map((o) => `${o.code} с ${o.position}`).join(", ")}.`
        : "";
    return {
      overview: `(фейк) Общая картина: стиль ${request.tournament.styleDiagnosis}, VPIP ${request.tournament.vpipPercent}%.${leak} Показательно: ${links}.`,
    };
  },

  async generateCoachNotes(request: CoachNotesRequest): Promise<CoachNotesResult> {
    // Детерминированно: прежние заметки сохраняются (basedOn), плюс одна новая из
    // вердикта занятия — для тестов шага очереди без сети и расходов.
    return {
      notes: [
        ...request.existingNotes.map((_, i) => ({ text: `(фейк) прежняя заметка ${i + 1}`, basedOn: i + 1 })),
        { text: `(фейк) вывод занятия: ${request.verdict.slice(0, 60)}` },
      ].slice(0, request.maxNotes),
    };
  },

  async generatePlayerCharacteristic(request: PlayerCharacteristicRequest): Promise<PlayerCharacteristicResult> {
    // Детерминированно: стиль + средний VPIP + при наличии — фраза про открывашки
    // (для проверки сборки фактов и шага очереди в тестах, без сети и расходов).
    const leak =
      request.openLeak.length > 0
        ? ` Открывашки шире нормы: ${request.openLeak.map((o) => `${o.code} с ${o.position}`).join(", ")}.`
        : "";
    return {
      characteristic: `(фейк) Стиль ${request.dominantStyle}, средний VPIP ${request.avgVpip}% по ${request.tournamentsCounted} турнирам.${leak}`,
    };
  },

  // Без сети и ключа (дев/тесты) — health по Claude не должен падать.
  async ping(): Promise<boolean> {
    return true;
  },
};
