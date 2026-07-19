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
import type { TableSnapshot } from "@/parser/types";
import { heroFirstPostflop } from "@/parser/action-order";

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
  [" bet ", " ставка "], // «bet» отдельным словом → «ставка» (регресс: чистим, а не бракуем)
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
// Аббревиатуры, которые тренер вправе оставить латиницей в русском тексте. Статистические термины
// СОПЕРНИКА (VPIP/PFR/WTSD/AF/MDF) сюда НЕ входят намеренно (P3 против галлюцинаций 2026-07-15):
// промпт велит прятать термины и не показывать стату соперника числом → если модель всё же пишет
// «VPIP 42%» игроку, латинский бэкстоп это бракует (throw→ретрай). SPR/ICM/GTO — частые/структурные,
// оставлены (SPR про свою руку, ICM/GTO ещё и чистятся словарём RU_LATIN_FIXES раньше).
const ABBREV = new Set(["SPR", "ICM", "GTO", "MTT", "PKO", "EV", "BI", "RFI"]);
const HAS_LATIN = /[A-Za-z]/;
const HAND_NOTATION = /^[AKQJT2-9]{1,2}[sox]?$/i; // A, K, AKs, QJo, T9s, Kx
const RANK_SEQ = /^[AKQJT2-9]{2,5}$/i; // последовательность рангов (стрит-нотация: QJT, T9, AKQ) — не мусор
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
    if (RANK_SEQ.test(t)) continue; // последовательность рангов (стрит QJT/T9) — не англ. слово
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
// Ранг → правильный значок масти для карт Hero, чей ранг УНИКАЛЕН у Hero И отсутствует на борде.
// Такую карту модель изредка пишет с ВЫДУМАННОЙ мастью (регресс #41: KQo, пиковая карта — дама, а
// модель написала «K♠»); раз в раздаче ровно один король и он у Hero, масть однозначна — ИСПРАВЛЯЕМ,
// а не бракуем (срезает лишний карантин). Карты БОРДА и неоднозначные ранги (есть и у Hero, и на
// борде) сюда НЕ попадают — их выдумку по-прежнему ловит strayCard.
const SYM_BY_LETTER: Record<string, string> = { s: "♠", h: "♥", d: "♦", c: "♣" };
export function heroSuitFixMap(snapshot: { heroCards?: string[]; board?: string[] }): Map<string, string> {
  const board = new Set((snapshot.board ?? []).filter((c) => c && c.length >= 1).map((c) => c[0].toUpperCase()));
  const hero = (snapshot.heroCards ?? []).filter((c) => c && c.length >= 2);
  const rankCount = new Map<string, number>();
  for (const c of hero) rankCount.set(c[0].toUpperCase(), (rankCount.get(c[0].toUpperCase()) ?? 0) + 1);
  const fix = new Map<string, string>();
  for (const c of hero) {
    const r = c[0].toUpperCase();
    const sym = SYM_BY_LETTER[c[1].toLowerCase()];
    if (rankCount.get(r) === 1 && !board.has(r) && sym) fix.set(r, sym);
  }
  return fix;
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

// Сторож порядка хода (Правило 1, 2026-07-15). Быстрая модель переворачивает очередь: пишет,
// что соперники сходили ДО Hero, хотя парсер знает — Hero ходил ПЕРВЫМ на постфлопе
// (heroFirstPostflop=true). Классический баг (раздача 5♦4♦, SB): «после того как CO и BTN
// чекнули, ты тоже чекнул» / «оба чекнули перед тобой» — а Hero (SB) чекал ПЕРВЫМ. Автофиксить
// нельзя (надо переписать фразу) → бракуем как выдуманную карту, очередь ретраит. Паттерн УЗКИЙ,
// вокруг ЧЕКА: постфлоп-маркер (префлоп добровольно чекает лишь закрывающий BB), поэтому
// чек-инверсия почти всегда про постфлоп — цена ложного брака (3 ретрая → карантин) у нуля.
// Редкие непойманные формы («ты чекнул за ними») добьём по жалобам, как остальные заплатки.
// Без \w/\b: в JS они ASCII-only, на кириллице не работают («\bты\b» никогда не матчится). «перед
// тобой» однозначно позиционно; «до тебя» берём ТОЛЬКО когда сразу примыкает к чеку (иначе «до тебя
// не дойдёт ставка» — ложный брак). Окна узкие. Все три ловят реальные вранья с прод-раздачи 5♦4♦.
const CHECK_INVERSION_RES: RegExp[] = [
  /чекну[^.!?]{0,40}?перед тобой/i, // «…чекнули перед тобой»
  /(?:перед тобой|до тебя)[^.!?]{0,25}?чекну/i, // «перед тобой чекнули…», «до тебя чекнул»
  /после\s+того[,\s]+как[^.!?]{0,90}?чекну[^.!?]{0,40}?[\s,]ты[\s,.]/i, // «после того как … чекнули, ты …»
];
function violatesActionOrder(text: string): boolean {
  return CHECK_INVERSION_RES.some((re) => re.test(text));
}

// ── Сторож выдуманного вскрытия ─────────────────────────────────────────────────────────────
// Регресс 2026-07-17 (50 раздач, 3.1-flash-lite): тренер УТВЕРЖДАЕТ, какая рука была у соперника,
// хотя никто не вскрывался: «у соперника на SB оказался старший фулл-хаус с восьмерками», «с
// руками вроде AA, которые он в итоге показал». Самый опасный класс: игрок САМ играл эту раздачу
// и помнит, что там было, — враньё ловится за секунду и убивает доверие (критическая поломка №2).
// Факт «никто не вскрылся, не пиши „у него оказался“» в промпте УЖЕ есть (parser/facts.ts,
// renderShowdownFacts) — и модель его игнорирует. Значит ловим на выходе, как порядок хода.
//
// Включается ТОЛЬКО когда вскрытых карт в снимке нет вовсе (иначе про вскрывшихся говорить можно).
// Намеренно УЗКИЙ, как сторож порядка хода: ловим лишь ИЗЪЯВИТЕЛЬНОЕ утверждение о конкретной
// комбинации/руке. Гипотезы («у него МОГ быть фулл», «возможно, показал бы») — законный язык
// тренера, их не трогаем: ложный брак = 3 ретрая = карантин у живого игрока.
// Теневой прогон на 50 раздачах: поймано 2 (оба — настоящее враньё), ложных 0.
// ⚠️В JS `\w` и `\b` НЕ работают с кириллицей (тот же грабль, что у сторожа порядка хода выше) —
// поэтому везде явные классы [а-яё] и пробельные границы, а не \w/\b.
const RU = "[а-яё]";
const SHOWDOWN_COMBO =
  `(?:фулл[-\\s]?хаус${RU}*|каре|сет${RU}*|трипс${RU}*|флеш${RU}*|стрит${RU}*|две\\s+пары|оверпар${RU}+|топ[-\\s]пар${RU}+|[AKQJT98765432]{2}[so]?(?![A-Za-zА-Яа-я]))`;
const INVENTED_SHOWDOWN_RES: RegExp[] = [
  // «у соперника (на SB) оказался фулл», «он в итоге показал сет»
  new RegExp(
    `(?:у\\s+(?:него|соперника|оппонента|BB|SB|BTN|CO|HJ|LJ|UTG)(?![а-яё])[^.!?]{0,25}?(?:оказал${RU}+|был[аи]?(?![а-яё]))` +
      `|(?:он|соперник|оппонент)(?![а-яё])[^.!?]{0,20}?(?:в\\s+итоге\\s+)?(?:показал|вскрыл|оказал${RU}+))` +
      `[^.!?]{0,50}?${SHOWDOWN_COMBO}`,
    "i",
  ),
  // «с руками вроде AA, которые он в итоге показал» — комбинация стоит ПЕРЕД глаголом
  new RegExp(
    `${SHOWDOWN_COMBO}[^.!?]{0,40}?(?:котор${RU}+|что)\\s+(?:он|соперник|оппонент)(?![а-яё])[^.!?]{0,20}?` +
      `(?:в\\s+итоге\\s+)?(?:показал|вскрыл|имел|держал)`,
    "i",
  ),
];
// Сослагательное/предположительное рядом — это гипотеза, а не утверждение факта.
const SHOWDOWN_HYPOTHESIS_RE = new RegExp(
  `(?:^|[^а-яё])(?:мог${RU}*|бы|если|возможно|вероятно|наверн${RU}+|предполож${RU}+|допустим)(?![а-яё])`,
  "i",
);

// true — текст УТВЕРЖДАЕТ конкретную руку соперника (не гипотеза). Проверяем по предложениям:
// «мог» в соседней фразе не должен оправдывать утверждение в этой.
export function inventsShowdown(text: string): boolean {
  return text
    .split(/(?<=[.!?])\s+/)
    .some((sentence) => !SHOWDOWN_HYPOTHESIS_RE.test(sentence) && INVENTED_SHOWDOWN_RES.some((re) => re.test(sentence)));
}

// Есть ли в снимке хоть одно вскрытие. Нет — включаем сторож выдуманного вскрытия.
export function noShowdownInHand(snapshot: TableSnapshot): boolean {
  return !snapshot.seats.some((s) => s.label !== "Hero" && (s.shownCards?.length ?? 0) === 2);
}

// ── Сторож выдуманной карманной пары ────────────────────────────────────────────────────────
// Регресс 2026-07-17 (#25, T3o на 3s3hJd5h3c): «колл 3-бета С КАРМАННОЙ ПАРОЙ … стандартный
// СЕТ-МАЙНИНГ» — при разномастных T3o. Двойная цена: игрок видит, что тренер не смотрит в его
// карты, И получает вредный совет (коллировать 3-бет мусором).
//
// Ловим НЕ слово «сет»: промпт проекта прямо РАЗРЕШАЕТ звать трипс сетом («игрок поймёт любое
// одинаково»), и сторож на «сет» бракова́л бы 14% раздач за выполнение промпта. Ловим утверждение
// о СТАРТОВОЙ руке — его промпт не разрешает нигде.
// Гейт неоспорим: карты Hero разного ранга. Теневой прогон по 262 раздачам / 597 текстам:
// 1 брак (#25, настоящее враньё), ложных 0.
// ⚠️Кириллица: никаких \w и \b — только [а-яё] и (?![а-яё]).
const POCKET_PAIR_RES: RegExp[] = [
  new RegExp(`карманн${RU}+\\s+пар${RU}+`, "i"),
  new RegExp(`пар${RU}*\\s+в\\s+кармане`, "i"),
  new RegExp(`сет[-\\s]?майн${RU}*`, "i"),
];
// Якорь «речь про Hero». «тебя/тебе» БЕЗ «у» намеренно НЕ маркер: «руки, которые тебя обносят, —
// это J9 и карманные пары выше десятки» — там Hero дополнение, а пары чужие (единственный ложный
// брак на корпусе, снят этим).
const HERO_MARK_RE = new RegExp(`(?:^|[^а-яё])(?:ты|у\\s+теб[яе]|тобой|тво${RU}+|сво${RU}+)(?![а-яё])`, "gi");
const OPP_MARK_RE = new RegExp(
  `(?:^|[^а-яё])(?:соперник${RU}*|оппонент${RU}*|он|его|ему|им|него|нём|ним|диапазон${RU}*|люб${RU}+|пол[ея]|микролимит${RU}*)(?![а-яё])`,
  "gi",
);
const COUNTERFACT_RE = /(?:если\s+бы|будь\s|представь|вообрази|допустим)/i;
const POCKET_NEG_RE = new RegExp(`(?:^|[^а-яё])(?:не|нет|никак${RU}*|вместо)(?![а-яё])`, "i");

function lastMarkIndex(s: string, re: RegExp): number {
  re.lastIndex = 0;
  let last = -1;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) last = m.index;
  return last;
}

