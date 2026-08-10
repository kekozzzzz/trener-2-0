import type { Street, TableSnapshot } from "./types";
import { computeHandFacts } from "./facts";

// ── Сторож перевранного пересказа раздачи (Правило 1, 2026-08-07) ───────────────────────────
// Поле `played` — единственный текст, который модель пишет ПРОЗОЙ про ход раздачи, и он всегда
// висит вверху страницы. Регресс 07.08 (66 на T♥K♣5♥): парсер отдал верный порядок хода («до
// тебя: BB бет, HJ фолд, CO колл»), а модель пересказала «UTG+1, HJ и CO сбросили» — CO на самом
// деле ЗАКОЛЛИРОВАЛ бет до хода Hero. Дальше по этому же кривому пересказу писался вердикт:
// «против широкого диапазона BB», то есть как в хедз-апе, и верный мультивей-фолд был объявлен
// «излишне осторожным». Один выдуманный фолд стирает соперника из раздачи и переворачивает
// разбор целиком — это ровно тот класс вранья, который игрок ловит за секунду (поломка №2).
//
// Ловим САМОЕ безусловное: пересказ говорит, что игрок сбросил на улице, где парсер видит его
// ДЕЙСТВИЕ и НЕ видит фолда. Всё сомнительное пропускаем — ложный брак стоит трёх ретраев и
// карантина у живого игрока:
//  • улица не названа или названа сразу пара улиц («на тёрне и ривере») — молчим;
//  • на этой улице место вообще не действовало (сбросило раньше) — молчим;
//  • фраза сослагательная («если бы CO сбросил») — молчим;
//  • в самой фразе названа другая улица («а CO сбросил только на ривере») — молчим;
//  • глагол не примыкает к позиции через чистый список — молчим.
// ⚠️Кириллица: `\b` и `\w` в JS ASCII-only (тот же грабль, что у сторожей в parse.ts) — везде
// явные классы [а-яё] и (?![а-яё]).

const STREET_BY_WORD: Record<string, Street> = {
  префлоп: "PREFLOP",
  флоп: "FLOP",
  тёрн: "TURN",
  терн: "TURN",
  ривер: "RIVER",
};

// Заголовок улицы в пересказе: «На префлопе…», «на флопе», «Тёрн:». Форму слова не разбираем —
// достаточно основы, окончание съедаем. Лукбехайнд отсекает хвосты чужих слов («постФЛОП»).
const STREET_RE = /(?<![а-яё])(префлоп|флоп|тёрн|терн|ривер)[а-яё]*/gi;

// Позиции так, как они появляются в тексте (латиница из белого списка cleanCoachText).
// Порядок важен: «UTG+1» должен матчиться раньше «UTG».
const POSITION_RE = /(?<![A-Za-z0-9])(?:UTG\+\d|UTG|MP\d?|LJ|HJ|CO|BTN|SB|BB)(?![A-Za-z0-9])/g;

// Глагол сброса. «пас» отдельным словом не берём — слишком много ложных форм.
const FOLD_VERB_RE = /(?:сброс|выброс|спасова|фолд|пасова)[а-яё]*/gi;

// Сослагательное/гипотетическое в предложении — законный язык тренера, не утверждение факта.
const HYPOTHETICAL_RE =
  /(?:^|[^а-яё])(?:если|бы|мог[а-яё]*|представ[а-яё]+|вообрази[а-яё]*|допустим|предполож[а-яё]+|вместо)(?![а-яё])/i;

// Между позициями списка допускаем только разделители: «UTG+1, HJ и CO сбросили».
const LIST_SEPARATOR_RE = /^[\s,]*(?:и|а\s+также)?[\s,]*$/i;

type Header = { start: number; end: number; streets: Street[] };

type Token = { index: number; end: number; name: string };

