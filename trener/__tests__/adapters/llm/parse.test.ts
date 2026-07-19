import { describe, it, expect } from "vitest";
import {
  cleanCoachText,
  extractJson,
  allowedCardSet,
  heroSuitFixMap,
  validateVerdict,
  validateNextQuestion,
  parseOptimalAction,
  inventsShowdown,
  noShowdownInHand,
  claimsPocketPair,
  heroNoPocketPair,
  stripSycophanticOpener,
} from "@/infrastructure/adapters/llm/parse";

// Страховка словаря кодом (правки Артёма 2026-07-05): возвратные формы «сбрасываться»,
// «в хедз-ап» про раздачу и длинное тире промпт запрещает, но модель всё равно
// иногда пишет — чиним детерминированно на выходе адаптера.

describe("cleanCoachText", () => {
  it("возвратные формы «сбрасываться» → «фолдить» в том же лице", () => {
    expect(cleanCoachText("BB сбрасывается, все сбрасываются, ты сбрасываешься")).toBe(
      "BB фолдит, все фолдят, ты фолдишь",
    );
  });

  it("прошедшее время: сбросился/сбросились → сбросил/сбросили", () => {
    expect(cleanCoachText("UTG сбросился, остальные сбросились")).toBe("UTG сбросил, остальные сбросили");
  });

  it("с заглавной буквы тоже чинится", () => {
    expect(cleanCoachText("Сбрасываешься на флопе")).toBe("Фолдишь на флопе");
  });

  it("«в хедз-ап(е)» про раздачу → «один на один»", () => {
    expect(cleanCoachText("Банк в хедз-ап около 6.6 BB")).toBe("Банк один на один около 6.6 BB");
    expect(cleanCoachText("вы остались в хедз-апе")).toBe("вы остались один на один");
  });

  it("длинное тире → короткое с пробелами", () => {
    expect(cleanCoachText("ставит 8.2 BB — около 75% банка")).toBe("ставит 8.2 BB - около 75% банка");
  });

  it("невозвратные формы не трогаем", () => {
    expect(cleanCoachText("все сбрасывают, он сбросил карты")).toBe("все сбрасывают, он сбросил карты");
  });

  it("«двойка пар» → «две пары», «донатить» → «платить»", () => {
    expect(cleanCoachText("с двойкой пар не стал донатить дальше")).toBe("с двумя парами не стал платить дальше");
    expect(cleanCoachText("у тебя двойка пар")).toBe("у тебя две пары");
  });

  it("повторяющиеся опечатки GLM-off (факты-v2, 2026-07-12) → грамотные формы", () => {
    expect(cleanCoachText("попал в топ-парту тузом")).toBe("попал в топ-пару тузом");
    expect(cleanCoachText("Префиоп решение верное")).toBe("Префлоп решение верное");
    expect(cleanCoachText("ты смотрешь на флоп")).toBe("ты смотришь на флоп");
    expect(cleanCoachText("против стака в 38 BB")).toBe("против стека в 38 BB");
  });

  it("англ. слова, просочившиеся в русский текст → русские", () => {
    expect(cleanCoachText("Ты hoped, что он сбросит")).toBe("Ты надеялся, что он сбросит");
    expect(cleanCoachText("у тебя нет playable-руки")).toBe("у тебя нет играбельной руки");
  });

  it("«кнопка»/«баттон» во всех падежах → BTN", () => {
    expect(cleanCoachText("против кнопки в него входит много рук")).toBe("против BTN в него входит много рук");
    expect(cleanCoachText("Кнопка открывает широко, ты на кнопке")).toBe("BTN открывает широко, ты на BTN");
    expect(cleanCoachText("опен с баттона, баттон широкий")).toBe("опен с BTN, BTN широкий");
    expect(cleanCoachText("Батон ставит, против батона")).toBe("BTN ставит, против BTN");
  });

  it("«джем» во всех формах → «пуш»/«олл-ин» (правка Артёма 2026-07-11)", () => {
    expect(cleanCoachText("твой 3-бет-джем против опена")).toBe("твой 3-бет-олл-ин против опена");
    expect(cleanCoachText("здесь стоит джемить, а не коллировать")).toBe("здесь стоит пушить, а не коллировать");
    expect(cleanCoachText("после твоего джема SB сбросил")).toBe("после твоего олл-ина SB сбросил");
    expect(cleanCoachText("против позднего опена реджемят широко")).toBe("против позднего опена ре-пушат широко");
    expect(cleanCoachText("Ре-джем поверх короткого")).toBe("Ре-пуш поверх короткого");
  });

  it("CJK-иероглифы в тексте — брак ответа (ошибка → ретрай очереди), не тихая зачистка", () => {
    expect(() => cleanCoachText("любая пара大概率 оставляет позади")).toThrow();
    expect(() => cleanCoachText("Сサイズ-з точки зрения")).toThrow();
    expect(() => cleanCoachText("обычный русский текст с BTN и 3-бетом")).not.toThrow();
  });

  it("латиница-галлюцинация в русском тексте — брак ответа (инцидент «HoFlush» 2026-07-12)", () => {
    // Мусорные склейки и англицизмы, которых промпт-запрет не удержал, — бракуются (ретрай очереди).
    expect(() => cleanCoachText("HoFlush на тёрне есть далеко не у каждого")).toThrow();
    expect(() => cleanCoachText("у тебя weaker pair, чем у него")).toThrow();
    expect(() => cleanCoachText("это чистый showdown value")).toThrow();
  });

  it("частая латиница «Hero»/«vs»/«Nash» — ЧИСТИТСЯ, а не бракуется (регресс 2026-07-14)", () => {
    // Раньше метка «Hero» роняла весь разбор (теряли до 16%). Теперь чистим падежные формы.
    expect(cleanCoachText("метка Hero просочилась в текст")).toContain("метка ты");
    expect(cleanCoachText("это выгодно для Hero на этой доске")).toContain("для тебя");
    expect(cleanCoachText("у Hero тут сильная рука")).toContain("у тебя");
    expect(cleanCoachText("твоё AK vs его диапазон")).toContain("против");
    expect(() => cleanCoachText("метка Hero просочилась")).not.toThrow();
  });

  it("выдуманная карта со значком масти — брак (регресс 2026-07-14: «9♥ 9♥»)", () => {
    const allowed = new Set(["9s", "8d", "5c", "As", "Qs"]); // борд+рука снимка (ранг upper, масть lower)
    // K♥ нет в снимке — выдумана.
    expect(() => cleanCoachText("на борде K♥ добирает флеш", "ru", allowed)).toThrow(/вне снимка/);
    // Реальные карты снимка проходят.
    expect(() => cleanCoachText("у тебя A♠ Q♠ на 9♠ 8♦ 5♣", "ru", allowed)).not.toThrow();
    // Гипотетика рангом без масти — не трогаем.
    expect(() => cleanCoachText("любая семёрка даёт тебе трипс", "ru", allowed)).not.toThrow();
  });

  it("сырые токены-действия капсом бракуются (инцидент «_RAISE_» 2026-07-13)", () => {
    // Служебные действия из снимка (RAISE/CHECK/BET) не аббревиатуры — не должны утечь игроку.
    expect(() => cleanCoachText("перед тобой RAISE UTG, который не ответил")).toThrow();
    expect(() => cleanCoachText("соперник сделал CHECK на флопе")).toThrow();
    // А настоящие внутренние аббревиатуры (если проскочат) — пропускаем, они безобидны.
    expect(() => cleanCoachText("SPR около 2, по ICM тут фолд")).not.toThrow();
  });

  it("«без риска» чинится на «без лишнего риска» (регресс 2026-07-13)", () => {
    expect(cleanCoachText("это чистая прибыль без риска")).toBe("это чистая прибыль без лишнего риска");
  });

  it("латинский бэкстоп НЕ трогает английский ответ (locale en) — иначе падал бы весь EN-тренер", () => {
    expect(() => cleanCoachText("You open too wide from UTG and get 3-bet", "en")).not.toThrow();
    expect(() => cleanCoachText("your two pair loses to his set on the river", "en")).not.toThrow();
  });

  it("легитимная латиница в русском проходит: коды позиций, ранги, нотация, карты, стеки", () => {
    expect(() => cleanCoachText("опен с CO, ты на BTN против SB и BB")).not.toThrow();
    expect(() => cleanCoachText("у тебя A6s против его KQo, любая Kx бьёт")).not.toThrow();
    expect(() => cleanCoachText("ранги A K Q J T, нотация T9s и 76o")).not.toThrow();
    expect(() => cleanCoachText("стек 15.3 BB (383,304), банк 7.7 BB")).not.toThrow();
    // Стек в блайндах слитно и коды карт из снимка — частые формы, не должны рубить ответ.
    expect(() => cleanCoachText("пуш на 20bb, осталось 15sb")).not.toThrow();
    expect(() => cleanCoachText("борд Kd 7c 4s, у тебя 6d")).not.toThrow();
    // Одиночная латинская буква (C-бет) не должна ронять весь разбор.
    expect(() => cleanCoachText("твой C-бет на флопе")).not.toThrow();
    // Замена словаря создаёт латиницу «BTN» — она должна пройти, а не быть забракованной.
    expect(cleanCoachText("ты на кнопке")).toBe("ты на BTN");
  });
});

