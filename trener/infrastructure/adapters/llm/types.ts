import type { HandImportance, PlayerStyle, TableSnapshot } from "@/parser/types";

// Контекст турнира — только то, что уже посчитал парсер и хранится на Tournament.
export type TournamentContext = {
  handsCount: number;
  vpipPercent: number;
  resultBuyins: number;
  styleDiagnosis: PlayerStyle;
};

// Вход адаптера — обезличенный снимок стола (Hero/Player N, без никнеймов) +
// уже посчитанные метрики раздачи и турнира (правило 1 — LLM не вычисляет числа).
export type HandAnalysisRequest = {
  importanceLevel: HandImportance;
  chipResult: number;
  tableSnapshot: TableSnapshot;
  tournament: TournamentContext;
};

// Состав результата зависит от importanceLevel:
// CRITICAL — question + draftVerdict (черновик до ответа игрока, правило 2);
// STRONG/MEDIUM — note (короткое подтверждение / лёгкая заметка).
export type HandAnalysisResult = {
  played: string;
  optimal: string;
  note?: string;
  question?: string;
  draftVerdict?: string;
};

// Один отвеченный раунд сократовского диалога — вопрос системы + ответ игрока.
export type DialogueRoundSummary = {
  roundNumber: number;
  question: string;
  answer: string;
};

// Вход GENERATE_DIALOGUE_QUESTION — вся история отвеченных раундов (правило 2:
// следующий вопрос формируется только после ответа на текущий) + черновик
// вердикта из GENERATE_HAND_ANALYSIS (ориентир, куда ведёт диалог) + те же
// посчитанные метрики раздачи/турнира, что и в HandAnalysisRequest.
export type NextQuestionRequest = {
  history: DialogueRoundSummary[];
  draftVerdict: string;
  chipResult: number;
  tableSnapshot: TableSnapshot;
  tournament: TournamentContext;
};

export type NextQuestionResult = {
  question: string;
};

// Вход GENERATE_VERDICT — история всех раундов диалога (правило 2: итог
// формируется только после ответа на последний раунд) + черновик вердикта из
// GENERATE_HAND_ANALYSIS + те же посчитанные метрики раздачи/турнира, что и в
// HandAnalysisRequest.
export type VerdictRequest = {
  history: DialogueRoundSummary[];
  draftVerdict: string;
  chipResult: number;
  tableSnapshot: TableSnapshot;
  tournament: TournamentContext;
};

export type VerdictResult = {
  verdict: string;
};

// Одно сообщение треда «Чат по раздаче» — свободные вопросы игрока после вердикта.
export type ChatMessageSummary = {
  author: "PLAYER" | "SYSTEM";
  text: string;
};

// Вход GENERATE_CHAT_REPLY — вся история треда (включая последнее сообщение
// игрока, на которое нужен ответ) + краткая сводка уже готового разбора
// раздачи (played/optimal/verdict) + те же посчитанные метрики, что и в
// HandAnalysisRequest/VerdictRequest (правило 1).
export type ChatReplyRequest = {
  history: ChatMessageSummary[];
  analysisSummary: string;
  chipResult: number;
  tableSnapshot: TableSnapshot;
  tournament: TournamentContext;
};

export type ChatReplyResult = {
  reply: string;
};

export interface LlmPort {
  generateHandAnalysis(request: HandAnalysisRequest): Promise<HandAnalysisResult>;
  generateNextQuestion(request: NextQuestionRequest): Promise<NextQuestionResult>;
  generateVerdict(request: VerdictRequest): Promise<VerdictResult>;
  generateChatReply(request: ChatReplyRequest): Promise<ChatReplyResult>;
}
