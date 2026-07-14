// Общие разборщики и валидаторы ответа LLM — не зависят от вендора, поэтому живут
// отдельно и переиспользуются всеми адаптерами (anthropic, openrouter). Так формат
// ответа модели проверяется одинаково, чем бы её ни обслуживали.

import type {
  CoachNotesResult,
  ChatReplyResult,
  HandAnalysisRequest,
  HandAnalysisResult,
  NextQuestionResult,
  PlayerCharacteristicResult,
  TournamentSummaryResult,
  VerdictResult,
} from "./types";
import type { Locale } from "@/i18n/config";

// Claude/DeepSeek иногда оборачивают JSON в markdown-код-блок несмотря на инструкцию — снимаем его.
export function extractJson(text: string): string {
  let s = text.trim();
  // Снять парную markdown-обёртку ```json … ``` (модель иногда оборачивает ответ).
  const fenced = s.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  if (fenced) {
    s = fenced[1].trim();
  } else {
    // Незакрытый/оборванный фенс (видели у Gemini: ```json { … без закрывающих ```) —
    // регулярка выше не матчится, поэтому срезаем ведущий и любой хвостовой ``` вручную.
    s = s.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  // Фолбэк: вычленить сам объект от первой { до последней } — срезает преамбулы
  // («Вот разбор:») и хвосты, которыми модель изредка обрамляет JSON. Чистый объект
  // (начинается с { и кончается }) не трогаем.
  const first = s.indexOf("{");
  const last = s.lastIndexOf("}");
  if (first >= 0 && last > first && (first > 0 || last < s.length - 1)) {
    s = s.slice(first, last + 1);
  }
  return s.trim();
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
  // «джем» изгнан из словаря (Артём, 2026-07-11): только «пуш»/«олл-ин».
  // Длинные формы раньше коротких, чтобы «реджемят» не превращался в кашу.
  ["ре-джемят", "ре-пушат"],
  ["реджемят", "ре-пушат"],
  ["ре-джемить", "ре-пушить"],
  ["реджемить", "ре-пушить"],
  ["ре-джема", "ре-пуша"],
  ["реджема", "ре-пуша"],
  ["ре-джемом", "ре-пушем"],
  ["реджемом", "ре-пушем"],
  ["ре-джем", "ре-пуш"],
  ["реджем", "ре-пуш"],
  ["джемить", "пушить"],
  ["джемишь", "пушишь"],
  ["джемите", "пушите"],
  ["джемим", "пушим"],
  ["джемит", "пушит"],
  ["джемят", "пушат"],
  ["джемил", "пушил"],
  ["джемнул", "пушнул"],
  ["джемами", "олл-инами"],
  ["джемам", "олл-инам"],
  ["джемах", "олл-инах"],
  ["джемов", "олл-инов"],
  ["джемом", "олл-ином"],
  ["джему", "олл-ину"],
  ["джеме", "олл-ине"],
  ["джема", "олл-ина"],
  ["джемы", "олл-ины"],
  ["джем", "олл-ин"],
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
  // Повторяющиеся опечатки/англицизмы GLM-off (аудит 2026-07-12, факты-v2): ловим
  // ИМЕННО замеченные повторные формы — не спелчекер (парсер прозу не пишет, её пишет
  // модель), а тот же точечный словарь, что джем→пуш. Одноразовые новые опечатки этим
  // не покрыть — против них только модель поумнее или reasoning low.
  ["топ-парту", "топ-пару"], // GLM устойчиво мажет «топ-пару» → «топ-парту» (3× на прогоне)
  ["префиоп", "префлоп"],
  ["смотрешь", "смотришь"],
  ["заколлировываешь", "заколлируешь"],
  // англицизмы «стак» (stack) → «стек» в замеченных падежах (осторожно, только формы «стак-»)
  ["против стака", "против стека"],
  ["стаком", "стеком"],
  ["стаку", "стеку"],
  // англ. слова, просочившиеся в русский текст (замеченные на прогоне)
  ["hoped", "надеялся"],
  ["playable-руки", "играбельной руки"],
  ["playable", "играбельной"],
  ["cheaper", "дешевле"], // тестер 12.07: «cheaper заколлирует» — англицизм в русском тексте
  // «без риска» запрещено фреймворком (риск есть у любой линии), но GLM изредка пишет
  // (регресс 2026-07-13, 1/92) — мягко чиним на «без лишнего риска» (риск не обнуляется).
  ["без риска", "без лишнего риска"],
];

// Латинские вкрапления, чистимые ТОЛЬКО в русском тексте (в en «Hero»/«vs» — легитимны/иначе, а «ты»
// в английский ответ подставлять нельзя). Регресс 2026-07-14: «Hero» — самый частый латинский мусор у
// обеих моделей; чистим падежные формы → «ты/тебя», чтобы не бракова́ть весь разбор из-за одного
// слова (раньше firstStrayLatin ронял ответ целиком, теряя до 16% разборов).
const RU_LATIN_FIXES: Array<[string, string]> = [
  ["у Hero", "у тебя"],
  ["у hero", "у тебя"],
  ["против Hero", "против тебя"],
  ["против hero", "против тебя"],
  ["для Hero", "для тебя"],
  ["для hero", "для тебя"],
  ["Hero", "ты"],
  ["hero", "ты"],
  [" vs ", " против "],
  ["Nash", "равновесие"],
  ["effectively", "по сути"],
  // Латинские покерные аббревиатуры-жаргон (регресс 2026-07-14) → русскими словами. Короткие
  // (IP) не чистим — рискуют задеть слова; их редкие вхождения добьёт бэкстоп (брак+ретрай).
  ["OOP", "вне позиции"],
  ["GTO", "по теории"],
];

// CJK-иероглифы (кит./яп./кор.) — редкий сбой мультиязычных моделей (GLM-5.2 на аудите
// 2026-07-11: 4 вкрапления на 92 раздачи, «大概率», «サイズ»). В русский текст игроку они
// попадать не должны; вычистить безопасно нельзя (ломается фраза), поэтому такой ответ
// бракуем целиком — очередь ретраит генерацию, свежий ответ почти всегда чистый.
const CJK_RE = /[぀-ヿ㐀-鿿豈-﫿가-힯]/;

// Латинские слова-галлюцинации и англицизмы в русском тексте игроку (COACH «## Язык»:
// латиницей допустимы ТОЛЬКО коды позиций и ранги/нотация карт). Промпт-запрет модель
// иногда нарушает (инцидент 2026-07-12: «HoFlush» вместо «флеша»), а словарь CASE_FIXES
// латает лишь известные формы — поэтому здесь код-бэкстоп: любой латинский токен вне белого
// списка бракует ответ целиком, очередь ретраит (как CJK). Пропускаем ТОЛЬКО: коды позиций,
// всё-заглавные аббревиатуры (SPR/ICM/GTO — внутренние, безобидны) и нотацию рук (A, AKs,
// QJo, T9s, Kx). Ловим слова со строчными латинскими буквами: value, showdown, HoFlush, Hero.
const POSITION_CODES = new Set(["UTG", "MP", "HJ", "CO", "LJ", "EP", "BTN", "SB", "BB"]);
// Разрешённые заглавные аббревиатуры — ЯВНЫМ списком, а не «любые 2-5 заглавных»: иначе сырые
// токены-действия из снимка (RAISE/CHECK/BET/CALL/FOLD) и англицизмы капсом (VALUE/FLUSH)
// проскакивают в текст игроку (инцидент «_RAISE_» на регрессе 2026-07-13).
const ABBREV = new Set(["SPR", "ICM", "GTO", "VPIP", "PFR", "MTT", "PKO", "EV", "BI", "RFI", "AF", "WTSD", "MDF"]);
const HAS_LATIN = /[A-Za-z]/;
const HAND_NOTATION = /^[AKQJT2-9]{1,2}[sox]?$/i; // A, K, AKs, QJo, T9s, Kx
const CARD_CODE = /^[AKQJT2-9][cdhs]$/i; // код карты из снимка: Kd, 7c, Ts (модель порой эхнёт)
const BLIND_TOKEN = /^\d*(bb|sb)$/i; // стек/ставка в блайндах: 20bb, 15sb, bb

// Цена ложного брака высока (3 ретрая очереди → POISONED + тревога), поэтому бракуем
// КОНСЕРВАТИВНО: только слова со строчными латинскими буквами (value, showdown, HoFlush,
// Hero), а всё двусмысленное пропускаем — коды позиций (регистронезависимо), заглавные
// аббревиатуры, нотацию рук, коды карт, стеки в блайндах, одиночные буквы (C-бет), числа.
function firstStrayLatin(text: string): string | null {
  // Токены — по буквам И цифрам, иначе нотация с цифрой рвётся (A6s → «A»+«s», ложный брак).
  const tokens = text.match(/[A-Za-z0-9]+/g);
  if (!tokens) return null;
  for (const t of tokens) {
    if (!HAS_LATIN.test(t)) continue; // чистые числа (стеки, банк) — не латиница
    if (t.length === 1) continue; // одиночная латинская буква (C-бет, инициал) — не мусор-слово
    if (POSITION_CODES.has(t.toUpperCase())) continue; // код позиции регистронезависимо
    if (ABBREV.has(t.toUpperCase())) continue; // разрешённая аббревиатура (SPR, ICM…)
    if (HAND_NOTATION.test(t)) continue; // нотация руки
    if (CARD_CODE.test(t)) continue; // код карты
    if (BLIND_TOKEN.test(t)) continue; // стек в блайндах
    return t; // латинское слово вне разрешённого — мусор/англицизм
  }
  return null;
}

// Карты, которые тренер вправе называть С МАСТЬЮ, — только реально существующие в раздаче: борд,
// карты Hero и вскрытые карты соперников. Всё остальное «K♥», названное со значком масти, — выдумка
// (регресс 2026-07-14: «9♥ 9♥ 8♦» с несуществующей второй девяткой червей; «каре тузов» на борде из
// четырёх двоек). Гипотетику модель пишет РАНГОМ без масти («любая семёрка»), её не трогаем.
const SUIT_SYM: Record<string, string> = { "♠": "s", "♥": "h", "♦": "d", "♣": "c" };
export function allowedCardSet(snapshot: {
  board?: string[];
  heroCards?: string[];
  seats?: { shownCards?: string[] }[];
}): Set<string> {
  const cards = [...(snapshot.board ?? []), ...(snapshot.heroCards ?? [])];
  for (const s of snapshot.seats ?? []) if (s.shownCards) cards.push(...s.shownCards);
  return new Set(cards.filter((c) => c && c.length >= 2).map((c) => c[0].toUpperCase() + c[1].toLowerCase()));
}
// Первая карта-со-значком-масти в тексте, которой НЕТ в снимке (выдуманная), или null.
function strayCard(text: string, allowed: Set<string>): string | null {
  const re = /([AKQJT2-9])\s*([♠♥♦♣])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const code = m[1].toUpperCase() + SUIT_SYM[m[2]];
    if (!allowed.has(code)) return `${m[1]}${m[2]}`;
  }
  return null;
}

