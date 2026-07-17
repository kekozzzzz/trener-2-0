import { describe, it, expect } from "vitest";
import {
  heroMadeHand,
  cardSetValue,
  compareValues,
  madeHandNutStatus,
  madeHandVulnerability,
  madeHandKicker,
  nutFlushBlocker,
} from "@/parser/made-hand";
import { fullDeckOdds } from "@/parser/range-buckets";

describe("heroMadeHand", () => {
  it("префлоп (борда нет) — null", () => {
    expect(heroMadeHand(["Ac", "8h"], [])).toBeNull();
  });

  it("Hero не попал — пары нет", () => {
    // Q8 на A-9-2 (как наша «простая» рука): голый борд без пары, Hero ничего не добавил
    const r = heroMadeHand(["Qd", "8d"], ["9d", "2h", "As"]);
    expect(r?.category).toBe("HIGH");
    expect(r?.improves).toBe(false);
  });

  it("пара лежит на борде — своей пары нет (важно против галлюцинации)", () => {
    // A8 на K-J-4-4-5: пара четвёрок уже на борде, Hero её не делал
    const r = heroMadeHand(["Ac", "8h"], ["Kh", "Jh", "4c", "4d", "5s"]);
    expect(r?.category).toBe("PAIR");
    expect(r?.improves).toBe(false);
    expect(r?.ru).toContain("на борде");
  });

  it("топ-пара, когда Hero спарил старшую карту борда", () => {
    const r = heroMadeHand(["Ac", "8h"], ["As", "9d", "2h"]);
    expect(r?.category).toBe("PAIR");
    expect(r?.improves).toBe(true);
    expect(r?.ru).toContain("топ-пара");
  });

  it("вторая пара", () => {
    const r = heroMadeHand(["9c", "8h"], ["Ad", "9s", "2h"]);
    expect(r?.ru).toContain("вторая пара");
  });

  it("карманная пара / оверпара", () => {
    expect(heroMadeHand(["9c", "9d"], ["2h", "5s", "Kc"])?.ru).toContain("карманная пара");
    expect(heroMadeHand(["Qc", "Qd"], ["2h", "5s", "7c"])?.ru).toContain("оверпара");
  });

  it("фулл-хаус (как наша «средняя» рука A6 на спаренном борде)", () => {
    const r = heroMadeHand(["Ac", "6c"], ["6h", "8d", "6s", "3c", "As"]);
    expect(r?.category).toBe("FULL_HOUSE");
    expect(r?.ru).toContain("фулл-хаус");
  });

  it("сет против трипса", () => {
    expect(heroMadeHand(["7c", "7d"], ["7h", "2s", "Kc"])?.ru).toContain("сет");
    expect(heroMadeHand(["7c", "Ad"], ["7h", "7s", "Kc"])?.ru).toContain("трипс");
  });

  it("каре: карман 7 + три семёрки на борде = каре, НЕ фулл (проверка бага #3)", () => {
    // A7o на 2h 7h 7s 6c 7c: у Hero четвёртая семёрка → каре семёрок, кикер туз (не «фулл + пара тузов»).
    const r = heroMadeHand(["Ah", "7d"], ["2h", "7h", "7s", "6c", "7c"]);
    expect(r?.category).toBe("QUADS");
  });

  it("флеш и стрит", () => {
    expect(heroMadeHand(["Ac", "2c"], ["7c", "9c", "Kc"])?.category).toBe("FLUSH");
    expect(heroMadeHand(["8c", "9d"], ["Th", "Js", "Qc"])?.category).toBe("STRAIGHT");
  });

  // Инцидент 2026-07-12: на спаренном борде QQ432 у Hero (66) две пары дам+шестёрок,
  // у соперника (JJ) две пары дам+валетов; спор идёт по МЛАДШЕЙ паре, JJ старше.
  // Раньше на heroMadeHand/две пары не было НИ ОДНОГО теста, а модель без факта сравнения
  // объявляла победителем 66 — отсюда защита обеих веток: и описание, и старшинство.
  it("две пары на спаренном борде — описание с обеими парами", () => {
    const board = ["Qh", "Qs", "4d", "3c", "2h"];
    const six = heroMadeHand(["6c", "6d"], board);
    expect(six?.category).toBe("TWO_PAIR");
    expect(six?.ru).toBe("две пары (дам и шестёрок)");
    expect(six?.strength).toBe("STRONG_MADE");
    expect(heroMadeHand(["Jc", "Jd"], board)?.ru).toBe("две пары (дам и валетов)");
  });

  it("тай-брейк двух пар по младшей паре: QQ+JJ старше QQ+66", () => {
    const board = ["Qh", "Qs", "4d", "3c", "2h"];
    const jacks = cardSetValue(["Jc", "Jd", ...board]);
    const sixes = cardSetValue(["6c", "6d", ...board]);
    expect(jacks).toEqual([3, 12, 11, 4]); // две пары: дамы, валеты, кикер 4
    expect(sixes).toEqual([3, 12, 6, 4]); // две пары: дамы, шестёрки, кикер 4
    expect(compareValues(jacks, sixes)).toBe(1); // JJ впереди
    expect(compareValues(sixes, jacks)).toBe(-1); // 66 позади
  });

  // Баг из свипа: готовая рука «две пары и выше», лежащая целиком на борде, называлась своей
  // (STRONG_MADE) — тренеру уходило «у тебя две пары», хотя Hero играет борд/кикер.
  it("две пары целиком на борде (KK55 + AQ) — играешь борд, strength AIR", () => {
    const r = heroMadeHand(["Ad", "Qc"], ["Kc", "Kh", "5s", "5d", "2c"]);
    expect(r?.category).toBe("TWO_PAIR");
    expect(r?.ru).toContain("на борде");
    expect(r?.strength).toBe("AIR");
  });

  it("сет целиком на борде (333 + AQ) — играешь борд, strength AIR", () => {
    const r = heroMadeHand(["Ad", "Qc"], ["3c", "3h", "3s", "Kd", "2c"]);
    expect(r?.category).toBe("TRIPS");
    expect(r?.strength).toBe("AIR");
  });

  it("НЕ понижает свою вторую пару: KK55 + QQ (дамы — своя пара)", () => {
    const r = heroMadeHand(["Qd", "Qc"], ["Kc", "Kh", "5s", "5d", "2c"]);
    expect(r?.category).toBe("TWO_PAIR");
    expect(r?.strength).toBe("STRONG_MADE");
    expect(r?.ru).not.toContain("своей руки у тебя нет");
  });

  it("НЕ понижает свой туз-флеш: борд 5 треф, туз треф в руке", () => {
    const r = heroMadeHand(["Ac", "3h"], ["Kc", "Tc", "8c", "5c", "2c"]);
    expect(r?.category).toBe("FLUSH");
    expect(r?.strength).not.toBe("AIR");
  });
});

