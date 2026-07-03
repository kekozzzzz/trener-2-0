import type { HandImportance, PlayerStyle, Street, TableSnapshot } from "@/parser/types";
import type { OpponentFact } from "@/parser/opponent-profile";
import type { Locale } from "@/i18n/config";

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
  // Язык ответа тренера (вариант A: тренер говорит на locale игрока, думает как прежде).
  // Переводятся только языковые директивы и подписи данных; покерная проза — русская.
  locale: Locale;
  importanceLevel: HandImportance;
  chipResult: number;
  tableSnapshot: TableSnapshot;
  tournament: TournamentContext;
  // Профили злодеев ЭТОЙ раздачи (в банке) по рукам ДО неё — внутренний приор для тренера
  // (чем рыбнее, тем шире диапазон). Правило 1: типы посчитал парсер. Тип игроку НЕ
  // показываем (не HUD). Может быть пусто (мало рук на оппонентов). Промпт — отдельно.
  opponents?: OpponentFact[];
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
// Реальная прошлая раздача игрока в похожем споте — память тренера (Правило 1: похожесть
// нашёл ПАРСЕР по отпечатку, не LLM; matchLevel посчитан детерминированно по числу совпавших
// признаков). Модель только проговаривает приведённые раздачи, выдумывать новые не может.
export type PriorSpot = {
  matchLevel: "EXACT" | "SIMILAR"; // один-в-один / что-то подобное
  cards: string[]; // карманные карты Hero в той раздаче
  decision: string | null; // что игрок сделал (heroDecisionLabel)
  reasoning: string | null; // что игрок тогда ответил в диалоге (если был), иначе null
  chipResult: number;
  when: string | null; // ссылка на тот турнир (имя/дата), для узнавания
};

// Диапазон, отмеченный ИГРОКОМ на сетке 13×13 в ответе диалога, + точные числа
// парсера против него (parser/range-equity.ts, собирает queue/steps/range-facts.ts).
// Правило 1: все числа посчитаны кодом, ИИ их только проговаривает; оба входа
// (диапазон и его нарезку по улицам) назвал сам игрок — математика на честных входах.
export type RangeRead = {
  roundNumber: number; // раунд диалога, в котором игрок отметил этот диапазон
  notation: string; // нотация, как её видел игрок («99+, AJs+, KQo»)
  gridPct: number; // сколько процентов всех стартовых рук отмечено
  fullGrid: boolean; // отмечена ВСЯ сетка — «оппонент играет всё» (повод для сверки)
  street: Street | null; // улица точки решения вопроса (по метке {{table:N}})
  equityPct: number | null; // эквити руки Hero против диапазона; null — префлоп/нет живых комбо
  combosLive: number | null; // живых комбо после вычета карт Hero и борда
  // Сверка с профилем оппонента (когда в раздаче ровно один известный злодей):
  // gapPp = отмеченный процент минус его VPIP, в процентных пунктах.
  vpipContrast: { seatLabel: string; vpip: number; handsObserved: number; gapPp: number } | null;
  // Нарезка против ПРЕДЫДУЩЕГО отмеченного диапазона в этом же диалоге: сколько
  // процентов живых комбо игрок «выбил» и сколько комбо доложил, которых не было.
  cut: { vsRound: number; foldPct: number; addedCombos: number } | null;
};

export type NextQuestionRequest = {
  locale: Locale; // язык ответа тренера (см. HandAnalysisRequest.locale)
  history: DialogueRoundSummary[];
  draftVerdict: string;
  chipResult: number;
  tableSnapshot: TableSnapshot;
  tournament: TournamentContext;
  priorSpots?: PriorSpot[]; // похожие прошлые раздачи игрока (память) — опционально
  opponents?: OpponentFact[]; // профили злодеев по рукам ДО этой (см. HandAnalysisRequest.opponents)
  rangeReads?: RangeRead[]; // отмеченные игроком диапазоны + числа парсера против них
};

export type NextQuestionResult = {
  // complete — ИИ прочитал последний ответ игрока и решил, что диалог исчерпан
  // (игрок сам дошёл до сути либо копать дальше бессмысленно): раунд не создаётся,
  // дальше идёт вердикт. Длину диалога задаёт этот флаг, а не счётчик — потолок
  // числа раундов лишь страховка (config/dialogue.ts). Решение 2026-06-27.
  complete?: boolean;
  question: string; // следующий вопрос; при complete=true игнорируется (может быть пустым)
  answerMode?: "text" | "range"; // "range" — ответ сеткой 13×13 (см. HandAnalysisResult)
  tableActionIndex?: number; // номер действия для схемы стола над вопросом (см. HandAnalysisResult)
};

