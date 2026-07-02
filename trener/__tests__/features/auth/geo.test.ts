/**
 * Тесты countryFromIp (features/auth/geo.ts): страна по IP через локальный
 * справочник geoip-country. Известные публичные адреса → код страны,
 * мусор/пустота/приватные адреса → null (и никогда не бросает).
 */

import { describe, it, expect } from "vitest";
import { countryFromIp } from "@/features/auth/geo";

describe("countryFromIp", () => {
  it("публичный адрес Google DNS → US", () => {
    expect(countryFromIp("8.8.8.8")).toBe("US");
  });

  it("публичный адрес Яндекса → RU", () => {
    expect(countryFromIp("77.88.55.66")).toBe("RU");
  });

  it("мусорная строка → null", () => {
    expect(countryFromIp("not-an-ip")).toBeNull();
  });

  it("пустота и служебный ключ лимитера → null", () => {
    expect(countryFromIp("")).toBeNull();
    expect(countryFromIp(null)).toBeNull();
    expect(countryFromIp(undefined)).toBeNull();
    expect(countryFromIp("unknown")).toBeNull();
  });

  it("приватный адрес локальной сети → null", () => {
    expect(countryFromIp("192.168.1.1")).toBeNull();
  });
});