describe("madeHandNutStatus — натсовость флеша/стрита (свип зелёные)", () => {
  // Судья натсовости — перебор всей колоды, ровно как в бою (facts.ts): только он видит фулл,
  // каре и стрит-флеш, которые бьют руку ПОВЕРХ её категории. Зовём через тот же вход, что и
  // продакшен, иначе тест разойдётся с боем и снова пропустит «натс» с живым фуллом.
  const nut = (hero: string[], board: string[]) =>
    madeHandNutStatus(hero, board, fullDeckOdds(hero, board));

  it("младший флеш — НЕ натс, натсовость от СВОЕЙ старшей карты", () => {
    const r = nut(["6c", "2c"], ["7c", "9c", "Kc"]);
    expect(r).toContain("НЕ натс");
    expect(r).toContain("шестёрка"); // твоя старшая карта в флеше
  });

  // HIGH-регресс из ревью: старший туз масти на БОРДЕ (общий) — раньше ложно «НАТСОВЫЙ».
  it("туз масти на борде, но у Hero карты младше — НЕ натс (не от борда)", () => {
    const r = nut(["Qh", "Jh"], ["Ah", "8h", "5h", "2c", "3d"]);
    expect(r).toContain("НЕ натс");
    expect(r).not.toContain("НАТСОВЫЙ");
  });

  it("туз-флеш (туз в руке) — НАТСОВЫЙ", () => {
    expect(nut(["Ac", "2c"], ["7c", "9c", "Kc"])).toContain("НАТСОВЫЙ");
  });

  it("стрит до туза на сухом борде — НАТСОВЫЙ", () => {
    expect(nut(["Ac", "Kd"], ["Qc", "Js", "Th"])).toContain("НАТСОВЫЙ");
    // 9-high стрит на 5-6-7: старший на борде не собрать (нужно 3 карты в руке) → натс
    expect(nut(["8c", "9d"], ["5h", "6s", "7c"])).toContain("НАТСОВЫЙ");
  });

  it("флеш целиком на борде (рука Hero — воздух) — null, согласовано с «играешь борд»", () => {
    expect(nut(["2c", "3d"], ["6h", "7h", "9h", "Jh", "Kh"])).toBeNull();
  });

  it("не флеш и не стрит — null", () => {
    expect(nut(["Ac", "8h"], ["As", "9d", "2h"])).toBeNull();
  });

  // ── Регресс #5/#13 (2026-07-17): «две пары, старшая пара ОБЩАЯ» ──
  // Правило «любая карманка старше твоей младшей пары бьёт тебя» было верным, но абстрактным —
  // модель его не применяла и заявляла «ты бьёшь 88/99», требуя колла на ложном основании.
  // Теперь ранги считает парсер и называет их поимённо.
  it("#5: 96o на 4-5-7-6-7 — среди бьющих названы восьмёрки/девятки и трипс семёрок", () => {
    const r = madeHandVulnerability(["9c", "6d"], ["4d", "5d", "7h", "6c", "7c"]) ?? "";
    expect(r).toContain("она есть у КАЖДОГО"); // старшая пара общая — не преимущество Hero
    expect(r).toContain("любая рука с семёркой (у него ТРИПС семёрок)");
    expect(r).toContain("восьмёрок");
    expect(r).toContain("девяток"); // ровно те 88/99, про которые тренер врал «ты их бьёшь»
    expect(r).toContain("Все они тебя ОБХОДЯТ");
  });

  it("#13: A5o на T-5-J-T-4 — одиночные карты борда опаснее карманок, и они названы", () => {
    const r = madeHandVulnerability(["Ah", "5c"], ["Tc", "5s", "Js", "Ts", "4d"]) ?? "";
    // Тренер звал «валет или десятку» руками слабее — на деле это две пары и трипс.
    expect(r).toContain("любая рука с десяткой (у него ТРИПС десяток)");
    expect(r).toContain("любая рука с валетом (у него две пары валетов и десяток - старше твоих)");
    // Проверяем именно СПИСОК карманок: слово «десяток» законно стоит в описании руки.
    const list = r.split("карманная пара любого из рангов:")[1]?.split(".")[0] ?? "";
    expect(list).toContain("шестёрок");
    expect(list).not.toContain("десяток"); // общая пара: карманка того же ранга = каре
  });

  it("не пугаем невозможным: ранг, которого в колоде не осталось на пару, в список не идёт", () => {
    // Три семёрки на борде → карманных 77 у соперника быть не может.
    const r = madeHandVulnerability(["9c", "6d"], ["7h", "7c", "7s", "6c", "2d"]);
    expect(r ?? "").not.toContain("семёрок,");
  });

  // ── Регресс #8 (2026-07-17): натсовость мерили ВНУТРИ категории и парсер врал сам ──
  // Раньше здесь печаталось «Твой стрит НАТСОВЫЙ» рядом с «тебя бьют 60» из той же переписи;
  // все три модели повторяли наш же факт и получали ярлык галлюцинации.
  it("Broadway на спаренном борде с тремя бубнами (#8) — НЕ натс: живы каре, фулл и флеш", () => {
    const r = nut(["Kd", "Qs"], ["Kh", "Jd", "Td", "Jc", "Ad"]);
    expect(r).not.toContain("НАТСОВЫЙ");
    expect(r).toContain("НЕ натс");
    expect(r).toContain("каре");
    expect(r).toContain("фулл-хаусы");
    expect(r).toContain("флеши");
  });

  it("стрит на трёхмастном борде — НЕ натс: бьют флеши и стрит-флеши", () => {
    const r = nut(["9s", "8c"], ["7h", "6h", "5h", "2c", "Kd"]);
    expect(r).not.toContain("НАТСОВЫЙ");
    expect(r).toContain("НЕ натс");
    // Стрит-флеш (9h8h на 7h6h5h) — реальная угроза; до починки CAT_RU категория 9 молча
    // выбрасывалась фильтром разбивки, и самый страшный бьющий исчезал из фактов.
    expect(r).toContain("стрит-флеши");
  });

  it("натс-флеш на спаренном борде — НЕ натс: фулл и каре бьют", () => {
    const r = nut(["Ah", "3h"], ["8h", "8d", "2h", "5h", "Kh"]);
    expect(r).not.toContain("НАТСОВЫЙ");
    expect(r).toContain("НЕ натс");
    expect(r).toContain("каре");
    expect(r).toContain("фулл-хаусы");
  });

  // Дыра, найденная разведкой: фулл-хаус/каре/стрит-флеш не получали НИ ОДНОЙ строки про
  // натсовость (падали в null) — вакуум модель заполняла сама.
  it("фулл-хаус, который бьётся каре — получает честное «НЕ натс»", () => {
    const r = nut(["8h", "8d"], ["8s", "Kh", "Kd", "2c", "3s"]);
    expect(r).toContain("НЕ натс");
    expect(r).toContain("каре");
    expect(r).not.toContain("НАТСОВЫЙ");
  });

  it("непобедимое каре — молчим (строка «тебя бьют 0 из N» уже всё сказала)", () => {
    expect(nut(["8h", "8d"], ["8s", "8c", "Kd", "2c", "3s"])).toBeNull();
  });

  // Обе реальные раздачи из регресс-корпуса, где парсер противоречил сам себе и ВСЕ модели шли
  // за ним. Держим их живыми: класс «ложный натс» рождался здесь, а не в голове модели.
  it("корпус #1: A6s, флеш на спаренном борде — не «никто не бьёт», а честное «НЕ натс»", () => {
    const r = nut(["As", "6s"], ["2s", "8s", "2d", "9s"]);
    expect(r).not.toContain("никто не бьёт");
    expect(r).toContain("НЕ натс");
    expect(r).toContain("фулл-хаусы");
  });

  it("корпус #32: ATo, фулл-хаус на трипсовом борде — «НЕ натс», живо каре", () => {
    const r = nut(["Ad", "Tc"], ["9s", "Th", "9d", "9h"]);
    expect(r).toContain("НЕ натс");
    expect(r).toContain("каре");
  });

  // Борд не закрыт: «сейчас никто не бьёт» ≠ «не побьёт никогда» — на флопе натс легко перестаёт
  // им быть к риверу, и утверждать вечность там, где её нет, — то же самое враньё.
  it("натс на флопе — с оговоркой «на этой улице»; на ривере — без неё", () => {
    expect(nut(["Ac", "Kd"], ["Qc", "Js", "Th"])).toContain("на этой улице");
    expect(nut(["Ah", "3h"], ["9h", "7d", "2h", "5h", "Kh"])).not.toContain("на этой улице");
  });

  it("честный натс-флеш на неспаренном борде — остаётся НАТСОВЫМ (не отняли лишнего)", () => {
    expect(nut(["Ah", "3h"], ["9h", "7d", "2h", "5h", "Kh"])).toContain("НАТСОВЫЙ");
  });
});

