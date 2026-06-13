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

// Вход GENERATE_VERDICT — вопрос и ответ игрока (правило 2: итог формируется
// только после ответа) + черновик вердикта из GENERATE_HAND_ANALYSIS + те же
// посчитанные метрики раздачи/турнира, что и в HandAnalysisRequest.
export type VerdictRequest = {
  question: string;
  answer: string;
  draftVerdict: string;
  chipResult: number;
  tableSnapshot: TableSnapshot;
  tournament: TournamentContext;
};

export type VerdictResult = {
  verdict: string;
};

export interface LlmPort {
  generateHandAnalysis(request: HandAnalysisRequest): Promise<HandAnalysisResult>;
  generateVerdict(request: VerdictRequest): Promise<VerdictResult>;
}