export function cleanCoachText(text: string, locale: Locale = "ru", allowedCards?: Set<string>): string {
  if (CJK_RE.test(text)) {
    throw new Error("LLM вернул CJK-иероглифы в тексте для игрока");
  }
  // длинное тире запрещено словарём — всегда короткое с пробелами
  let out = text.replace(/\s*—\s*/g, " - ");
  for (const [from, to] of CASE_FIXES) {
    const capFrom = from[0].toUpperCase() + from.slice(1);
    const capTo = to[0].toUpperCase() + to.slice(1);
    out = out.split(from).join(to).split(capFrom).join(capTo);
  }
  // Латинский бэкстоп ТОЛЬКО для русского ответа (в en весь текст законно латиница) и ПОСЛЕ
  // словаря: замены «кнопка»→«BTN» создают легитимную латиницу, которая проходит как код позиции.
  if (locale === "ru") {
    // Сначала чистим известные латинские вкрапления (Hero→ты и т.п.), только потом бракуем остаток.
    for (const [from, to] of RU_LATIN_FIXES) {
      const capFrom = from[0].toUpperCase() + from.slice(1);
      const capTo = to[0].toUpperCase() + to.slice(1);
      out = out.split(from).join(to).split(capFrom).join(capTo);
    }
    // Сокращение «65k»/«65к» (тысячи фишек) → «65 тыс.» (регресс 2026-07-14: иначе «65k» бракуется).
    out = out.replace(/(\d+)\s*[kKкК]\b/g, "$1 тыс.");
    const stray = firstStrayLatin(out);
    if (stray !== null) {
      throw new Error(`LLM вернул латиницу в тексте для игрока: «${stray}»`);
    }
  }
  // Выдуманные карты (со значком масти вне снимка) — брак, очередь ретраит (Правило 1: борд священен).
  if (allowedCards) {
    const bad = strayCard(out, allowedCards);
    if (bad !== null) {
      throw new Error(`LLM назвал карту вне снимка: «${bad}»`);
    }
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

  // Допустимые карты раздачи — чтобы поймать выдуманные масти/карты в тексте (Правило 1).
  const cards = allowedCardSet(request.tableSnapshot);

  if (request.importanceLevel === "CRITICAL") {
    if (typeof result.question !== "string" || typeof result.draftVerdict !== "string") {
      throw new Error("LLM вернул CRITICAL-разбор без question/draftVerdict");
    }
    return {
      played: cleanCoachText(result.played, request.locale, cards),
      optimal: cleanCoachText(result.optimal, request.locale, cards),
      question: cleanCoachText(result.question, request.locale, cards),
      draftVerdict: cleanCoachText(result.draftVerdict, request.locale, cards),
      answerMode: parseAnswerMode(result.answerMode),
      tableActionIndex: parseTableActionIndex(result.tableActionIndex),
    };
  }

  if (typeof result.note !== "string") {
    throw new Error(`LLM вернул ${request.importanceLevel}-разбор без note`);
  }
  return {
    played: cleanCoachText(result.played, request.locale, cards),
    optimal: cleanCoachText(result.optimal, request.locale, cards),
    note: cleanCoachText(result.note, request.locale, cards),
  };
}

// allowedCards — набор карт снимка (борд+рука+вскрытия): вердикт/вопрос/чат тоже пересказывают
// борд, и модель может переврать масть (Gemini #8: «K♠» при K♥ на борде). Раньше карт-валидатор
// стоял только на разборе (validateHandAnalysis) — дыра во всех остальных ролях. Адаптер передаёт
// allowedCardSet(request.tableSnapshot).
export function validateVerdict(
  result: Partial<VerdictResult>,
  locale: Locale = "ru",
  allowedCards?: Set<string>,
): VerdictResult {
  if (typeof result.verdict !== "string") {
    throw new Error("LLM вернул вердикт без поля verdict");
  }
  return { verdict: cleanCoachText(result.verdict, locale, allowedCards) };
}

export function validateNextQuestion(
  result: Partial<NextQuestionResult>,
  locale: Locale = "ru",
  allowedCards?: Set<string>,
): NextQuestionResult {
  const complete = result.complete === true;
  // При complete=true вопрос не нужен (диалог завершён) — поле может отсутствовать.
  if (!complete && typeof result.question !== "string") {
    throw new Error("LLM вернул ответ без поля question");
  }
  return {
    complete,
    question: typeof result.question === "string" ? cleanCoachText(result.question, locale, allowedCards) : "",
    answerMode: parseAnswerMode(result.answerMode),
    tableActionIndex: parseTableActionIndex(result.tableActionIndex),
  };
}

export function validateChatReply(
  result: Partial<ChatReplyResult>,
  locale: Locale = "ru",
  allowedCards?: Set<string>,
): ChatReplyResult {
  if (typeof result.reply !== "string") {
    throw new Error("LLM вернул ответ без поля reply");
  }
  return { reply: cleanCoachText(result.reply, locale, allowedCards) };
}

export function validateTournamentSummary(
  result: Partial<TournamentSummaryResult>,
  locale: Locale = "ru",
): TournamentSummaryResult {
  if (typeof result.overview !== "string") {
    throw new Error("LLM вернул обзор турнира без overview");
  }
  return { overview: cleanCoachText(result.overview, locale) };
}

// Дневник тренера: массив заметок с необязательной ссылкой на прежнюю (basedOn ≥ 1).
// Кривые элементы отбрасываем поштучно (не валим весь ответ), тексты чистим словарём.
export function validateCoachNotes(result: { notes?: unknown }): CoachNotesResult {
  if (!Array.isArray(result.notes)) {
    throw new Error("LLM вернул дневник без массива notes");
  }
  const notes: CoachNotesResult["notes"] = [];
  for (const raw of result.notes) {
    const item = raw as { text?: unknown; basedOn?: unknown };
    if (typeof item?.text !== "string" || item.text.trim().length === 0) continue;
    const basedOn =
      typeof item.basedOn === "number" && Number.isInteger(item.basedOn) && item.basedOn >= 1
        ? item.basedOn
        : undefined;
    notes.push({ text: cleanCoachText(item.text), basedOn });
  }
  return { notes };
}

export function validatePlayerCharacteristic(
  result: Partial<PlayerCharacteristicResult>,
  locale: Locale = "ru",
): PlayerCharacteristicResult {
  if (typeof result.characteristic !== "string") {
    throw new Error("LLM вернул характеристику без поля characteristic");
  }
  return { characteristic: cleanCoachText(result.characteristic, locale) };
}