describe("madeHandVulnerability — суб-бакет STRONG_MADE (структурная сила)", () => {
  it("нижний сет: НЕ топ, на борде старшие карты", () => {
    const r = madeHandVulnerability(["9c", "9d"], ["Qh", "Js", "9h"]);
    expect(r).toContain("НЕ топ");
    expect(r).toContain("сет девяток");
  });

  it("топ-сет: старших карт на борде нет", () => {
    const r = madeHandVulnerability(["Kc", "Kd"], ["Kh", "7s", "2d"]);
    expect(r).toContain("ТОП-сет");
  });

  it("две пары — сильно, но НЕ натс (бьются сетом/старшими двумя парами)", () => {
    const r = madeHandVulnerability(["Kh", "Qs"], ["Kd", "Qc", "5h"]);
    expect(r).toContain("НЕ натс");
    expect(r).toContain("Две пары");
  });

  // Ревью суб-бакета (баг MEDIUM): трипс (одна карта + пара на борде) звался «сет» + ложный
  // «ТОП-сет, почти всегда лучшая» на спаренном борде, где фулл уже в игре.
  it("трипс (A7 на 7-7-2) — зовётся трипсом, не сетом; отмечает спаренную доску/фулл", () => {
    const r = madeHandVulnerability(["Ac", "7d"], ["7h", "7s", "2c"]);
    expect(r).toContain("трипс");
    expect(r).not.toContain("ТОП-сет");
    expect(r).toContain("спарена");
  });

  // Ревью суб-бакета (LOW→ценно): старшая пара из двух ОБЩАЯ (на борде) — спор по младшей.
  // Ровно инцидент 66 vs JJ на QQ432: дамы общие, решают шестёрки/валеты.
  it("две пары со старшей парой на борде (66 на QQ432) — спор по младшей паре", () => {
    const r = madeHandVulnerability(["6c", "6d"], ["Qh", "Qs", "4d", "3c", "2h"]);
    expect(r).toContain("общая");
    expect(r).toContain("шестёрок");
  });

  it("флеш/стрит/пара → null (покрыты натсовостью/опасностью, не дублируем)", () => {
    expect(madeHandVulnerability(["Ac", "2c"], ["7c", "9c", "Kc"])).toBeNull(); // флеш
    expect(madeHandVulnerability(["Ac", "8h"], ["As", "9d", "2h"])).toBeNull(); // пара
  });
});

