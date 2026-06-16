/**
 * Тесты счётчика попыток (features/auth/rate-limit.ts).
 *
 * Проверяют чистую логику окна/потолка/сброса напрямую, с управляемым «сейчас»
 * (параметр now) — не завися от флага isAuthRateLimitEnabled, который глушит
 * лимитер в тестовой среде для server actions. clientIp здесь не трогаем: он
 * тянет HTTP-контекст, его поведение покрыто гейтом в actions.
 *
 * Ключи во всех кейсах уникальны: Map счётчика живёт на уровне модуля и общая
 * для прогона.
 */

import { describe, it, expect } from "vitest";
import { hitCount, recordHit, clearHits, retryAfterMs } from "@/features/auth/rate-limit";

const WINDOW = 15 * 60 * 1000; // 15 минут

describe("rate-limit счётчик", () => {
  it("recordHit наращивает счётчик в пределах окна", () => {
    const key = "test:increment";
    const t0 = 1_000_000;

    expect(hitCount(key, t0)).toBe(0);
    recordHit(key, WINDOW, t0);
    recordHit(key, WINDOW, t0 + 1000);
    recordHit(key, WINDOW, t0 + 2000);
    expect(hitCount(key, t0 + 3000)).toBe(3);
  });

  it("потолок: после N попыток счётчик достигает порога блокировки", () => {
    const key = "test:threshold";
    const t0 = 2_000_000;
    const max = 5;

    // Пять неудач — на шестой попытке вызывающий увидит hitCount >= max и заблокирует.
    for (let i = 0; i < max; i++) recordHit(key, WINDOW, t0 + i);
    expect(hitCount(key, t0 + max)).toBe(max);
    expect(hitCount(key, t0 + max) >= max).toBe(true);
  });

  it("окно истекает: после windowMs счётчик сбрасывается сам", () => {
    const key = "test:expiry";
    const t0 = 3_000_000;

    recordHit(key, WINDOW, t0);
    recordHit(key, WINDOW, t0 + 100);
    expect(hitCount(key, t0 + 200)).toBe(2);

    // За пределами окна — окна больше нет.
    expect(hitCount(key, t0 + WINDOW + 1)).toBe(0);

    // Новая попытка после истечения открывает свежее окно со счётом 1.
    recordHit(key, WINDOW, t0 + WINDOW + 1);
    expect(hitCount(key, t0 + WINDOW + 2)).toBe(1);
  });

  it("clearHits обнуляет счётчик (успешный вход снимает блок по email)", () => {
    const key = "test:clear";
    const t0 = 4_000_000;

    recordHit(key, WINDOW, t0);
    recordHit(key, WINDOW, t0 + 1);
    expect(hitCount(key, t0 + 2)).toBe(2);

    clearHits(key);
    expect(hitCount(key, t0 + 3)).toBe(0);
  });

  it("retryAfterMs отдаёт остаток окна и 0 после истечения", () => {
    const key = "test:retry-after";
    const t0 = 5_000_000;

    recordHit(key, WINDOW, t0);
    expect(retryAfterMs(key, t0)).toBe(WINDOW);
    expect(retryAfterMs(key, t0 + 60_000)).toBe(WINDOW - 60_000);
    expect(retryAfterMs(key, t0 + WINDOW + 1)).toBe(0);
  });
});