// Сторож порядка хода (Правило 1, 2026-07-15). Модель (Gemini Flash) переворачивает очередь —
// ставит соперников до Hero, хотя парсер знает, что Hero ходит первым постфлоп (heroFirstPostflop=
// true, 5-й аргумент). Ловим оба реальных вранья с прод-раздачи 5♦4♦ (SB), НЕ бракуем правильную
// формулировку, детектор выключен без флага. Брак → ретрай очереди (как выдуманная карта).
describe("cleanCoachText — сторож порядка хода", () => {
  it("ловит «после того как … чекнули, ты тоже чекнул», когда Hero первый (реальный баг 5♦4♦)", () => {
    expect(() =>
      cleanCoachText(
        "После того как префлоп-агрессор с CO и игрок на BTN чекнули, ты тоже чекнул.",
        "ru",
        undefined,
        undefined,
        true,
      ),
    ).toThrow(/порядок хода/);
  });

  it("ловит «оба чекнули перед тобой», когда Hero первый (второй вопрос той же раздачи)", () => {
    expect(() =>
      cleanCoachText("Когда оба соперника чекнули перед тобой, ты мог забрать банк.", "ru", undefined, undefined, true),
    ).toThrow(/порядок хода/);
  });

  it("ловит «до тебя чекнул» вплотную к чеку", () => {
    expect(() =>
      cleanCoachText("CO до тебя чекнул, отдав инициативу.", "ru", undefined, undefined, true),
    ).toThrow(/порядок хода/);
  });

  it("НЕ бракует правильную формулировку «ты чекнул первым, за тобой чекнули CO и BTN»", () => {
    expect(() =>
      cleanCoachText("Ты чекнул первым, за тобой чекнули CO и BTN.", "ru", undefined, undefined, true),
    ).not.toThrow();
  });

  it("НЕ бракует «до тебя не дойдёт ставка» — «до тебя» без чека рядом", () => {
    expect(() =>
      cleanCoachText("Ты чекнул, надеясь, что до тебя не дойдёт крупная ставка.", "ru", undefined, undefined, true),
    ).not.toThrow();
  });

  it("выключен без флага: «перед тобой чекнули» законно, когда Hero в позиции (флаг не выставлен)", () => {
    expect(() => cleanCoachText("Оба соперника чекнули перед тобой.")).not.toThrow();
    expect(() =>
      cleanCoachText("Оба соперника чекнули перед тобой.", "ru", undefined, undefined, false),
    ).not.toThrow();
  });
});