function readHeaders(text: string): Header[] {
  const headers: Header[] = [];
  STREET_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = STREET_RE.exec(text)) !== null) {
    const street = STREET_BY_WORD[m[1].toLowerCase()];
    if (!street) continue;
    const prev = headers[headers.length - 1];
    // Соседний заголовок через чистый разделитель — это один заголовок про несколько улиц
    // («на тёрне и ривере»): к какой из них относить фолд, неизвестно.
    if (prev && LIST_SEPARATOR_RE.test(text.slice(prev.end, m.index))) {
      prev.streets.push(street);
      prev.end = m.index + m[0].length;
      continue;
    }
    headers.push({ start: m.index, end: m.index + m[0].length, streets: [street] });
  }
  return headers;
}

// Позиции в отрезке текста. «BB»/«SB» после числа — единица измерения («5.9 BB»), не позиция.
function readPositions(segment: string): Token[] {
  const tokens: Token[] = [];
  POSITION_RE.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = POSITION_RE.exec(segment)) !== null) {
    if ((m[0] === "BB" || m[0] === "SB") && /\d[\s.,]*$/.test(segment.slice(0, m.index))) continue;
    tokens.push({ index: m.index, end: m.index + m[0].length, name: m[0] });
  }
  return tokens;
}

// Кому пересказ приписывает этот глагол сброса. Берём позицию, ПРИМЫКАЮЩУЮ к глаголу (между ними
// только пробелы), и раскручиваем список назад через разделители. «BB поставил 5.9 BB, а CO
// сбросил» → только CO: между BB и CO стоит текст, а не разделитель.
function foldSubjects(segment: string, verbIndex: number, tokens: Token[]): string[] {
  let i = tokens.length - 1;
  while (i >= 0 && tokens[i].end > verbIndex) i--;
  if (i < 0) return [];
  if (!/^\s*$/.test(segment.slice(tokens[i].end, verbIndex))) return [];

  const subjects = [tokens[i].name];
  for (let j = i - 1; j >= 0; j--) {
    if (!LIST_SEPARATOR_RE.test(segment.slice(tokens[j].end, tokens[j + 1].index))) break;
    subjects.push(tokens[j].name);
  }
  return subjects;
}

// Границы предложения, внутри которого стоит глагол. Считаем по ПОЛНОМУ тексту, а не по сегменту:
// сегмент обрезан заголовком следующей улицы, и «а CO сбросил только на ривере» потеряло бы слово
// «ривере» вместе с ним — ровно тот случай, ради которого проверка и нужна.
function sentenceBounds(text: string, index: number): { start: number; end: number } {
  let start = 0;
  let end = text.length;
  for (let i = index; i >= 0; i--) {
    if (".!?".includes(text[i])) {
      start = i + 1;
      break;
    }
  }
  for (let i = index; i < text.length; i++) {
    if (".!?".includes(text[i])) {
      end = i;
      break;
    }
  }
  return { start, end };
}

const FORCED = new Set(["POST_ANTE", "POST_SB", "POST_BB"]);

// Что парсер знает про место на этой улице: действовало ли оно и сбрасывало ли.
function streetFacts(snapshot: TableSnapshot, label: string, street: Street) {
  const acts = snapshot.actions.filter((a) => a.actor === label && a.street === street && !FORCED.has(a.action));
  return { acted: acts.length > 0, folded: acts.some((a) => a.action === "FOLD") };
}

// Позиция в тексте → место в снимке. Hero пропускаем: пересказ зовёт его «ты», а не позицией.
function seatByPosition(snapshot: TableSnapshot, name: string): string | null {
  const seat = snapshot.seats.find((s) => s.label !== "Hero" && (s.positionName ?? s.position) === name);
  return seat ? seat.label : null;
}

