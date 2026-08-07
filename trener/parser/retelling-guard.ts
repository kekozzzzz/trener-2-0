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

// Речь о ставке, которая в раздаче БЫЛА (или которую игрок получил), а не о гипотетическом размере.
const REAL_BET_RE =
  /(?:^|[^а-яё])(?:поставил[а-яё]*|ставк[ауиой]|ставку|бет|контбет|c-bet|получ[а-яё]+\s+ставку|столкн[а-яё]+|в\s+ответ\s+на)(?![а-яё])/i;
// Предписание на будущее / разбор несыгранной линии — размер тут любой, это не факт раздачи.
const PRESCRIPTIVE_RE =
  /(?:^|[^а-яё])(?:ставь|поставь|поставить|стоило|следовало|надо\s+было|нужно\s+было|можно\s+было|сыграть)(?![а-яё])/i;

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