// Защита 1 (регресс 2026-07-14, инцидент Gemini): extractJson устойчив к обёрткам модели.
describe("cleanCoachText — вырез пересказа постановки блайндов (Артём 17.07)", () => {
  it("убирает «вносишь анте и малый блайнд», контекст позиции/стека остаётся", () => {
    expect(
      cleanCoachText("На префлопе ты на SB (29.4 BB) вносишь анте и малый блайнд. Игрок на LJ идёт олл-ин.", "ru"),
    ).toBe("На префлопе ты на SB (29.4 BB). Игрок на LJ идёт олл-ин.");
    expect(cleanCoachText("Ты на BB (0 bb) вносишь большой блайнд и анте, после чего смотришь флоп.", "ru")).toBe(
      "Ты на BB (0 bb), после чего смотришь флоп.",
    );
  });
  it("НЕ трогает содержательные ставки и открытия", () => {
    const a = "На флопе ты ставишь треть банка (5 BB) в опасную доску.";
    const b = "Ты открываешься с HJ до 2.2 BB.";
    expect(cleanCoachText(a, "ru")).toBe(a);
    expect(cleanCoachText(b, "ru")).toBe(b);
  });
});

describe("stripSycophanticOpener — ритуальный зачин «Ты прав» (Артём 17.07)", () => {
  it("убирает зачин, суть остаётся с большой буквы", () => {
    expect(stripSycophanticOpener("Ты прав: твой пуш был верным решением. Дальше...")).toBe(
      "Твой пуш был верным решением. Дальше...",
    );
    expect(stripSycophanticOpener("Ты прав, диапазон оценил верно, и колл был ошибкой.")).toBe(
      "Диапазон оценил верно, и колл был ошибкой.",
    );
    expect(stripSycophanticOpener("Да, ты прав — выставление стандартное здесь.")).toBe(
      "Выставление стандартное здесь.",
    );
    expect(stripSycophanticOpener("Ты прав в том, что донк это сила, однако фолд слабый.")).toBe(
      "Донк это сила, однако фолд слабый.",
    );
  });
  it("НЕ трогает «правильно/правда» (кириллическая граница) и текст без зачина", () => {
    const a = "Ты правильно оценил диапазон соперника здесь.";
    const b = "Ты правда мог сыграть иначе на этой улице.";
    const c = "Твой олл-ин верный, но эквити против AKs всего 26%.";
    expect(stripSycophanticOpener(a)).toBe(a);
    expect(stripSycophanticOpener(b)).toBe(b);
    expect(stripSycophanticOpener(c)).toBe(c);
  });
  it("почти пустой остаток («Ты прав.») не курочит", () => {
    expect(stripSycophanticOpener("Ты прав.")).toBe("Ты прав.");
  });
});

