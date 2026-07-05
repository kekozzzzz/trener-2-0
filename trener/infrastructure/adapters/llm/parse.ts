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

// Страховка словаря кодом (COACH_FRAMEWORK «## Язык»): типовые срывы, которые промпт
// запрещает, но модель всё равно иногда пишет в живых текстах. Чиним детерминированно
// на выходе адаптера — до того, как текст увидит игрок. Замены только однозначные,
// где не ломается грамматика; спорные обороты остаются на совести промпта.
const CASE_FIXES: Array<[string, string]> = [
  // возвратные формы «сбрасываться» → «фолдить» в том же лице и времени
  ["сбрасываешься", "фолдишь"],
  ["сбрасывается", "фолдит"],
  ["сбрасываемся", "фолдим"],
  ["сбрасываются", "фолдят"],
  ["сбрасывался", "фолдил"],
  ["сбрасывалась", "фолдила"],
  ["сбрасывались", "фолдили"],
  ["сбросился", "сбросил"],
  ["сбросилась", "сбросила"],
  ["сбросились", "сбросили"],
  // «хедз-ап» — только про стол из двоих в турнире; про раздачу — «один на один»
  ["в хедз-апе", "один на один"],
  ["в хедз-ап", "один на один"],
  // «двойка пар» — безграмотная калька, всегда «две пары»
  ["двойкой пар", "двумя парами"],
  ["двойку пар", "две пары"],
  ["двойке пар", "двум парам"],
  ["двойки пар", "двух пар"],
  ["двойка пар", "две пары"],
  // «донатить» запрещено словарём — говорим действием
  ["задонатить", "заплатить"],
  ["донатовать", "платить"],
  ["донатить", "платить"],
  ["донатишь", "платишь"],
  ["донатит", "платит"],
  // позиции — кодами: «кнопка»/«баттон» во всех падежах → BTN (длинные формы раньше коротких)
  ["кнопкой", "BTN"],
  ["кнопке", "BTN"],
  ["кнопку", "BTN"],
  ["кнопки", "BTN"],
  ["кнопка", "BTN"],
  ["баттоном", "BTN"],
  ["баттоне", "BTN"],
  ["баттону", "BTN"],
  ["баттона", "BTN"],
  ["баттон", "BTN"],
  ["батоном", "BTN"],
  ["батоне", "BTN"],
  ["батону", "BTN"],
  ["батона", "BTN"],
  ["батон", "BTN"],
];

export function cleanCoachText(text: string): string {
  // длинное тире запрещено словарём — всегда короткое с пробелами
  let out = text.replace(/\s*—\s*/g, " - ");
  for (const [from, to] of CASE_FIXES) {
    const capFrom = from[0].toUpperCase() + from.slice(1);
    const capTo = to[0].toUpperCase() + to.slice(1);
    out = out.split(from).join(to).split(capFrom).join(capTo);
  }
  return out;
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
      played: cleanCoachText(result.played),
      optimal: cleanCoachText(result.optimal),
      question: cleanCoachText(result.question),
      draftVerdict: cleanCoachText(result.draftVerdict),
      answerMode: parseAnswerMode(result.answerMode),
      tableActionIndex: parseTableActionIndex(result.tableActionIndex),
    };
  }

  if (typeof result.note !== "string") {
    throw new Error(`LLM вернул ${request.importanceLevel}-разбор без note`);
  }
  return {
    played: cleanCoachText(result.played),
    optimal: cleanCoachText(result.optimal),
    note: cleanCoachText(result.note),
  };
}

export function validateVerdict(result: Partial<VerdictResult>): VerdictResult {
  if (typeof result.verdict !== "string") {
    throw new Error("LLM вернул вердикт без поля verdict");
  }
  return { verdict: cleanCoachText(result.verdict) };
}

export function validateNextQuestion(result: Partial<NextQuestionResult>): NextQuestionResult {
  const complete = result.complete === true;
  // При complete=true вопрос не нужен (диалог завершён) — поле может отсутствовать.
  if (!complete && typeof result.question !== "string") {
    throw new Error("LLM вернул ответ без поля question");
  }
  return {
    complete,
    question: typeof result.question === "string" ? cleanCoachText(result.question) : "",
    answerMode: parseAnswerMode(result.answerMode),
    tableActionIndex: parseTableActionIndex(result.tableActionIndex),
  };
}

export function validateChatReply(result: Partial<ChatReplyResult>): ChatReplyResult {
  if (typeof result.reply !== "string") {
    throw new Error("LLM вернул ответ без поля reply");
  }
  return { reply: cleanCoachText(result.reply) };
}

export function validateTournamentSummary(result: Partial<TournamentSummaryResult>): TournamentSummaryResult {
  if (typeof result.overview !== "string") {
    throw new Error("LLM вернул обзор турнира без overview");
  }
  return { overview: cleanCoachText(result.overview) };
}

export function validatePlayerCharacteristic(
  result: Partial<PlayerCharacteristicResult>,
): PlayerCharacteristicResult {
  if (typeof result.characteristic !== "string") {
    throw new Error("LLM вернул характеристику без поля characteristic");
  }
  return { characteristic: cleanCoachText(result.characteristic) };
}
