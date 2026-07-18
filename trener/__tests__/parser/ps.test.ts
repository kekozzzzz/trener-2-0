import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parsePokerStarsMtt } from "@/parser/ps";
import { parseHandHistory, sniffTournamentKey } from "@/parser";

const psBuffer = fs.readFileSync(path.join(__dirname, "../fixtures/ps_mtt.txt"));

// Реальные ники из фикстуры — НЕ должны попасть в снимок (обезличивание).
const REAL_NAMES = ["kefirhero", "Villain A", "Big Stack"];

describe("parsePokerStarsMtt — формат PokerStars / Chico", () => {
  it("парсит метаданные турнира и метит Chico по префиксу стола CHC_", () => {
    const result = parsePokerStarsMtt(psBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room).toBe("Chico");
    expect(result.data.externalTournamentId).toBe("555");
    expect(result.data.name).toBe("$5+$0.50 USD Hold'em No Limit");
    expect(result.data.playedAt).toBe("2026-01-01T12:00:00.000Z");
    expect(result.data.handsCount).toBe(3);
  });

  it("определяет героя по «Dealt to» и считает VPIP/PFR (ники с пробелами)", () => {
    const result = parsePokerStarsMtt(psBuffer);
    if (!result.ok) return;
    // фолд / рейз+выигрыш / колл олл-ина → VPIP 2/3, PFR 1/3
    expect(result.data.vpipPercent).toBe(66.67);
    expect(result.data.pfrPercent).toBe(33.33);
  });

  it("считает chipResult героя (двоеточие, анте, олл-ин оппонента)", () => {
    const result = parsePokerStarsMtt(psBuffer);
    if (!result.ok) return;
    expect(result.data.hands[0].chipResult).toBe(-15); // анте 5 + SB 10, фолд
    expect(result.data.hands[1].chipResult).toBe(130); // рейз 60 + бет 50, забрал 245, анте 5
    expect(result.data.hands[2].chipResult).toBe(-1005); // анте 5 + BB 30 + колл 970, проигрыш
  });

  // hand[2] — KK коллом опен-олл-ина на префлопе: форсированный вход премиум-рукой, постфлоп-
  // решений нет → COOLER, а не «Стоит обсудить» (Артём 18.07: «что бы ни случилось, я выставляюсь»).
  it("форс-олл-ин премиум-рукой на префлопе → COOLER", () => {
    const result = parsePokerStarsMtt(psBuffer);
    if (!result.ok) return;
    expect(result.data.hands[2].importanceLevel).toBe("COOLER");
  });

  it("определяет позицию героя на баттоне", () => {
    const result = parsePokerStarsMtt(psBuffer);
    if (!result.ok) return;
    const heroSeat = result.data.hands[1].tableSnapshot.seats.find((s) => s.label === "Hero");
    expect(heroSeat?.position).toBe("BTN");
  });

  it("обезличивает: реальные ники не попадают в снимок, карты героя сохранены", () => {
    const result = parsePokerStarsMtt(psBuffer);
    if (!result.ok) return;
    const json = JSON.stringify(result.data.hands);
    for (const name of REAL_NAMES) expect(json).not.toContain(name);
    expect(result.data.hands[1].tableSnapshot.heroCards).toEqual(["Ah", "Ad"]);
  });

  it("роутер направляет PS-файл в PS-парсер", () => {
    const result = parseHandHistory(psBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room).toBe("Chico");
  });

  it("sniffTournamentKey распознаёт PS для склейки многостольных файлов", () => {
    expect(sniffTournamentKey(psBuffer)).toEqual({ room: "PS", tournamentId: "555" });
  });

  // Регрессия: в KO-турнирах PokerStars Seat-строка имеет суффикс "(N in chips, $X bounty)".
  // Без толерантности к нему места/действия не парсились (AF=0, post=0).
  it("парсит KO-турнир PokerStars с суффиксом баунти в Seat", () => {
    const ko = [
      "PokerStars Hand #1: Tournament #777, $15+$15+$3 USD Hold'em No Limit - Level II (20/40) - 2024/03/25 16:36:16 ET",
      "Table '777 2' 8-max Seat #1 is the button",
      "Seat 1: Hero777 (3000 in chips, $15 bounty)",
      "Seat 2: Foe (3000 in chips, $15 bounty)",
      "Foe: posts small blind 20",
      "Hero777: posts big blind 40",
      "*** HOLE CARDS ***",
      "Dealt to Hero777 [Ah Kh]",
      "Foe: raises 60 to 100",
      "Hero777: calls 60",
      "*** FLOP *** [Ad 7c 2d]",
      "Foe: checks",
      "Hero777: bets 80",
      "Foe: folds",
      "Uncalled bet (80) returned to Hero777",
      "Hero777 collected 200 from pot",
      "*** SUMMARY ***",
      "Total pot 200 | Rake 0",
      "Board [Ad 7c 2d]",
      "Seat 1: Hero777 (big blind) collected (200)",
    ].join("\n");
    const r = parsePokerStarsMtt(Buffer.from(ko));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.hands[0].tableSnapshot.seats).toHaveLength(2);
    const hasPostflopBet = r.data.hands[0].tableSnapshot.actions.some(
      (a) => a.actor === "Hero" && a.street === "FLOP" && a.action === "BET",
    );
    expect(hasPostflopBet).toBe(true);
    expect(r.data.hands[0].chipResult).toBe(100); // колл 100 префлоп, бет 80 вернулся, забрал 200
  });

  // PokerPlanets — клон формата PokerStars (тело идентично). Отличия только в шапке:
  // имя рума, турнир как "Tournament (Название)#id" и UTF-8 BOM в начале файла. Плюс
  // рум сам обезличивает оппонентов как "PlayerN". Тело должно разбираться PS-парсером.
  it("парсит PokerPlanets (BOM + Tournament (Название)#id + оппоненты PlayerN)", () => {
    const pp =
      "\uFEFF" +
      [
        "PokerPlanets Hand #31895771: Tournament (Diadem Bounty)#380908, $2.4000+$0.6000 Hold'em No Limit - Level III (25/50) - 2026/03/30 12:43:12 UTC",
        "Table '380908 1'(958546) 8-max Seat #1 is the button",
        "Seat 1: Player1 (10000 in chips)",
        "Seat 2: HeroPP (10000 in chips)",
        "Seat 3: Player3 (10000 in chips)",
        "Player1: posts the ante 10",
        "HeroPP: posts the ante 10",
        "Player3: posts the ante 10",
        "HeroPP: posts small blind 25",
        "Player3: posts big blind 50",
        "*** HOLE CARDS ***",
        "Dealt to HeroPP [Kc Kh]",
        "Player1: folds",
        "HeroPP: raises 150 to 200",
        "Player3: folds",
        "Uncalled bet (150) returned to HeroPP",
        "HeroPP collected 130 from pot",
        "*** SUMMARY ***",
        "Total pot 130 | Rake 0 ",
        "Seat 1: Player1 (button) folded before Flop (didn't bet)",
        "Seat 2: HeroPP (small blind) collected (130)",
        "Seat 3: Player3 (big blind) folded before Flop",
      ].join("\n");
    const buf = Buffer.from(pp);

    // Прямой вызов PS-парсера
    const r = parsePokerStarsMtt(buf);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.room).toBe("PokerPlanets");
    expect(r.data.externalTournamentId).toBe("380908");
    expect(r.data.name).toBe("$2.4000+$0.6000 Hold'em No Limit");
    expect(r.data.playedAt).toBe("2026-03-30T12:43:12.000Z");
    expect(r.data.handsCount).toBe(1);
    expect(r.data.vpipPercent).toBe(100); // герой добровольно рейзит
    expect(r.data.pfrPercent).toBe(100);
    expect(r.data.hands[0].chipResult).toBe(70); // анте 10 + SB 25, рейз до 200, 150 вернулось, забрал 130
    // Обезличивание: реальный ник героя не утекает
    expect(JSON.stringify(r.data.hands)).not.toContain("HeroPP");

    // Роутер направляет PokerPlanets в PS-парсер (несмотря на BOM и форму турнира)
    const routed = parseHandHistory(buf);
    expect(routed.ok).toBe(true);
    if (!routed.ok) return;
    expect(routed.data.room).toBe("PokerPlanets");

    // Склейка многостольных файлов: ключ турнира вытаскивается из формы со скобками
    expect(sniffTournamentKey(buf)).toEqual({ room: "PokerPlanets", tournamentId: "380908" });
  });

  // Классический (НЕ-KO) турнир PokerStars: бай-ин из 2 частей "$10+$1", Seat БЕЗ
  // суффикса баунти, room = PokerStars (не Chico). Должен парситься так же.
  it("парсит классический турнир PokerStars без баунти", () => {
    const classic = [
      "PokerStars Hand #2: Tournament #888, $10+$1 USD Hold'em No Limit - Level I (10/20) - 2024/03/25 16:00:00 ET",
      "Table '888 2' 9-max Seat #1 is the button",
      "Seat 1: HeroX (1500 in chips)",
      "Seat 2: FoeY (1500 in chips)",
      "FoeY: posts small blind 10",
      "HeroX: posts big blind 20",
      "*** HOLE CARDS ***",
      "Dealt to HeroX [Qs Qd]",
      "FoeY: raises 40 to 60",
      "HeroX: raises 120 to 180",
      "FoeY: calls 120",
      "*** FLOP *** [2h 7c Kd]",
      "FoeY: checks",
      "HeroX: bets 120",
      "FoeY: folds",
      "Uncalled bet (120) returned to HeroX",
      "HeroX collected 360 from pot",
      "*** SUMMARY ***",
      "Total pot 360 | Rake 0",
      "Board [2h 7c Kd]",
    ].join("\n");
    const r = parsePokerStarsMtt(Buffer.from(classic));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.room).toBe("PokerStars");
    expect(r.data.name).toBe("$10+$1 USD Hold'em No Limit");
    expect(r.data.hands[0].tableSnapshot.seats).toHaveLength(2);
    expect(r.data.hands[0].chipResult).toBe(180); // рейз 180 префлоп, бет 120 вернулся, забрал 360
  });
});