describe("extractJson", () => {
  it("чистый JSON-объект не трогается", () => {
    expect(extractJson('{"verdict":"ок"}')).toBe('{"verdict":"ок"}');
  });
  it("парная markdown-обёртка ```json … ``` снимается", () => {
    expect(extractJson('```json\n{"verdict":"ок"}\n```')).toBe('{"verdict":"ок"}');
  });
  it("НЕЗАКРЫТЫЙ ```json-фенс (падение Gemini #2) — всё равно вычленяет объект", () => {
    // Именно это роняло раздачу: модель открыла фенс и не закрыла → старая регулярка не матчилась.
    expect(extractJson('```json {"verdict":"ок"}')).toBe('{"verdict":"ок"}');
    expect(() => JSON.parse(extractJson('```json {"verdict":"ок"}'))).not.toThrow();
  });
  it("преамбула и хвост вокруг объекта срезаются", () => {
    expect(extractJson('Вот разбор: {"verdict":"ок"} — готово')).toBe('{"verdict":"ок"}');
  });
});

// Защита 2 (регресс 2026-07-14): карт-валидатор теперь и в вердикте/вопросе, не только в разборе.
describe("карт-валидатор в вердикте и вопросе диалога", () => {
  const snap = { board: ["Kh", "Jd", "Td"], heroCards: ["Ac", "Ad"] };
  const allowed = allowedCardSet(snap);

  it("вердикт с выдуманной мастью карты борда (K♠ при K♥) — брак (throw → ретрай очереди)", () => {
    // Gemini #8: борд K♥ J♦ T♦, а модель в вердикте написала «K♠» (пик на борде нет).
    expect(() => validateVerdict({ verdict: "у тебя топ-пара на K♠ J♦ T♦" }, "ru", allowed)).toThrow();
  });
  it("вердикт с реальными картами снимка — проходит", () => {
    expect(() => validateVerdict({ verdict: "у тебя топ-пара на K♥ J♦ T♦" }, "ru", allowed)).not.toThrow();
  });
  it("вопрос диалога с выдуманной картой — тоже брак", () => {
    expect(() =>
      validateNextQuestion({ complete: false, question: "а если бы пришла 9♠?" }, "ru", allowed),
    ).toThrow();
  });
  it("гипотетика рангом без масти («любая девятка») — не трогаем", () => {
    expect(() =>
      validateNextQuestion({ complete: false, question: "а если бы пришла любая девятка?" }, "ru", allowed),
    ).not.toThrow();
  });
  // Инцидент 2026-07-15: пустой вопрос при complete=false рождал раунд-пустышку «{{table:N}}»
  // → диалог зависал. Теперь пустота → complete: уходим в вердикт, а не в вопрос-пустышку.
  it("пустой вопрос («») при complete=false → трактуется как complete (в вердикт, без зависания)", () => {
    const r1 = validateNextQuestion({ complete: false, question: "" }, "ru", allowed);
    expect(r1.complete).toBe(true);
    expect(r1.question).toBe("");
    const r2 = validateNextQuestion({ complete: false, question: "   " }, "ru", allowed);
    expect(r2.complete).toBe(true);
  });
  it("нормальный вопрос при complete=false — остаётся вопросом (не форсим complete)", () => {
    const r = validateNextQuestion({ complete: false, question: "почему ты решил заколлировать?" }, "ru", allowed);
    expect(r.complete).toBe(false);
    expect(r.question).toContain("почему");
  });
});