describe("madeHandKicker — доминирование кикера своей пары", () => {
  it("доминируемый кикер на сухом борде (K8 на K-5-2)", () => {
    const r = madeHandKicker(["Kc", "8h"], ["Kd", "5s", "2c"]);
    expect(r).toContain("доминируется");
    expect(r).toContain("восьмёрк"); // кикер восьмёрка
  });

  // Ревью 4 фактов (баг MEDIUM): раньше молчали, когда старший кикер общий с борда — но второй
  // кикер РЕШАЕТ: K7 на K-Q-4 бит KJ/KT/K9/K8. Должен выдать доминирование, не null.
  it("доминирование вторым кикером, когда старшая карта борда общая (K7 на K-Q-4)", () => {
    const r = madeHandKicker(["Kc", "7h"], ["Kd", "Qs", "4c"]);
    expect(r).not.toBeNull();
    expect(r).toContain("доминируется");
  });

  it("топовый кикер — по кикеру не перебить (A-туз-кикер: A K на A-5-2)", () => {
    const r = madeHandKicker(["Ac", "Kh"], ["Ad", "5s", "2c"]);
    expect(r).toContain("топовый");
  });

  it("карманная пара и пара-на-борде → null (кикер не решает / своей пары нет)", () => {
    expect(madeHandKicker(["9c", "9d"], ["2h", "5s", "Kc"])).toBeNull(); // карманка
    expect(madeHandKicker(["Ac", "3h"], ["Kd", "Kc", "5s"])).toBeNull(); // пара королей на борде
  });
});

describe("nutFlushBlocker — блокер к натс-флешу соперника", () => {
  it("держишь туз масти на флеш-борде без своего флеша → натс-флеш заблокирован", () => {
    const r = nutFlushBlocker(["As", "9h"], ["7s", "2s", "Ks"]);
    expect(r).toContain("натсовый флеш у соперника заблокирован");
    expect(r).toContain("пик");
    expect(r).toContain("БЛОКЕР"); // осторожная подача: не «ты впереди»
  });

  it("держишь НЕ топ карту масти (туз ещё жив) → null (старший флеш возможен)", () => {
    expect(nutFlushBlocker(["Qs", "9h"], ["7s", "2s", "Ks"])).toBeNull();
  });

  it("сам собрал флеш → null (это натсовость, не блокер)", () => {
    expect(nutFlushBlocker(["As", "Qs"], ["7s", "2s", "Ks"])).toBeNull();
  });

  it("масть не держишь / нет флеш-борда → null", () => {
    expect(nutFlushBlocker(["Ah", "Kd"], ["7s", "2s", "Ks"])).toBeNull(); // не держит пику
    expect(nutFlushBlocker(["As", "9h"], ["7s", "2h", "Kd"])).toBeNull(); // 1 пика на борде
  });
});