// ── Сторож выдуманного размера ставки ───────────────────────────────────────────────────────
// Тот же регресс 07.08: бет был 5.9 в банк 23.4 (парсер отдал «Ставка соперника (BB, FLOP):
// ≈25% банка»), а вердикт написал «когда получишь ставку в полбанка». Цифру модель округлила
// от себя — и правило, которое игрок должен унести с собой, повисло на чужом размере: он будет
// применять его к полубанковым ставкам, хотя столкнулся с четвертью.
//
// Ловим ТОЛЬКО долю банка, приписанную РЕАЛЬНОЙ ставке этой раздачи, которой в раздаче нет.
// Совет на будущее с любым размером («в следующий раз ставь треть банка») законен и не трогается:
// его отсекает вето на предписывающие глаголы. Полосы нарочно широкие — брак должен быть
// бесспорным, а не «на 3% мимо».
const POT_FRACTIONS: { re: RegExp; min: number; max: number; name: string }[] = [
  { re: /три\s+четверти\s+банка|3\/4\s*банка/i, min: 60, max: 95, name: "три четверти банка" },
  { re: /две\s+трети\s+банка|2\/3\s*банка/i, min: 52, max: 88, name: "две трети банка" },
  { re: /пол\s?-?\s?банка|половин[аыу]\s+банка|1\/2\s*банка/i, min: 38, max: 70, name: "полбанка" },
  { re: /(?<!две\s)(?<!2\/)трет[ьи]\s+банка|1\/3\s*банка/i, min: 20, max: 47, name: "треть банка" },
  { re: /(?<!три\s)(?<!3\/)четверт[ьи]\s+банка|1\/4\s*банка/i, min: 10, max: 37, name: "четверть банка" },
  { re: /в\s+размер\s+банка|размером?\s+в\s+банк(?![а-яё])/i, min: 78, max: 140, name: "ставка в размер банка" },
];

// ⚠️Рамка «это СЛУЧИЛОСЬ» — только прошедшее/полученное действие конкретного лица. Первая версия
// сторожа (08.08) брала любое слово «ставка/бет» рядом с долей банка и на эталонном прогоне дала
// 9 браков на 30 раздач — все ложные: тренер законно обсуждает АЛЬТЕРНАТИВНЫЕ размеры («контбет в
// 1/3 банка часто забирает банк сразу»), и это не утверждение о сыгранной ставке. Ложный брак в
// проде = три ретрая = карантин у живого игрока, поэтому рамку сузили до глаголов факта.
const REAL_BET_RE =
  /(?:^|[^а-яё])(?:поставил[а-яё]*|поставили|ставил[а-яё]*|получил[а-яё]*\s+ставку|получишь\s+ставку|столкнул[а-яё]+\s+со?\s+ставкой|в\s+ответ\s+на\s+(?:его\s+)?ставку|(?:его|её|твоя|твою|твоей)\s+ставка[а-яё]*|ставка\s+(?:была|составила))(?![а-яё])/i;
// Гипотеза, совет или разбор несыгранной линии — размер тут любой, это не факт раздачи.
// «бы» и «часто/обычно/лучше» намеренно в списке: ими и опознаётся рассуждение об альтернативе.
const PRESCRIPTIVE_RE =
  /(?:^|[^а-яё])(?:ставь|поставь|поставить|ставить|стоило|следовало|надо\s+было|нужно\s+было|можно\s+было|сыграть|бы|если|часто|обычно|лучше|стандарт[а-яё]*|вместо|около|примерно)(?![а-яё])/i;

// Все доли банка, которые в этой раздаче реально ставились (постфлоп; префлоп в % банка не меряют).
function realBetPcts(snapshot: TableSnapshot): number[] {
  const f = computeHandFacts(snapshot);
  return [...f.bets.map((b) => b.sizePctOfPot), ...f.heroBets.map((b) => b.sizePctOfPot)];
}

// Название доли банка, которой в раздаче не было, либо null.
export function misstatedBetSize(text: string, snapshot: TableSnapshot): string | null {
  const pcts = realBetPcts(snapshot);
  if (pcts.length === 0) return null; // постфлоп-ставок не было — сравнивать не с чем

  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    if (!REAL_BET_RE.test(sentence)) continue;
    if (PRESCRIPTIVE_RE.test(sentence)) continue;
    for (const f of POT_FRACTIONS) {
      if (!f.re.test(sentence)) continue;
      if (pcts.some((p) => p >= f.min && p <= f.max)) continue;
      return f.name;
    }
  }
  return null;
}

