// ПОТОЛОК глубины сократовского диалога — бизнес-число, живёт только в конфиге/.env
// (правило проекта №3). Одинаков для всех тарифов подписки
// (architecture/02-сущности.md, решение 2026-06-11).
//
// Длину диалога определяет ИИ по смыслу ответа игрока (флаг complete на шаге
// GENERATE_DIALOGUE_QUESTION): от 1 раунда (сразу всё ясно) до этого потолка. Здесь
// — только жёсткая страховка от бесконечного диалога и расходов. Имя переменной
// окружения историческое (DIALOGUE_ROUNDS_PER_HAND), смысл — максимум раундов.
// Решение 2026-06-27: динамическая длина диалога.

const DEFAULT_MAX_ROUNDS = 12;

export function getDialogueMaxRounds(): number {
  const raw = process.env.DIALOGUE_ROUNDS_PER_HAND;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_ROUNDS;
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

// Метка «к какому ДЕЙСТВИЮ относится вопрос»: шаг очереди дописывает её по флагу
// tableActionIndex от LLM (номер действия из снимка), а страница по ней рисует
// схему стола ровно на этот момент решения — последнее показанное действие
// (parser/table-state.ts). Как и {{range}}, метку ставит КОД, не модель — LLM лишь
// указывает номер, числа стола считает парсер из снимка (правило 1).
// plans/2026-06-25-стол-в-разборе.md.
const TABLE_MARKER_RE = /^\{\{table:(\d+)\}\}/;

// Делит текст вопроса на флаги меток ({{range}}, {{table:N}}) и чистый текст.
// Метки снимаются в начале строки в любом порядке (шаги очереди их вкладывают).
export function splitMarkers(question: string): {
  isRange: boolean;
  tableActionIndex: number | null;
  text: string;
} {
  let text = question;
  let isRange = false;
  let tableActionIndex: number | null = null;

  // Метки стоят слитно в начале — снимаем по очереди, пока находим известную.
  for (;;) {
    if (text.startsWith(RANGE_ANSWER_MARKER)) {
      isRange = true;
      text = text.slice(RANGE_ANSWER_MARKER.length).trimStart();
      continue;
    }
    const m = TABLE_MARKER_RE.exec(text);
    if (m) {
      tableActionIndex = parseInt(m[1], 10);
      text = text.slice(m[0].length).trimStart();
      continue;
    }
    break;
  }

  return { isRange, tableActionIndex, text };
}

// Дописывает метку в начало вопроса по флагу answerMode от LLM. Метку ставит код,
// а не модель — текст модели меткой стать не может (безопасность, как у {{h:...}}).
export function applyRangeMarker(question: string, answerMode: "text" | "range" | undefined): string {
  return answerMode === "range" ? `${RANGE_ANSWER_MARKER} ${question}` : question;
}

// Дописывает метку действия по флагу tableActionIndex от LLM. Метку ставит код, не модель.
export function applyTableMarker(question: string, tableActionIndex: number | undefined): string {
  return tableActionIndex != null ? `{{table:${tableActionIndex}}} ${question}` : question;
}
