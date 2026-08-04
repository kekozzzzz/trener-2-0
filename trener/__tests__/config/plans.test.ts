import { describe, it, expect } from "vitest";
import {
  getPlans,
  getPlan,
  getEffectiveTournamentLimit,
  getFreeTournamentLimit,
  PLANS_LIST,
} from "@/config/plans";

// Сетка 2026-07-10 (plans/2026-07-10-новые-тарифы.md): $7/25 и безлимит (fair-use 300),
// цена «Продвинутого» поднята с $21 до $28 по решению Артёма 19.07.2026.
// max скрыт с витрины, но жив для старых подписок. Тесты закрепляют решение Артёма —
// случайная правка чисел без нового решения должна уронить тест.

describe("тарифная сетка 2026-07-10", () => {
  it("витрина — два тарифа: $7/25 и $28/безлимит; max скрыт", () => {
    const plans = getPlans();
    expect(plans.map((p) => p.code)).toEqual(["basic", "standard"]);
    expect(plans[0]).toMatchObject({ priceUsd: 7, tournamentLimit: 25 });
    expect(plans[1]).toMatchObject({ priceUsd: 28, unlimited: true });
  });

  it("скрытый max остаётся рабочим планом (старые подписки: comp владельца, тестер)", () => {
    const max = getPlan("max");
    expect(max).not.toBeNull();
    expect(max?.hidden).toBe(true);
    expect(max?.tournamentLimit).toBe(500);
    // Полный список (для гейта/вебхука) по-прежнему знает все три кода.
    expect(PLANS_LIST.map((p) => p.code)).toEqual(["basic", "standard", "max"]);
  });

  // Тест закрепляет ТЕКУЩЕЕ решение, случайная правка числа без нового решения его уронит.
  it("бесплатных турниров без подписки — 1", () => {
    expect(getFreeTournamentLimit()).toBe(1);
  });

  it("fair-use предохранитель безлимита — 300 разборов за период", () => {
    expect(getPlan("standard")?.tournamentLimit).toBe(300);
  });
});

describe("getEffectiveTournamentLimit (legacy при смене сетки)", () => {
  it("basic: период, оплаченный ДО среза 2026-07-11 — дожинается на старом лимите 50", () => {
    expect(getEffectiveTournamentLimit("basic", new Date("2026-07-01T00:00:00.000Z"))).toBe(50);
    expect(getEffectiveTournamentLimit("basic", new Date("2026-07-10T23:59:59.000Z"))).toBe(50);
  });

  it("basic: период, начатый ПОСЛЕ среза — новый лимит 25", () => {
    expect(getEffectiveTournamentLimit("basic", new Date("2026-07-11T00:00:00.000Z"))).toBe(25);
    expect(getEffectiveTournamentLimit("basic", new Date("2026-08-01T00:00:00.000Z"))).toBe(25);
  });

  it("standard/max: legacy не касается, лимит из конфига в любую дату", () => {
    const past = new Date("2026-07-01T00:00:00.000Z");
    expect(getEffectiveTournamentLimit("standard", past)).toBe(300);
    expect(getEffectiveTournamentLimit("max", past)).toBe(500);
  });

  it("неизвестный план → null (гейт пропустит защитно)", () => {
    expect(getEffectiveTournamentLimit("vip", new Date())).toBeNull();
    expect(getEffectiveTournamentLimit(null, new Date())).toBeNull();
  });
});
