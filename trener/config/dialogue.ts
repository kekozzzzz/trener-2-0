// Глубина сократовского диалога — бизнес-число, живёт только в конфиге/.env
// (правило проекта №3). Одинакова для всех тарифов подписки
// (architecture/02-сущности.md, решение 2026-06-11).

const DEFAULT_ROUNDS_PER_HAND = 5;

export function getDialogueRoundsPerHand(): number {
  const raw = process.env.DIALOGUE_ROUNDS_PER_HAND;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ROUNDS_PER_HAND;
}

// Защитный потолок длины свободного ответа на сократовский вопрос — этот текст
// тоже уходит в Claude (GENERATE_DIALOGUE_QUESTION/GENERATE_VERDICT), поэтому
// нужен тормоз для расходов и злоупотреблений (architecture/07-безопасность.md,
// раздел 2). Просторнее чата (~500): ответ-рассуждение бывает длиннее вопроса,
// цель — отсечь явный мусор, а не ограничить нормальный ответ.
const DEFAULT_ANSWER_MAX_LENGTH = 2000;

export function getDialogueAnswerMaxLength(): number {
  const raw = process.env.DIALOGUE_ANSWER_MAX_LENGTH;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_ANSWER_MAX_LENGTH;
}

// Метка «вопрос про диапазон»: когда тренер просит игрока назвать руки оппонента,
// шаг очереди дописывает её в начало текста вопроса (по флагу answerMode от LLM),
// а страница по ней показывает сетку 13×13 вместо поля ввода и вырезает метку из
// показываемого текста. Метку ставит код, не модель → безопасно (как токены
// кликабельных рук {{h:...}}). plans/2026-06-25-сетка-диапазона-в-вопросе.md.
export const RANGE_ANSWER_MARKER = "{{range}}";

// Делит текст вопроса на признак «диапазонного» и чистый текст без метки.
export function splitRangeMarker(question: string): { isRange: boolean; text: string } {
  if (question.startsWith(RANGE_ANSWER_MARKER)) {
    return { isRange: true, text: question.slice(RANGE_ANSWER_MARKER.length).trimStart() };
  }
  return { isRange: false, text: question };
}

// Дописывает метку в начало вопроса по флагу answerMode от LLM. Метку ставит код,
// а не модель — текст модели меткой стать не может (безопасность, как у {{h:...}}).
export function applyRangeMarker(question: string, answerMode: "text" | "range" | undefined): string {
  return answerMode === "range" ? `${RANGE_ANSWER_MARKER} ${question}` : question;
}