// Позиция, которой пересказ приписал ЧУЖОЙ фолд, либо null. Имя возвращаем для текста ошибки.
export function misreportedFold(text: string, snapshot: TableSnapshot): string | null {
  const headers = readHeaders(text);

  for (let h = 0; h < headers.length; h++) {
    const header = headers[h];
    if (header.streets.length !== 1) continue;
    const street = header.streets[0];
    const segment = text.slice(header.end, headers[h + 1]?.start ?? text.length);
    const tokens = readPositions(segment);
    if (tokens.length === 0) continue;

    FOLD_VERB_RE.lastIndex = 0;
    let v: RegExpExecArray | null;
    while ((v = FOLD_VERB_RE.exec(segment)) !== null) {
      const absolute = header.end + v.index;
      const bounds = sentenceBounds(text, absolute);
      if (HYPOTHETICAL_RE.test(text.slice(bounds.start, bounds.end))) continue;
      // Улица, названная ПОСЛЕ глагола в той же фразе, перебивает заголовок («а CO сбросил только
      // на ривере»): к какой улице отнести фолд — неясно, молчим. Улицы ДО глагола не мешают: это
      // сам заголовок и есть («На флопе BB поставил, HJ и CO сбросили»).
      STREET_RE.lastIndex = 0;
      if (STREET_RE.test(text.slice(absolute, bounds.end))) continue;
      for (const name of foldSubjects(segment, v.index, tokens)) {
        const label = seatByPosition(snapshot, name);
        if (!label) continue;
        const facts = streetFacts(snapshot, label, street);
        if (facts.acted && !facts.folded) return name;
      }
    }
  }
  return null;
}