// true — текст приписывает КАРМАННУЮ ПАРУ игроку (не сопернику, не гипотетически).
export function claimsPocketPair(text: string): boolean {
  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (COUNTERFACT_RE.test(sentence)) continue; // «будь у тебя пара…» — законная гипотеза
    for (const re of POCKET_PAIR_RES) {
      const m = re.exec(sentence);
      if (!m) continue;
      const before = sentence.slice(0, m.index);
      if (POCKET_NEG_RE.test(before.slice(-30))) continue; // «у тебя НЕ карманная пара» — законно
      const hero = lastMarkIndex(before, HERO_MARK_RE);
      if (hero < 0) continue; // нет якоря на Hero — молчим
      if (lastMarkIndex(before, OPP_MARK_RE) > hero) continue; // ближе соперник — пара чужая
      return true;
    }
  }
  return false;
}

// У Hero заведомо НЕТ карманной пары (карты разного ранга). Снимок кривой → false: не уверены — молчим.
export function heroNoPocketPair(snapshot: TableSnapshot): boolean {
  const c = (snapshot.heroCards ?? []).filter((x) => x && x.length >= 2);
  if (c.length !== 2) return false;
  return c[0][0].toUpperCase() !== c[1][0].toUpperCase();
}

// Пересказ ПОСТАНОВКИ анте/блайндов как «действия» игрока (Артём 17.07: «вносишь анте и малый
// блайнд» — не нужная информация). Промпт запрещает это ТРИЖДЫ (hand-analysis.ts: «никогда не
// пересказывай их как действие», «начинай с первого добровольного действия», «без зачинов») и НЕ
// помогает. Режем оборот детерминированно: глагол постановки + только служебные слова про
// анте/блайнды после него. ⚠️Требуем ≥1 слово из набора СРАЗУ после глагола — «ставишь треть
// банка» (треть не в наборе) НЕ трогаем; «ставишь малый блайнд» — трогаем (это и есть пересказ).
const BLIND_POSTING_RE =
  /\s*(?:,\s*)?(?:вносишь|ставишь|выставляешь|платишь|постишь|отдаёшь|кладёшь|вкладываешь)(?:\s+(?:анте|блайнд[а-яё]*|малый|большой|обязательн[а-яё]*|и))+/giu;

