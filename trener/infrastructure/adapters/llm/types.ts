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
// answerMode "range" — вопрос просит назвать диапазон рук оппонента: игрок
// отвечает кликами по сетке 13×13, а не текстом (см. config/dialogue.ts).
// tableActionIndex — номер действия из снимка (точка решения), к которому
// относится вопрос: страница рисует схему стола на этот момент. Модель лишь
// указывает номер, числа стола считает парсер.
export type HandAnalysisResult = {
  played: string;
  optimal: string;
  note?: string;
  question?: string;
  draftVerdict?: string;
  answerMode?: "text" | "range";
  tableActionIndex?: number;
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
  answerMode?: "text" | "range"; // "range" — ответ сеткой 13×13 (см. HandAnalysisResult)
  tableActionIndex?: number; // номер действия для схемы стола над вопросом (см. HandAnalysisResult)
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

// Одна раздача карточки для обзора турнира — индекс (LLM ссылается на момент по
// нему, шаг детерминированно мапит index→handId) + уже готовый разбор (правило 1:
// числа и разбор посчитаны раньше, LLM их не пересчитывает).
export type TournamentSummaryHand = {
  index: number;
  importanceLevel: HandImportance;
  chipResult: number;
  played: string;
  optimal: string;
  note?: string;
  verdict?: string;
};

// Открывашка «заметно шире» нормы — посчитал парсер (parser/open-raise.ts) и
// сверил с RFI-чартом (config/poker/rfi-chart.ts). Правило 1/2: позиция и код руки
// готовы, LLM их только формулирует словами, ничего не пересчитывая и не добавляя.
export type OpenLeakHand = {
  position: string; // EARLY | HJ | CO | BTN | SB
  code: string; // код руки, напр. "K7s"
};

// Один показательный лимп Hero — посчитал парсер (parser/limp.ts). kind: OPEN —
// открыл лимпом (первым в банк), OVER — долимпил поверх лимперов вместо изоляции.
export type LimpExample = {
  position: string; // EARLY | HJ | CO | BTN | SB
  code: string; // код руки, напр. "Q9s"
  kind: "OPEN" | "OVER";
};

// Сводка лимпов Hero за турнир — счётчики + пара показательных рук. Правило 1:
// факты лимпов считает парсер, LLM только формулирует совет (изолируй/фолди).
export type LimpLeak = {
  openLimps: number; // сколько раз открыл лимпом
  overLimps: number; // сколько раз долимпил поверх лимперов
  examples: LimpExample[]; // до нескольких показательных рук
};

// Вход GENERATE_TOURNAMENT_SUMMARY — метрики турнира + разобранные раздачи карточки
// + список открывашек заметно шире нормы + сводка лимпов (оба могут быть пустыми).
export type TournamentSummaryRequest = {
  tournament: TournamentContext;
  hands: TournamentSummaryHand[];
  openLeak: OpenLeakHand[];
  limpLeak: LimpLeak;
};

// overview может содержать токены ссылок на раздачу карточки в виде {{h:INDEX}} —
// шаг детерминированно заменяет их на handId + карты руки (LLM карты не пишет сам,
// правило 2). Отдельных «моментов» больше нет: ссылки живут прямо в тексте.
export type TournamentSummaryResult = {
  overview: string;
};

// Вход GENERATE_PLAYER_CHARACTERISTIC — агрегаты по ВСЕМ турнирам игрока (средние,
// распределение стилей, открывашки шире нормы по всей дистанции). Всё посчитано
// детерминированно (features/profile/aggregate.ts) — LLM числа не пересчитывает,
// только формулирует характеристику словами. styleCounts — сколько турниров на
// каждый из 4 стилей; openLeak.count — как часто игрок так открывал.
export type PlayerCharacteristicRequest = {
  tournamentsCounted: number;
  avgVpip: number;
  avgResultBuyins: number;
  avgHandsCount: number;
  dominantStyle: PlayerStyle;
  styleCounts: Record<PlayerStyle, number>;
  openLeak: { position: string; code: string; count: number }[];
};

export type PlayerCharacteristicResult = {
  characteristic: string;
};

// Контекст вызова для учёта расходов: чей это запрос (атрибуция строки в llm_usage).
// Опционален — фейковый адаптер и тесты его игнорируют; реальные шаги очереди передают.
export type LlmCallMeta = { playerId: string };

export interface LlmPort {
  generateHandAnalysis(request: HandAnalysisRequest, meta?: LlmCallMeta): Promise<HandAnalysisResult>;
  generateNextQuestion(request: NextQuestionRequest, meta?: LlmCallMeta): Promise<NextQuestionResult>;
  generateVerdict(request: VerdictRequest, meta?: LlmCallMeta): Promise<VerdictResult>;
  generateChatReply(request: ChatReplyRequest, meta?: LlmCallMeta): Promise<ChatReplyResult>;
  generateTournamentSummary(request: TournamentSummaryRequest, meta?: LlmCallMeta): Promise<TournamentSummaryResult>;
  generatePlayerCharacteristic(request: PlayerCharacteristicRequest, meta?: LlmCallMeta): Promise<PlayerCharacteristicResult>;

  // Лёгкая проверка доступности Claude для /api/health: GET /v1/models через тот же
  // релей (без расхода токенов) — проверяет именно путь, что ломается (релей, доверие
  // серту, ключ). НЕ бросает: реализация ловит ошибку и возвращает false.
  ping(): Promise<boolean>;
}