// ── Сторож «спорит с фолдом, не назвав цену» ────────────────────────────────────────────────
// Регресс 09.08, эталонные раздачи 2/3/4 — один и тот же спот на трёх улицах: TT на K♦7♠2♣,
// соперник ставит овербет 25 BB в банк 6 BB, Hero сбрасывает. На тёрне и ривере тренер зовёт этот
// фолд верным, а на флопе — «подарком сопернику» и советует коллировать. Одна рука, одна доска,
// один сайзинг, три разных приговора.
//
// По цене колл требует ≈45% эквити (доложить 25 в банк, который станет 56). У карманных десяток
// против руки, выкладывающей четыре банка на доске с королём, столько не набирается. То есть совет
// стоит игроку четверти стека — это прямой денежный вред, а не разница вкусов.
//
// Промпт это уже запрещает (verdict.ts и hand-analysis.ts, «спорить с фолдом только назвав порог»),
// и модель запрет ПРОИГНОРИРОВАЛА — знакомый класс: факт есть, а применения нет. Лечится не текстом,
// а кодом: спорь сколько хочешь, но назови число, которое парсер уже посчитал. Не назвал — брак,
// очередь переспрашивает. Число у парсера есть всегда, так что требование выполнимо.
// ⚠️Отрицание проверяем ровно ПЕРЕД оценочным словом, а не перед всем совпадением. Первая версия
// смотрела на 20 знаков от начала матча и ошибалась в обе стороны: «Здесь НЕ соглашусь: фолд - это
// подарок сопернику» пропускала (нашла «не» в зачине), а «колл здесь НЕ оправдан» бракова́ла
// (не увидела «не», оно внутри матча). Поэтому оценочное слово вынесено в именованную группу,
// а её позицию находим поиском внутри самого совпадения — без флага `d`, который требует более
// новой цели компиляции, чем стоит в проекте.
type DisputePattern = { re: RegExp; checkNeg: boolean };
const DISPUTE_RES: DisputePattern[] = [
  // «колл здесь выглядит оправданным», «колл был бы лучше»
  { re: /колл[а-яё]*[^.!?]{0,30}?(?<ev>оправдан|обоснован|предпочтительн|уместн|лучше|верн)[а-яё]*/i, checkNeg: true },
  // «стоило заколлировать», «надо было платить»
  { re: /(?<ev>стоило|нужно\s+было|надо\s+было|лучше|можно\s+было)\s+(?:было\s+)?(?:за)?(?:коллировать|колл|заплатить|платить)/i, checkNeg: true },
  // «фолд поспешный / подарок / ошибка / излишне осторожный»
  { re: /фолд[а-яё]*[^.!?]{0,40}?(?<ev>поспешн|подарок|ошибк|слишком\s+осторожн|излишне\s+осторожн|пассивн|преждевремен)[а-яё]*/i, checkNeg: true },
  // «можно рассмотреть колл», «стоит подумать о колле» — мягкая форма того же совета (щель,
  // найденная прогоном 09.08: вердикт уже назвал цену, а разбор всё ещё звал платить без неё).
  { re: /(?:можно|стоит|стоило)\s+(?:было\s+)?(?:рассмотреть|подумать\s+о|обдумать)\s+колл/i, checkNeg: false },
  // «колл позволяет реализовать эквити» — утверждение выгоды колла.
  { re: /колл[а-яё]*\s+(?<ev>позволя|даёт|дает)[а-яё]*/i, checkNeg: true },
  // «не стоило сбрасывать», «зря сбросил» — отрицание ВНУТРИ формулы, проверять его нельзя.
  { re: /(?:не\s+стоило|рано|зря)\s+(?:было\s+)?сбрас/i, checkNeg: false },
  // «сбрасывать такую сильную руку …» — оборот сам по себе несёт упрёк.
  { re: /сбрасывать\s+так[а-яё]+\s+(?:сильн[а-яё]+\s+)?рук/i, checkNeg: false },
];
// Отрицание прямо перед оценкой переворачивает смысл: «колл здесь НЕ оправдан» — согласие с
// фолдом, а не спор с ним. Ложный брак стоит игроку ретрая, поэтому проверяем честно.
const DISPUTE_NEG_RE = /(?:^|[^а-яё])(?:не|вряд\s+ли|едва\s+ли)\s*$/i;

// Улица, на которой Hero сбросил против ставки, и цена этого колла по пот-оддсам.
export function heroFoldedFacingBet(snapshot: TableSnapshot): { street: Street; equityPct: number } | null {
  const f = computeHandFacts(snapshot);
  for (const h of f.heroFacing) {
    const folded = snapshot.actions.some((a) => a.actor === "Hero" && a.street === h.street && a.action === "FOLD");
    if (folded && h.equityToCallPct > 0) return { street: h.street, equityPct: h.equityToCallPct };
  }
  return null;
}

// Текст спорит с фолдом (зовёт коллировать), не назвав порога. Возвращает нужное число или null.
export function disputesFoldWithoutPrice(text: string, snapshot: TableSnapshot): number | null {
  const spot = heroFoldedFacingBet(snapshot);
  if (!spot) return null;

  // Порог назван? Считаем попаданием любой процент рядом с расчётом парсера (±2 на округление).
  const percents = [...text.matchAll(/(\d{1,3})\s*%/g)].map((m) => Number(m[1]));
  if (percents.some((p) => Math.abs(p - spot.equityPct) <= 2)) return null;

  for (const sentence of text.split(/(?<=[.!?])\s+/)) {
    for (const { re, checkNeg } of DISPUTE_RES) {
      const m = re.exec(sentence);
      if (!m) continue;
      const ev = m.groups?.ev;
      if (checkNeg && ev) {
        const evAt = m.index + m[0].lastIndexOf(ev);
        if (DISPUTE_NEG_RE.test(sentence.slice(Math.max(0, evAt - 14), evAt))) continue;
      }
      return spot.equityPct;
    }
  }
  return null;
}