// Регресс 2026-07-14 (переход на Gemini): служебную метку «Player N» модель тащит в текст —
// чистим в «соперник», НЕ бракуем (иначе карантин, что и случилось у Gemini на проде).
describe("метка «Player N» чистится, а не бракуется", () => {
  it("«Player 4» → «соперник», разбор не падает", () => {
    expect(cleanCoachText("против Player 4 ты был впереди")).toBe("против соперник ты был впереди");
    expect(() => cleanCoachText("Player 6 поставил олл-ин, Player 2 сбросил")).not.toThrow();
    expect(cleanCoachText("Player 6 поставил олл-ин")).toBe("соперник поставил олл-ин");
  });
});

// Регресс 2026-07-17: модель пишет десятку по-бытовому «10d», хотя вся карточка и снимок знают
// её только как «T» — чистим в нашу нотацию, а не бракуем (иначе карантин без разбора, и уже
// без права на повтор, как у GENERATE_HAND_ANALYSIS — задача 956dada0).
describe("разговорная запись десятки «10d» чистится в «Td», а не бракуется", () => {
  it("«10d/10h/10c/10s» → «Td/Th/Tc/Ts»", () => {
    expect(cleanCoachText("у тебя топ-пара на 10d")).toBe("у тебя топ-пара на Td");
    expect(cleanCoachText("борд принёс 10h")).toBe("борд принёс Th");
    expect(() => cleanCoachText("на руках 10c 10s — сет десяток")).not.toThrow();
  });
  it("верхний регистр масти («10D») тоже чистится", () => {
    expect(cleanCoachText("топ-пара на 10D")).toBe("топ-пара на Td");
  });
});

// P3 2026-07-15: термины статистики соперника (VPIP/PFR/…) убраны из белого списка аббревиатур —
// промпт велит их прятать, в тексте игроку они = баг, латинский бэкстоп бракует (throw→ретрай).
describe("статистические термины соперника бракуются, структурные — нет", () => {
  it("«VPIP»/«PFR»/«WTSD» в русском ответе → брак", () => {
    expect(() => cleanCoachText("у соперника VPIP высокий")).toThrow();
    expect(() => cleanCoachText("его PFR около 20")).toThrow();
    expect(() => cleanCoachText("WTSD у него большой")).toThrow();
  });
  it("SPR/ICM/RFI (структурные, про игру/свою руку) остаются", () => {
    expect(() => cleanCoachText("SPR около 2 на флопе")).not.toThrow();
    expect(() => cleanCoachText("тут важен ICM, стек короткий")).not.toThrow();
    expect(() => cleanCoachText("по RFI-чарту это опен")).not.toThrow();
  });
});

