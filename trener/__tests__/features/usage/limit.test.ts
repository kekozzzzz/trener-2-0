/**
 * Тесты ядра часовых квот на платные действия (features/usage/limit.ts).
 *
 * Проверяют чистую логику consumeQuota напрямую, с управляемым «сейчас» (параметр
 * now) — не завися от флага isUsageLimitEnabled, который глушит лимитер в тестовой
 * среде для server actions. Защита: один игрок не может сжечь баланс Anthropic
 * штормом загрузок/сообщений сверх потолка за окно.
 *
 * Ключи во всех кейсах уникальны: счётчик окна живёт на уровне модуля и общий
 * для прогона (тот же Map, что у лимитера входа).
 */

import { describe, it, expect } from "vitest";
import { consumeQuota } from "@/features/usage/limit";

const WINDOW = 60 * 60 * 1000; // 1 час

describe("consumeQuota — часовая квота на платные действия", () => {
  it("пропускает запросы в пределах потолка и режет первый сверх него", () => {
    const key = "test-usage:cap";
    const max = 3;
    const t0 = 1_000_000;

    expect(consumeQuota(key, max, WINDOW, t0).ok).toBe(true);
    expect(consumeQuota(key, max, WINDOW, t0 + 1).ok).toBe(true);
    expect(consumeQuota(key, max, WINDOW, t0 + 2).ok).toBe(true);

    // Четвёртый в том же окне — отказ, с остатком окна для подсказки игроку.
    const blocked = consumeQuota(key, max, WINDOW, t0 + 3);
    expect(blocked.ok).toBe(false);
    if (!blocked.ok) expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it("заблокированный запрос не списывает квоту (потолок не уезжает дальше)", () => {
    const key = "test-usage:no-charge-on-block";
    const max = 1;
    const t0 = 2_000_000;

    expect(consumeQuota(key, max, WINDOW, t0).ok).toBe(true);
    // Несколько отказов подряд не должны менять момент сброса окна.
    expect(consumeQuota(key, max, WINDOW, t0 + 10).ok).toBe(false);
    expect(consumeQuota(key, max, WINDOW, t0 + 20).ok).toBe(false);
  });

  it("после истечения окна квота восстанавливается", () => {
    const key = "test-usage:window-reset";
    const max = 2;
    const t0 = 3_000_000;

    expect(consumeQuota(key, max, WINDOW, t0).ok).toBe(true);
    expect(consumeQuota(key, max, WINDOW, t0 + 1).ok).toBe(true);
    expect(consumeQuota(key, max, WINDOW, t0 + 2).ok).toBe(false);

    // За пределами окна — свежая квота.
    expect(consumeQuota(key, max, WINDOW, t0 + WINDOW + 1).ok).toBe(true);
  });
});
