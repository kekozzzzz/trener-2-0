import { describe, it, expect, vi } from "vitest";

/**
 * getMetaLocale (lib/seo.ts): язык для title/description/og:* должен быть русским
 * для ЛЮБОГО краулера соцсетей (Telegram/Facebook/Twitter/поисковики), независимо
 * от Accept-Language — превью ссылки генерирует бот получателя, не сам человек,
 * и боты обычно не шлют "ru" в этом заголовке (см. комментарий в lib/seo.ts).
 * Живому браузеру без ru в Accept-Language по-прежнему отдаём английский —
 * это отдельное, уже существующее поведение detectLocale (i18n/config.ts), проверка
 * бота его не трогает.
 */

const { mockHeaders, mockLocale } = vi.hoisted(() => ({
  mockHeaders: new Map<string, string>(),
  mockLocale: { value: "en" as string },
}));

vi.mock("next/headers", () => ({
  headers: async () => ({
    get: (name: string) => mockHeaders.get(name.toLowerCase()) ?? null,
  }),
}));

vi.mock("next-intl/server", async (importActual) => {
  const actual = await importActual<Record<string, unknown>>();
  return { ...actual, getLocale: async () => mockLocale.value };
});

import { getMetaLocale } from "@/lib/seo";

describe("getMetaLocale", () => {
  it("боту-краулеру (TelegramBot) отдаёт ru, даже если реальный locale был бы en", async () => {
    mockHeaders.clear();
    mockHeaders.set("user-agent", "TelegramBot (like TwitterBot)");
    mockLocale.value = "en";
    expect(await getMetaLocale()).toBe("ru");
  });

  it("боту без User-Agent вообще (пустой заголовок) тоже отдаёт ru", async () => {
    mockHeaders.clear();
    mockLocale.value = "en";
    expect(await getMetaLocale()).toBe("ru");
  });

  it("живому браузеру без ru в Accept-Language оставляет обычный (en) locale", async () => {
    mockHeaders.clear();
    mockHeaders.set(
      "user-agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    );
    mockLocale.value = "en";
    expect(await getMetaLocale()).toBe("en");
  });

  it("живому браузеру с ru отдаёт ru как обычно", async () => {
    mockHeaders.clear();
    mockHeaders.set(
      "user-agent",
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36",
    );
    mockLocale.value = "ru";
    expect(await getMetaLocale()).toBe("ru");
  });
});