// P3 2026-07-15 (регресс #41): выдуманную масть ОДНОЗНАЧНОЙ карманной карты Hero исправляем, а не
// бракуем; масть карты борда / неоднозначного ранга по-прежнему бракуется.
describe("автофикс масти карманной карты Hero", () => {
  const snap = { heroCards: ["Kd", "Qs"], board: ["Ts", "9s", "2s", "2c"] };
  const fix = heroSuitFixMap(snap);
  const allowed = allowedCardSet(snap);

  it("выдуманная масть уникальной карты Hero (K♠ при реальном K♦) → исправляется, не карантин", () => {
    expect(cleanCoachText("у тебя K♠ Q♠", "ru", allowed, fix)).toBe("у тебя K♦ Q♠");
    expect(() => cleanCoachText("твой K♠ бьёт его", "ru", allowed, fix)).not.toThrow();
  });
  it("правильная масть карты Hero не трогается", () => {
    expect(cleanCoachText("у тебя K♦ Q♠", "ru", allowed, fix)).toBe("у тебя K♦ Q♠");
  });
  it("выдуманная масть карты БОРДА (ранг не у Hero) НЕ автофиксится → брак", () => {
    expect(() => cleanCoachText("на доске появилась 4♥", "ru", allowed, fix)).toThrow();
  });
});

/**
 * Канал «что советовал разбор» → вердикт (правка 2026-07-17).
 * Вердикт пишется ОТДЕЛЬНЫМ вызовом и поля optimal не видит, а чек-лист требовал «optimal и итог
 * зовут одно действие». Правило было невыполнимым: аудит 16.07 намерил противоречия в 5 раздачах
 * из 23 («коллируй» в разборе → «фолд был верным» в вердикте на одном экране).
 * Поле необязательное: мусор → undefined, и вердикт работает как раньше. Браковать разбор из-за
 * него нельзя — ложный брак = 3 ретрая = карантин у живого игрока.
 */
describe("parseOptimalAction — канал разбор → вердикт", () => {
  it("принимает слова из списка", () => {
    for (const a of ["сброс", "чек", "колл", "ставка", "рейз", "олл-ин"]) {
      expect(parseOptimalAction(a)).toBe(a);
    }
  });

  it("чистит регистр, пробелы и хвостовую пунктуацию", () => {
    expect(parseOptimalAction(" Колл. ")).toBe("колл");
    expect(parseOptimalAction("РЕЙЗ")).toBe("рейз");
  });

  it("английские слова НЕ принимает — их бракует латинский сторож", () => {
    expect(parseOptimalAction("CALL")).toBeUndefined();
    expect(parseOptimalAction("raise")).toBeUndefined();
  });

  it("развёрнутый ответ вместо одного слова → undefined (вердикт отработает без строки-факта)", () => {
    expect(parseOptimalAction("колл, но осторожно")).toBeUndefined();
    expect(parseOptimalAction("надо было сбросить")).toBeUndefined();
  });

  it("пусто/не строка → undefined, а не падение", () => {
    expect(parseOptimalAction(undefined)).toBeUndefined();
    expect(parseOptimalAction(null)).toBeUndefined();
    expect(parseOptimalAction(42)).toBeUndefined();
    expect(parseOptimalAction("")).toBeUndefined();
  });
});

/**
 * Сторож выдуманного вскрытия (регресс 2026-07-17, 50 раздач на 3.1-flash-lite).
 * Тренер УТВЕРЖДАЛ руку соперника, хотя никто не вскрывался: «у соперника на SB оказался старший
 * фулл-хаус», «с руками вроде AA, которые он в итоге показал». Факт «никто не вскрылся, не пиши
 * „у него оказался"» в промпте УЖЕ есть — модель его игнорирует, поэтому ловим на выходе.
 * Класс самый опасный: игрок сам играл раздачу и помнит, что там было (критическая поломка №2).
 * ⚠️Сторож НАМЕРЕННО узкий: гипотезы («мог быть фулл») — законный язык тренера. Ложный брак =
 * 3 ретрая = карантин у живого игрока. Теневой прогон на 50 раздачах: поймано 2, ложных 0.
 */
