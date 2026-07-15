/**
 * Тесты блока «ридсы на оппонентов» в промпте разбора раздачи
 * (config/prompts/hand-analysis.ts, plans/2026-07-01-профиль-оппонента.md).
 *
 * Покрывают: рендер блока (тип словами, проценты и выборка от парсера — Правило 1),
 * пустой список → блока нет, и что buildHandAnalysisPrompt вставляет блок целиком
 * с инструкцией приоритета ридсов и запретом показывать тип игроку.
 */

import { describe, it, expect } from "vitest";
import type { TableSnapshot } from "@/parser/types";
import type { OpponentFact } from "@/parser/opponent-profile";
import { renderOpponents, buildHandAnalysisPrompt } from "@/config/prompts/hand-analysis";
import type { HandAnalysisRequest } from "@/infrastructure/adapters/llm/types";

const FISH: OpponentFact = {
  seatLabel: "Player 3",
  type: "FISH",
  confidence: "tentative",
  vpip: 42.9,
  pfr: 7.1,
  handsObserved: 14,
};

const REG: OpponentFact = {
  seatLabel: "Player 6",
  type: "REG",
  confidence: "solid",
  vpip: 21,
  pfr: 17,
  handsObserved: 30,
};

const snapshot: TableSnapshot = {
  seats: [
    { label: "Hero", position: "BTN", startingStack: 4000 },
    { label: "Player 3", position: "BB", startingStack: 4000 },
  ],
  actions: [
    { street: "PREFLOP", actor: "Player 3", action: "POST_BB", amount: 100 },
    { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 250 },
  ],
  heroCards: ["Ac", "Kc"],
  board: [],
  potTotal: 350,
};

const request: HandAnalysisRequest = {
  locale: "ru",
  importanceLevel: "CRITICAL",
  chipResult: -1200,
  tableSnapshot: snapshot,
  tournament: { handsCount: 80, vpipPercent: 24, resultBuyins: -1, styleDiagnosis: "PASSIVE" },
  opponents: [FISH, REG],
};

describe("renderOpponents", () => {
  it("пустой список и undefined → позитивный запрет «ридов нет», а не пустота", () => {
    // Гейт 2026-07-14: в тишине модель домысливает тип/VPIP — даём явный запрет вместо "".
    expect(renderOpponents(undefined, "ru")).toContain("надёжных ридов нет");
    expect(renderOpponents([], "ru")).toContain("НЕ выдумывай");
  });

  it("КОРОТКАЯ выборка (tentative): тип словами БЕЗ точных процентов (гейт 2026-07-14)", () => {
    const block = renderOpponents([FISH], "ru");
    // манера — ПОВЕДЕНИЕМ, не ярлыком «рыба» (2026-07-15: ярлык модель копировала игроку)
    expect(block).toContain("Player 3: предположительно входит в банки широко");
    expect(block).not.toContain("рыба");
    // точный процент на 14 руках — шум, его быть не должно
    expect(block).not.toContain("42.9%");
    expect(block).toContain("точные VPIP/частоты НЕ называй");
    expect(block).toContain("выборка всего 14 раздач — тип предварительный");
  });

  it("solid-выборка: тип + точные числа парсера как есть (Правило 1)", () => {
    const block = renderOpponents([REG], "ru");
    expect(block).toContain("Player 6: предположительно играет крепко и по позиции");
    expect(block).not.toContain("рег");
    expect(block).toContain("в 21% раздач");
    expect(block).toContain("выборка 30 раздач — тип надёжный");
  });

  it("инструкция: приоритет ридса игрока и запрет показывать тип игроку", () => {
    const block = renderOpponents([FISH], "ru");
    expect(block).toContain("живой ридс игрока из его ответа важнее этого приора");
    expect(block).toContain("Игроку это НЕ подавай ярлыком-типом");
  });

  it("при locale=en тип по-английски, короткая выборка — без точных процентов", () => {
    const block = renderOpponents([FISH], "en");
    expect(block).toContain("Player 3: likely enters pots wide");
    expect(block).not.toContain("42.9%");
    expect(block).toContain("do NOT cite exact VPIP");
    expect(block).toContain("Don't hand this to the player as a type label");
    // русских подписей в английском блоке быть не должно
    expect(block).not.toContain("предположительно");
  });
});

describe("buildHandAnalysisPrompt", () => {
  it("с оппонентами — блок ридсов стоит перед снимком стола", () => {
    const prompt = buildHandAnalysisPrompt(request);
    const blockAt = prompt.indexOf("Ридсы парсера на оппонентов");
    const snapshotAt = prompt.indexOf("Размер стола:");
    expect(blockAt).toBeGreaterThan(-1);
    expect(snapshotAt).toBeGreaterThan(blockAt);
    expect(prompt).toContain("Player 3: предположительно входит в банки широко");
    expect(prompt).toContain("Player 6: предположительно играет крепко и по позиции");
  });

  it("без оппонентов — промпт без блока ридсов, как раньше", () => {
    const prompt = buildHandAnalysisPrompt({ ...request, opponents: undefined });
    expect(prompt).not.toContain("Ридсы парсера");
    expect(prompt).toContain("Размер стола:");
  });

  it("при locale=en метки снимка стола и блок оппонентов идут по-английски", () => {
    const prompt = buildHandAnalysisPrompt({ ...request, locale: "en" });
    expect(prompt).toContain("Table size:");
    expect(prompt).toContain("Hero's cards:");
    expect(prompt).toContain("Board:");
    expect(prompt).toContain("Player 3: likely enters pots wide");
    expect(prompt).not.toContain("Размер стола:");
  });
});