export function cleanCoachText(
  text: string,
  locale: Locale = "ru",
  allowedCards?: Set<string>,
  heroFix?: Map<string, string>,
  heroFirstPostflop?: boolean,
  noShowdown?: boolean,
  noPocketPair?: boolean,
): string {
  if (CJK_RE.test(text)) {
    throw new Error("LLM вернул CJK-иероглифы в тексте для игрока");
  }
  // длинное тире запрещено словарём — всегда короткое с пробелами
  let out = text.replace(/\s*—\s*/g, " - ");
  // Пересказ постановки блайндов/анте вырезаем (см. BLIND_POSTING_RE) и подчищаем осиротевшие
  // пробелы/знаки: «ты на SB (29 BB) вносишь анте и малый блайнд. Игрок…» → «ты на SB (29 BB). Игрок…».
  const withoutBlinds = out.replace(BLIND_POSTING_RE, "");
  if (withoutBlinds !== out) {
    out = withoutBlinds.replace(/\s+([.,;:!?)])/g, "$1").replace(/\s{2,}/g, " ");
  }
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
    // Разговорная запись десятки «10d/10h/10c/10s» → наша нотация «Td/Th/Tc/Ts» (регресс 2026-07-17:
    // модель пишет десятку по-бытовому, хотя весь снимок и вся карточка знают её только как «T» —
    // латинский бэкстоп бракует «10d» целиком, а карта-то настоящая, просто записана иначе).
    out = out.replace(/\b10([cdhs])\b/gi, (_, suit: string) => `T${suit.toLowerCase()}`);
    // Буквенный код масти из снимка («на борде 4c 5c 8c 6c Kd») игроку непонятен — переводим в
    // значок. Промпт этого просит прямым текстом, но модель регулярно срывается (Артём 19.07:
    // «в описании раздачи всё ещё буквами»), а просьбы у нас держат плохо — делаем кодом.
    // ⚠️Конвертируем ТОЛЬКО карты, реально существующие в раздаче: иначе наша же замена
    // ЛЕГАЛИЗОВАЛА бы выдуманную карту, которую обязан забраковать strayCard. Чужая карта остаётся
    // буквами и упирается в латинский бэкстоп ниже — то есть по-прежнему ловится.
    if (allowedCards) {
      out = out.replace(/\b([AKQJTakqjt2-9])([cdhs])\b/g, (m, rank: string, suit: string) => {
        const code = rank.toUpperCase() + suit.toLowerCase();
        const sym = SYM_BY_LETTER[suit.toLowerCase()];
        return sym && allowedCards.has(code) ? `${rank.toUpperCase()}${sym}` : m;
      });
    }
    // Сокращение «65k»/«65к» (тысячи фишек) → «65 тыс.» (регресс 2026-07-14: иначе «65k» бракуется).
    out = out.replace(/(\d+)\s*[kKкК]\b/g, "$1 тыс.");
    // «В турнире на 8 мест» — бессмыслица: 8 мест это размер СТОЛА, а не число участников турнира
    // (Артём 19.07: «что за турнир на 8 мест?»). Парсер отдаёт корректное «За столом 8 мест»,
    // а модель переклеивает его на турнир. Возвращаем на место.
    out = out.replace(/\bв\s+турнире\s+(на\s+\d+\s+мест)/giu, "за столом $1");
    // Служебная метка места из снимка («Player 4») — модель иногда копирует её вместо позиции.
    // Чистим в «соперник», а НЕ бракуем: иначе карантин (регресс 2026-07-14 при переходе на Gemini —
    // она тащит «Player N» заметно чаще GLM). Промпт по-прежнему велит звать позицией; это лишь
    // предохранитель. Корневой фикс — убрать «Player N» из самого снимка — отдельно.
    out = out.replace(/\bPlayers?\s*\d*/gi, "соперник");
    const stray = firstStrayLatin(out);
    if (stray !== null) {
      throw new Error(`LLM вернул латиницу в тексте для игрока: «${stray}»`);
    }
  }
  // Автофикс масти карманной карты Hero ДО браковки: выдуманную масть однозначной карты Hero
  // (ранг уникален у Hero и не на борде) исправляем на настоящую, а не отправляем в карантин
  // (регресс #41). Карты борда и неоднозначные ранги это не затрагивает — их выдумку ловит strayCard.
  if (heroFix && heroFix.size > 0) {
    out = out.replace(/([AKQJT2-9])([♠♥♦♣])/g, (m, rank: string, suit: string) => {
      const correct = heroFix.get(rank.toUpperCase());
      return correct && correct !== suit ? `${rank}${correct}` : m;
    });
  }
  // Выдуманные карты (со значком масти вне снимка) — брак, очередь ретраит (Правило 1: борд священен).
  if (allowedCards) {
    const bad = strayCard(out, allowedCards);
    if (bad !== null) {
      throw new Error(`LLM назвал карту вне снимка: «${bad}»`);
    }
  }
  // Перевранный порядок хода (соперники поставлены до Hero, хотя Hero ходит первым постфлоп) —
  // брак, очередь ретраит (Правило 1: порядок считает парсер). Флаг включает адаптер/валидатор
  // только когда парсер уверен, что Hero первый (heroFirstPostflop) — иначе «перед тобой» законно.
  if (heroFirstPostflop && violatesActionOrder(out)) {
    throw new Error("LLM переврал порядок хода: соперники поставлены до Hero, хотя Hero ходит первым постфлоп");
  }
  // Выдуманное вскрытие: тренер утверждает конкретную руку соперника, хотя никто не вскрывался.
  // Флаг ставит вызывающий (валидатор/адаптер) по снимку — noShowdownInHand.
  if (noShowdown && inventsShowdown(out)) {
    throw new Error("LLM выдумал вскрытие: утверждает руку соперника, хотя карт никто не показал");
  }
  // Выдуманная карманная пара: тренер приписывает Hero пару/сет-майнинг при разномастных картах.
  if (noPocketPair && claimsPocketPair(out)) {
    throw new Error("LLM выдумал карманную пару: приписал Hero пару или сет-майнинг, хотя карты разного ранга");
  }
  return out;
}