describe("inventsShowdown — сторож выдуманного вскрытия", () => {
  it("ловит «у соперника на SB оказался старший фулл-хаус» (реальный брак регресса #37)", () => {
    expect(
      inventsShowdown("Твой фулл-хаус на ривере проиграл, так как у соперника на SB оказался старший фулл-хаус с восьмерками."),
    ).toBe(true);
  });

  it("ловит «с руками вроде AA, которые он в итоге показал» (реальный брак регресса #42)", () => {
    expect(inventsShowdown("Он сбрасывает больше половины диапазона, но с руками вроде AA, которые он в итоге показал, он никогда не выбросит.")).toBe(true);
  });

  it("НЕ трогает гипотезу «у него мог быть фулл» — это законный язык тренера", () => {
    expect(inventsShowdown("У него мог быть фулл-хаус, поэтому колл здесь рискованный.")).toBe(false);
  });

  it("НЕ трогает «возможно, он показал бы сет»", () => {
    expect(inventsShowdown("Возможно, он показал бы сет, но проверить это мы не можем.")).toBe(false);
  });

  it("НЕ трогает разговор о диапазоне (так говорить МОЖНО и нужно)", () => {
    expect(inventsShowdown("С такой линией сюда заходят с двумя парами и сетами, а блефов тут мало.")).toBe(false);
  });

  it("гипотеза в СОСЕДНЕЙ фразе не оправдывает утверждение в этой", () => {
    expect(
      inventsShowdown("Он мог блефовать на тёрне. Но у соперника оказался фулл-хаус, и твой колл проиграл."),
    ).toBe(true);
  });

  it("noShowdownInHand: есть вскрывшийся соперник → сторож выключен", () => {
    const snap = {
      seats: [
        { label: "Hero", position: "BTN" as const, startingStack: 100 },
        { label: "Player 3", position: "SB" as const, startingStack: 100, shownCards: ["Ah", "Kd"] },
      ],
      heroCards: ["9d", "5d"],
      board: ["8d", "5s", "8c", "4h", "5c"],
      actions: [],
      potTotal: 10,
    };
    expect(noShowdownInHand(snap)).toBe(false);
  });

  it("noShowdownInHand: никто не вскрылся → сторож включён", () => {
    const snap = {
      seats: [
        { label: "Hero", position: "BTN" as const, startingStack: 100 },
        { label: "Player 3", position: "SB" as const, startingStack: 100 },
      ],
      heroCards: ["9d", "5d"],
      board: ["8d", "5s", "8c", "4h", "5c"],
      actions: [],
      potTotal: 10,
    };
    expect(noShowdownInHand(snap)).toBe(true);
  });

  it("cleanCoachText бракует выдуманное вскрытие только при флаге noShowdown", () => {
    const text = "Твой фулл проиграл: у соперника оказался старший фулл-хаус.";
    expect(() => cleanCoachText(text, "ru", undefined, undefined, undefined, true)).toThrow(/выдумал вскрытие/);
    expect(() => cleanCoachText(text, "ru", undefined, undefined, undefined, false)).not.toThrow();
  });
});

/**
 * Сторож выдуманной карманной пары (регресс 2026-07-17, #25).
 * «Колл 3-бета С КАРМАННОЙ ПАРОЙ … стандартный СЕТ-МАЙНИНГ» — при разномастных T3o. Двойная цена:
 * игрок видит, что тренер не смотрит в его карты, и получает вредный совет.
 * ⚠️Ловим НЕ слово «сет»: промпт проекта РАЗРЕШАЕТ звать трипс сетом («игрок поймёт одинаково»),
 * такой сторож бракова́л бы 14% раздач за выполнение промпта. Ловим утверждение о СТАРТОВОЙ руке.
 * Теневой прогон по 262 раздачам / 597 текстам: 1 брак (настоящее враньё), ложных 0.
 */
