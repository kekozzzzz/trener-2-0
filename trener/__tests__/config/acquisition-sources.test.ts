import { describe, expect, it } from "vitest";
import { isBotUserAgent } from "@/config/acquisition-sources";

describe("isBotUserAgent", () => {
  it("узнаёт краулеры соцсетей/мессенджеров, которые генерируют превью ссылки", () => {
    expect(isBotUserAgent("facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)")).toBe(true);
    expect(isBotUserAgent("TelegramBot (like TwitterBot)")).toBe(true);
    expect(isBotUserAgent("Twitterbot/1.0")).toBe(true);
    expect(isBotUserAgent("Slackbot-LinkExpanding 1.0")).toBe(true);
    expect(isBotUserAgent("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)")).toBe(true);
  });

  it("не считает ботом отсутствующий User-Agent", () => {
    expect(isBotUserAgent(null)).toBe(true);
    expect(isBotUserAgent("")).toBe(true);
  });

  it("пропускает реальные браузеры", () => {
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (Linux; Android 12; SM-G990B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/150.0.0.0 Mobile Safari/537.36",
      ),
    ).toBe(false);
    expect(
      isBotUserAgent(
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      ),
    ).toBe(false);
  });
});