// Детерминированный вырез ритуального зачина «Ты прав» из НАЧАЛА вердикта (Артём, 17.07: «5 раздач
// подряд каждый раз Ты прав, меня бесит»). Промпт запрещает это тремя абзацами (verdict.ts:25-28) и
// НЕ помогает — 5/5 вердиктов открывались «Ты прав». Режем как чистку (не брак → без карантина):
// сам вердикт остаётся, уходит только реверанс, дальше — сразу суть. Правду про «стандартно/
// хорошее эквити» чинит отдельно эквити-факт против вскрытых рук (facts.ts).
// ⚠️`(?![а-яё])` — кириллическая граница: без неё «ты правда»/«ты правильно» ложно матчились бы
// («прав»+«да»/«ильно»), а \b с кириллицей в JS не работает.
const SYCOPHANT_OPENER =
  /^\s*(?:да[,!\s—–-]+)?ты\s+прав(?![а-яё])(?:\s+в\s+том,?\s+что)?\s*[:,.—–\-]*\s*/iu;
export function stripSycophanticOpener(text: string): string {
  const m = text.match(SYCOPHANT_OPENER);
  if (!m) return text;
  const rest = text.slice(m[0].length).trimStart();
  if (rest.length < 10) return text; // почти пустой остаток («Ты прав.») — не курочим
  return rest.charAt(0).toUpperCase() + rest.slice(1);
}