// Вход GENERATE_VERDICT — история всех раундов диалога (правило 2: итог
// формируется только после ответа на последний раунд) + черновик вердикта из
// GENERATE_HAND_ANALYSIS + те же посчитанные метрики раздачи/турнира, что и в
// HandAnalysisRequest.
export type VerdictRequest = {
  locale: Locale; // язык ответа тренера (см. HandAnalysisRequest.locale)
  history: DialogueRoundSummary[];
  draftVerdict: string;
  chipResult: number;
  tableSnapshot: TableSnapshot;
  tournament: TournamentContext;
  opponents?: OpponentFact[]; // профили злодеев по рукам ДО этой (см. HandAnalysisRequest.opponents)
  rangeReads?: RangeRead[]; // отмеченные игроком диапазоны + числа парсера против них
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
  locale: Locale; // язык ответа тренера (см. HandAnalysisRequest.locale)
  history: ChatMessageSummary[];
  analysisSummary: string;
  chipResult: number;
  tableSnapshot: TableSnapshot;
  tournament: TournamentContext;
  opponents?: OpponentFact[]; // профили злодеев по рукам ДО этой (см. HandAnalysisRequest.opponents)
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

// Один 3-бет из BB заметно шире нормы — посчитал парсер (parser/bb-defense.ts) и
// сверил с чартом защиты BB (config/poker/bb-defense-chart.ts). Правило 1/2: позиция
// открывашки и код руки готовы, LLM только формулирует.
export type BBThreeBetLeakHand = {
  openerPosition: string; // против кого 3-бетил из BB: UTG | MP | HJ | CO | BTN
  code: string; // код руки, напр. "72o"
};

// Один опен-шов заметно шире нормы — посчитал парсер (parser/open-shove.ts) и сверил
// с пуш-фолд-чартом (config/poker/push-fold-chart.ts). Правило 1: позиция, стек-бэнд
// и код руки готовы, LLM только формулирует.
export type OpenShoveLeakHand = {
  position: string; // UTG | MP2 | CO | BTN | SB
  band: "SHORT" | "MID"; // SHORT = 0–9bb, MID = 10–14bb
  code: string; // код руки, напр. "72o"
};

// Один 3-бет против опена (не из BB) заметно шире нормы — посчитал парсер
// (parser/vs-open.ts) и сверил с чартом (config/poker/vs-open-chart.ts). Правило 1/2:
// наша позиция и код руки готовы, LLM только формулирует.
export type VsOpenThreeBetLeakHand = {
  position: string; // наша позиция: UTG | MP | HJ | CO | BTN | SB
  code: string; // код руки, напр. "72o"
};

// Одна изоляция лимпера заметно шире нормы — посчитал парсер (parser/iso.ts) и сверил
// с iso-чартом (config/poker/iso-chart.ts = RFI минус низ). Правило 1/2: наша позиция
// и код руки готовы, LLM только формулирует.
export type IsoLeakHand = {
  position: string; // наша позиция: UTG | MP | HJ | CO | BTN | SB
  code: string; // код руки, напр. "55" (мелкая пара — лучше оверлимп) или мусор
};

// Один сквиз заметно шире нормы — посчитал парсер (parser/squeeze.ts) и сверил со
// сквиз-чартом (config/poker/squeeze-chart.ts). Правило 1/2: наша позиция и код руки
// готовы, LLM только формулирует.
export type SqueezeLeakHand = {
  position: string; // наша позиция: UTG | MP | HJ | CO | BTN | SB
  code: string; // код руки, напр. "T9s"
};

// Один 4-бет против 3-бета заметно шире нормы — посчитал парсер (parser/def-vs-3bet.ts)
// и сверил с чартом (config/poker/def-vs-3bet-chart.ts). Правило 1/2: наша открывавшая
// позиция и код руки готовы, LLM только формулирует.
export type FourBetLeakHand = {
  position: string; // наша открывавшая позиция: UTG | MP | HJ | CO | BTN | SB
  code: string; // код руки, напр. "98s"
};

// Вход GENERATE_TOURNAMENT_SUMMARY — метрики турнира + разобранные раздачи карточки +
// набор префлоп-утечек (открывашки, лимпы, 3-беты из BB, опен-шовы, 3-беты против
// опена, изоляции, сквизы, 4-беты против 3-бета — все могут быть пустыми).
export type TournamentSummaryRequest = {
  locale: Locale; // язык ответа тренера (см. HandAnalysisRequest.locale)
  tournament: TournamentContext;
  hands: TournamentSummaryHand[];
  openLeak: OpenLeakHand[];
  limpLeak: LimpLeak;
  bbThreeBetLeak: BBThreeBetLeakHand[];
  openShoveLeak: OpenShoveLeakHand[];
  vsOpenThreeBetLeak: VsOpenThreeBetLeakHand[];
  isoLeak: IsoLeakHand[];
  squeezeLeak: SqueezeLeakHand[];
  fourBetLeak: FourBetLeakHand[];
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
  locale: Locale; // язык ответа тренера (см. HandAnalysisRequest.locale)
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
