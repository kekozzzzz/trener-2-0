import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { parseIpokerMtt } from "@/parser/ipoker";
import { convertCard } from "@/parser/ipoker/hand";
import { parseHandHistory, sniffTournamentKey } from "@/parser";

const ipokerBuffer = fs.readFileSync(path.join(__dirname, "../fixtures/ipoker_mtt.xml"));

// Реальные ники из фикстуры — НЕ должны попасть в снимок (обезличивание).
const REAL_NAMES = ["kefirhero", "VillainA", "BigStack"];

describe("parseIpokerMtt — формат iPoker (XML)", () => {
  it("конвертирует карты <масть><ранг> в наш вид (ten = 10 → T)", () => {
    expect(convertCard("S4")).toBe("4s");
    expect(convertCard("DQ")).toBe("Qd");
    expect(convertCard("HA")).toBe("Ah");
    expect(convertCard("C10")).toBe("Tc");
  });

  it("парсит метаданные турнира из <general> (герой по <nickname>)", () => {
    const result = parseIpokerMtt(ipokerBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room).toBe("iPoker");
    expect(result.data.externalTournamentId).toBe("777");
    expect(result.data.name).toBe("Test MTT #777");
    expect(result.data.playedAt).toBe("2026-01-01T12:00:00.000Z");
    expect(result.data.handsCount).toBe(3);
  });

  it("считает VPIP/PFR по сырым type-кодам действий", () => {
    const result = parseIpokerMtt(ipokerBuffer);
    if (!result.ok) return;
    expect(result.data.vpipPercent).toBe(66.67);
    expect(result.data.pfrPercent).toBe(33.33);
  });

  it("берёт chipResult из тегов <player win bet> (win − bet)", () => {
    const result = parseIpokerMtt(ipokerBuffer);
    if (!result.ok) return;
    expect(result.data.hands[0].chipResult).toBe(-15); // bet 15, win 0
    expect(result.data.hands[1].chipResult).toBe(130); // win 245 − bet 115
    expect(result.data.hands[2].chipResult).toBe(-1005); // bet 1005, проигрыш
  });

  // hand[2] — премиум-рука в префлоп-олл-ине: форс, постфлоп-решений нет → COOLER (Артём 18.07).
  it("форс-олл-ин премиум-рукой на префлопе → COOLER", () => {
    const result = parseIpokerMtt(ipokerBuffer);
    if (!result.ok) return;
    expect(result.data.hands[2].importanceLevel).toBe("COOLER");
  });

  it("определяет позицию героя на баттоне (dealer=1) и его карты/борд", () => {
    const result = parseIpokerMtt(ipokerBuffer);
    if (!result.ok) return;
    const heroSeat = result.data.hands[1].tableSnapshot.seats.find((s) => s.label === "Hero");
    expect(heroSeat?.position).toBe("BTN");
    expect(result.data.hands[1].tableSnapshot.board).toEqual(["As", "7c", "2d", "9h", "3s"]);
    expect(result.data.hands[2].tableSnapshot.heroCards).toEqual(["Kh", "Ks"]);
  });

  it("обезличивает: реальные ники не попадают в снимок", () => {
    const result = parseIpokerMtt(ipokerBuffer);
    if (!result.ok) return;
    const json = JSON.stringify(result.data.hands);
    for (const name of REAL_NAMES) expect(json).not.toContain(name);
  });

  it("роутер направляет iPoker-XML в iPoker-парсер", () => {
    const result = parseHandHistory(ipokerBuffer);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.room).toBe("iPoker");
  });

  it("sniffTournamentKey распознаёт iPoker для склейки многостольных файлов", () => {
    expect(sniffTournamentKey(ipokerBuffer)).toEqual({ room: "iPoker", tournamentId: "777" });
  });

  // Аудит румов 18.07: у iPoker не заполнялся collected, поэтому факт «Банк по итогам забрал…»
  // на этом руме не выходил ВООБЩЕ и модели оставалось выводить победителя из знака результата —
  // ровно то, что этот факт запрещает. Берём из атрибута win в <player>.
  it("collected заполняется из атрибута win — «кто забрал банк» известен", () => {
    const r = parseIpokerMtt(ipokerBuffer);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const winners = r.data.hands.map((h) => h.tableSnapshot.seats.filter((s) => (s.collected ?? 0) > 0));
    expect(winners.every((w) => w.length > 0)).toBe(true); // в каждой раздаче банк кто-то забрал
    // и никогда не «забирают все подряд» — нулевой win в collected не пишем
    expect(winners.every((w) => w.length < r.data.hands[0].tableSnapshot.seats.length)).toBe(true);
  });
});

// Аудит румов 18.07: type 7 у iPoker — ЛЮБОЙ уход ва-банк, а не только колл (так было подписано).
// Суммы обязаны идти в общем для всех румов соглашении: рейз — ИТОГ по улице, колл — ПРИРОСТ.
// Иначе размерности разъезжаются ВНУТРИ рума и агрессивный джем читается как доплата.
describe("iPoker — нормализация сумм у олл-ина (type 7)", () => {
  const xml = (actions: string) => Buffer.from(
    `<root><general><gametype>Holdem NL</gametype><tablename>T, 777</tablename><nickname>hero</nickname>` +
      `<tablesize>3</tablesize><tournamentcode>777</tournamentcode><tournamentname>T</tournamentname>` +
      `<buyin>&euro;5</buyin><totalbuyin>&euro;5</totalbuyin><startdate>2026-01-01 12:00:00</startdate>` +
      `</general><game gamecode="1"><general><startdate>2026-01-01 12:00:00</startdate>` +
      `<smallblind>10</smallblind><bigblind>20</bigblind><ante>0</ante><players>` +
      `<player seat="1" dealer="1" name="opp" chips="1000" win="0" bet="1000"/>` +
      `<player seat="2" dealer="0" name="hero" chips="1000" win="0" bet="1000"/>` +
      `</players></general><round no="0">` +
      `<action player="opp" type="1" sum="10" no="1"/><action player="hero" type="2" sum="20" no="2"/>` +
      `</round><round no="1">${actions}</round></game></root>`,
    "utf8",
  );
  const heroAllIn = (buf: Buffer) => {
    const r = parseIpokerMtt(buf);
    if (!r.ok) return null;
    return r.data.hands[0].tableSnapshot.actions.find((a) => a.actor === "Hero" && a.action === "ALL_IN") ?? null;
  };

  it("джем ПОВЕРХ чужой ставки → сумма как у рейза (итог по улице)", () => {
    // opp ставит 200, Hero уходит ва-банк, добавляя 980 сверх своего BB. round 0 — это блайнды, а
    // round 1 — ВСЁ ЕЩЁ префлоп, поэтому итог Hero по улице = 20 (BB) + 980 = 1000 против 210 у opp.
    // Ждём именно ИТОГ по улице (как пишется рейз), а не прирост.
    const a = heroAllIn(xml(
      `<action player="opp" type="5" sum="200" no="3"/><action player="hero" type="7" sum="980" no="4"/>`,
    ));
    expect(a?.amount).toBe(1000);
  });

  it("ДОПЛАТА до чужого олл-ина → сумма как у колла (прирост)", () => {
    // opp ва-банк на 980, Hero доложил 300 (у него столько осталось) — это колл, не пуш.
    const a = heroAllIn(xml(
      `<action player="opp" type="7" sum="980" no="3"/><action player="hero" type="7" sum="300" no="4"/>`,
    ));
    expect(a?.amount).toBe(300);
  });
});
