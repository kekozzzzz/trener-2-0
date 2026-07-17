// ПОТОЛОК глубины сократовского диалога — бизнес-число, живёт только в конфиге/.env
// (правило проекта №3). Одинаков для всех тарифов подписки
// (architecture/02-сущности.md, решение 2026-06-11).
//
// Длину диалога определяет ИИ по смыслу ответа игрока (флаг complete на шаге
// GENERATE_DIALOGUE_QUESTION): от 1 раунда (сразу всё ясно) до этого потолка. Здесь
// — только жёсткая страховка от бесконечного диалога и расходов. Имя переменной
// окружения историческое (DIALOGUE_ROUNDS_PER_HAND), смысл — максимум раундов.
// Решение 2026-06-27: динамическая длина диалога.

// ⚠️2026-07-17 (Артём, разбор душноты): 12 → 4. Двенадцать раундов — это не «страховка», а
// разрешение на допрос: длину задаёт флаг complete, но когда модель не останавливается сама,
// игрок получает вопрос за вопросом до потолка. Артём объяснил, в чём душнота: не в отдельном
// вопросе (они как раз нормальные), а в ЦЕПОЧКЕ — «что бы ты ни ответил, тренер снова: а как бы
// ты это сделал? — и вымучивает свой правильный ответ». Нормальный диалог — обмен: вопрос →
// ответ → вердикт. По его же примеру: игрок назвал диапазон первым ответом — дальше вердикт.
// 4 (а не 2) — запас на честный случай «игрок ответил „не знаю“ → подсказали → переспросили».
const DEFAULT_MAX_ROUNDS = 4;

export function getDialogueMaxRounds(): number {
  const raw = process.env.DIALOGUE_ROUNDS_PER_HAND;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_ROUNDS;
}

// Низкий потолок для «тонкого» спота — раздачи без тяжёлого решения (пассивный чек-даун,
// крупный фолд/блеф/колл НЕ случились: topDecisionMark = null). Там копать особо нечего, и
// 4+ вопроса подряд превращают диалог в занудство (жалоба 2026-07-15, раздача 5♦4♦). Это
// ДЕТЕРМИНИРОВАННАЯ страховка ПОВЕРХ флага complete: даже если модель сама не остановилась,
// вердикт наступит принудительно. Споты С решением сохраняют полный потолок — там есть что
// разбирать вглубь. Решать «тонкий ли спот» — коду по метке парсера, не модели (Правило 1).
const DEFAULT_MAX_ROUNDS_THIN = 3;

export function getDialogueMaxRoundsThin(): number {
  const raw = process.env.DIALOGUE_ROUNDS_THIN_SPOT;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : DEFAULT_MAX_ROUNDS_THIN;
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

// Страховка от промахов модели с answerMode (2026-07-04: модель ставила сетку на
// «почему ты…» и НЕ ставила на «какие руки составляют его диапазон?»). Если сам текст
// вопроса буквально просит перечислить руки — сетка нужна независимо от флага.
// Детерминированная эвристика по формулам вопроса; ставит код, не модель.
const RANGE_QUESTION_RE =
  /какие руки|какими руками|каких рук|что (?:он|она|игрок|соперник|оппонент)[^?]*(?:открыва|пуш|колл|3-бет|став|продолжа)|what hands|which hands|his range here/i;

export function questionAsksForRange(question: string): boolean {
  return RANGE_QUESTION_RE.test(question);
}

// Дописывает метку в начало вопроса по флагу answerMode от LLM. Метку ставит код,
// а не модель — текст модели меткой стать не может (безопасность, как у {{h:...}}).
export function applyRangeMarker(question: string, answerMode: "text" | "range" | undefined): string {
  const isRange = answerMode === "range" || questionAsksForRange(question);
  return isRange ? `${RANGE_ANSWER_MARKER} ${question}` : question;
}

// Дописывает метку действия по флагу tableActionIndex от LLM. Метку ставит код, не модель.
export function applyTableMarker(question: string, tableActionIndex: number | undefined): string {
  return tableActionIndex != null ? `{{table:${tableActionIndex}}} ${question}` : question;
}
