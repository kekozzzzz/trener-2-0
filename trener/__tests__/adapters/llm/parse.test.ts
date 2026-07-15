import { describe, it, expect } from "vitest";
import {
  cleanCoachText,
  extractJson,
  allowedCardSet,
  heroSuitFixMap,
  validateVerdict,
  validateNextQuestion,
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

// Защита 1 (регресс 2026-07-14, инцидент Gemini): extractJson устойчив к обёрткам модели.
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