describe("claimsPocketPair — сторож выдуманной карманной пары", () => {
  it("ловит реальный брак #25: «колл 3-бета с карманной парой… сет-майнинг»", () => {
    expect(
      claimsPocketPair("Твой колл 3-бета с карманной парой (даже такой мелкой) в позиции - это стандартный сет-майнинг."),
    ).toBe(true);
  });

  it("ловит «реализовать потенциал карманной пары» про игрока", () => {
    expect(claimsPocketPair("Не стоит сбрасывать такие руки, если цена входа позволяет реализовать потенциал твоей карманной пары.")).toBe(true);
  });

  it("НЕ трогает карманную пару У СОПЕРНИКА — это законно и постоянно", () => {
    expect(claimsPocketPair("У соперника тут карманная пара или туз с хорошим кикером.")).toBe(false);
  });

  it("НЕ трогает разговор про диапазон соперника", () => {
    expect(claimsPocketPair("В его диапазоне много карманных пар и бродвеев.")).toBe(false);
  });

  it("НЕ трогает контрфактику «если бы у тебя была карманная пара»", () => {
    expect(claimsPocketPair("Если бы у тебя была карманная пара, сет-майнинг был бы оправдан.")).toBe(false);
  });

  it("НЕ трогает отрицание «у тебя не карманная пара»", () => {
    expect(claimsPocketPair("У тебя не карманная пара, поэтому сет-майнинга тут нет.")).toBe(false);
  });

  it("НЕ трогает фразу, где Hero — дополнение, а пары чужие (реальный текст glm #32)", () => {
    expect(claimsPocketPair("Руки, которые тебя обносят, - это J9 и карманные пары выше десятки.")).toBe(false);
  });

  it("heroNoPocketPair: T3o → сторож включён", () => {
    const s = { seats: [], heroCards: ["Th", "3d"], board: [], actions: [], potTotal: 0 };
    expect(heroNoPocketPair(s)).toBe(true);
  });

  it("heroNoPocketPair: 33 (карманная пара) → сторож выключен", () => {
    const s = { seats: [], heroCards: ["3h", "3d"], board: [], actions: [], potTotal: 0 };
    expect(heroNoPocketPair(s)).toBe(false);
  });

  it("heroNoPocketPair: карт нет → не уверены, молчим", () => {
    const s = { seats: [], heroCards: [], board: [], actions: [], potTotal: 0 };
    expect(heroNoPocketPair(s)).toBe(false);
  });

  it("cleanCoachText бракует только при флаге noPocketPair", () => {
    const t = "Твой колл 3-бета с карманной парой - стандартный сет-майнинг.";
    expect(() => cleanCoachText(t, "ru", undefined, undefined, undefined, undefined, true)).toThrow(/выдумал карманную пару/);
    expect(() => cleanCoachText(t, "ru", undefined, undefined, undefined, undefined, false)).not.toThrow();
  });
});

// Артём 19.07: «в описании раздачи всё ещё пишется не символами, а буквами» — модель выдала
// «На борде 4c 5c 8c 6c Kd». Промпт значки просит прямым текстом, но просьбы держат плохо —
// переводим кодом. Конвертируем ТОЛЬКО карты из снимка, иначе замена легализовала бы выдуманную.
describe("cleanCoachText — буквенные масти переводятся в значки", () => {
  const cards = new Set(["4c", "5c", "8c", "6c", "Kd", "8h", "7h"].map((c) => c[0].toUpperCase() + c[1]));

  it("карты раздачи получают значок масти", () => {
    const out = cleanCoachText("На борде 4c 5c 8c 6c Kd у тебя стрит.", "ru", cards);
    expect(out).toContain("4♣");
    expect(out).toContain("5♣");
    expect(out).toContain("Kd".replace("Kd", "K♦"));
    expect(out).not.toContain("4c");
    expect(out).not.toContain("Kd");
  });

  it("десятка в бытовой записи сначала нормализуется, потом получает значок", () => {
    const withTen = new Set([...cards, "Td"]);
    expect(cleanCoachText("пришла 10d", "ru", withTen)).toContain("T♦");
  });

  // Дыра, которую закрыли 19.07: выдуманную карту, записанную БУКВАМИ, не ловил никто — strayCard
  // проверяет только форму со значком, а латинский сторож коды карт намеренно пропускает. Пока
  // буквенная запись была законной, это было верно. Теперь все карты снимка конвертируются в
  // значки, поэтому оставшийся буквенный код = карта вне раздачи, и это брак.
  it("выдуманная карта БУКВАМИ бракуется (значка не получает и не проходит молча)", () => {
    expect(() => cleanCoachText("у него был Ac", "ru", cards)).toThrow(/карту вне снимка/);
  });

  it("нотация руки и диапазона под брак НЕ попадает", () => {
    // «AKs», «A6s», «T9s» — это записи РУК, а не конкретных карт: перед рангом стоит другая буква,
    // границы слова не возникает. Ложный брак здесь стоил бы игроку карантина разбора.
    const out = cleanCoachText("он открывает AKs, A6s и T9s с этой позиции", "ru", cards);
    expect(out).toContain("AKs");
    expect(out).toContain("A6s");
    expect(out).toContain("T9s");
  });
});