// Строго: режим ответа сеткой включается ТОЛЬКО литералом "range". Любое другое
// значение (или его отсутствие) — обычный текстовый ответ.
export function parseAnswerMode(value: unknown): "range" | undefined {
  return value === "range" ? "range" : undefined;
}

// Действие из optimal одним русским словом — канал к вердикту (см. HandAnalysisResult.optimalAction).
// Принимаем ТОЛЬКО слова из списка: мусор («колл, но осторожно», «RAISE») отбрасываем в undefined —
// тогда вердикт просто не получит строку-факт и сработает как раньше. Браковать разбор из-за этого
// поля нельзя: ложный брак = 3 ретрая = карантин у живого игрока.
const OPTIMAL_ACTIONS = ["сброс", "чек", "колл", "ставка", "рейз", "олл-ин"] as const;
export function parseOptimalAction(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const v = value.trim().toLowerCase().replace(/[.,;!]+$/, "");
  return (OPTIMAL_ACTIONS as readonly string[]).includes(v) ? v : undefined;
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
  // Автофикс масти однозначной карманной карты Hero (см. heroSuitFixMap) — до браковки.
  const fix = heroSuitFixMap(request.tableSnapshot);
  // Сторож порядка хода: включаем, только если парсер уверен, что Hero ходит первым постфлоп.
  const heroFirst = heroFirstPostflop(request.tableSnapshot);
  // Сторож выдуманной карманной пары — только в РАЗБОРЕ: именно тут родился совет «сет-майнинг»
  // рукой T3o (#25). В чат и вердикт не тащим: там игрок сам может спросить «а будь у меня пара?»,
  // и база ложных срабатываний не измерена.
  const noPair = heroNoPocketPair(request.tableSnapshot);

  if (request.importanceLevel === "CRITICAL") {
    if (typeof result.question !== "string" || typeof result.draftVerdict !== "string") {
      throw new Error("LLM вернул CRITICAL-разбор без question/draftVerdict");
    }
    return {
      played: cleanCoachText(result.played, request.locale, cards, fix, heroFirst, undefined, noPair),
      optimal: cleanCoachText(result.optimal, request.locale, cards, fix, heroFirst, undefined, noPair),
      optimalAction: parseOptimalAction(result.optimalAction),
      question: cleanCoachText(result.question, request.locale, cards, fix, heroFirst, undefined, noPair),
      draftVerdict: cleanCoachText(result.draftVerdict, request.locale, cards, fix, heroFirst, undefined, noPair),
      answerMode: parseAnswerMode(result.answerMode),
      tableActionIndex: parseTableActionIndex(result.tableActionIndex),
    };
  }

  if (typeof result.note !== "string") {
    throw new Error(`LLM вернул ${request.importanceLevel}-разбор без note`);
  }
  return {
    played: cleanCoachText(result.played, request.locale, cards, fix, heroFirst, undefined, noPair),
    optimal: cleanCoachText(result.optimal, request.locale, cards, fix, heroFirst, undefined, noPair),
    note: cleanCoachText(result.note, request.locale, cards, fix, heroFirst, undefined, noPair),
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
  heroFix?: Map<string, string>,
  heroFirstPostflop?: boolean,
  // Никто не вскрылся → включаем сторож выдуманного вскрытия (регресс 17.07: «у соперника на SB
  // оказался старший фулл» при пустом shownCards). Только вердикт и чат: там вскрытие уместно
  // обсуждать, а на стадии вопросов карты соперников прячутся намеренно.
  noShowdown?: boolean,
): VerdictResult {
  if (typeof result.verdict !== "string") {
    throw new Error("LLM вернул вердикт без поля verdict");
  }
  const cleaned = cleanCoachText(result.verdict, locale, allowedCards, heroFix, heroFirstPostflop, noShowdown);
  // Вырезаем ритуальный зачин «Ты прав» ПОСЛЕ общей чистки (иначе тире/латиница внутри зачина
  // могли бы сбить матч). Только для вердикта — в played/вопросе такого зачина не бывает.
  return { verdict: stripSycophanticOpener(cleaned) };
}

export function validateNextQuestion(
  result: Partial<NextQuestionResult>,
  locale: Locale = "ru",
  allowedCards?: Set<string>,
  heroFix?: Map<string, string>,
  heroFirstPostflop?: boolean,
): NextQuestionResult {
  const complete = result.complete === true;
  // При complete=true вопрос не нужен (диалог завершён) — поле может отсутствовать.
  if (!complete && typeof result.question !== "string") {
    throw new Error("LLM вернул ответ без поля question");
  }
  const cleaned =
    typeof result.question === "string"
      ? cleanCoachText(result.question, locale, allowedCards, heroFix, heroFirstPostflop)
      : "";
  // Вопрос выветрился в пустоту (санитайзер вычистил весь текст, либо модель прислала «»)
  // при НЕзавершённом диалоге. Раньше это создавало вопрос-пустышку «{{table:N}}» без текста:
  // ответить не на что, вердикт не наступал — диалог зависал (инцидент 2026-07-15, раздача AJo).
  // Трактуем как «спрашивать больше нечего» → complete: диалог грациозно уходит в вердикт.
  if (!complete && cleaned.trim() === "") {
    return {
      complete: true,
      question: "",
      answerMode: parseAnswerMode(result.answerMode),
      tableActionIndex: parseTableActionIndex(result.tableActionIndex),
    };
  }
  return {
    complete,
    question: cleaned,
    answerMode: parseAnswerMode(result.answerMode),
    tableActionIndex: parseTableActionIndex(result.tableActionIndex),
  };
}

export function validateChatReply(
  result: Partial<ChatReplyResult>,
  locale: Locale = "ru",
  allowedCards?: Set<string>,
  heroFix?: Map<string, string>,
  heroFirstPostflop?: boolean,
  noShowdown?: boolean, // см. validateVerdict
): ChatReplyResult {
  if (typeof result.reply !== "string") {
    throw new Error("LLM вернул ответ без поля reply");
  }
  return { reply: cleanCoachText(result.reply, locale, allowedCards, heroFix, heroFirstPostflop, noShowdown) };
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
