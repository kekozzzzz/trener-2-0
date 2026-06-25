import { describe, it, expect } from "vitest";
import { isOpenSignificantlyWide, isOpenPosition } from "@/config/poker/rfi-chart";
import { handCode, handLabel } from "@/config/poker/hand-codes";

describe("handCode / handLabel", () => {
  it("одномастные, разномастные, пара — старший ранг первым", () => {
    expect(handCode(["Kc", "7c"])).toBe("K7s");
    expect(handCode(["7d", "Kc"])).toBe("K7o");
    expect(handCode(["7h", "7s"])).toBe("77");
    expect(handCode(["Tc", "Jc"])).toBe("JTs");
  });

  it("подпись — только ранги, без масти", () => {
    expect(handLabel(["Jc", "Td"])).toBe("JT");
    expect(handLabel(["7h", "7s"])).toBe("77");
  });

  it("битые карты → null", () => {
    expect(handCode(["Kc"])).toBeNull();
    expect(handCode([])).toBeNull();
  });
});

describe("isOpenSignificantlyWide — заметно шире нормы", () => {
  it("EARLY: K7s заметно шире, K9s граница (молчим), KTs в чарте", () => {
    expect(isOpenSignificantlyWide("EARLY", "K7s")).toBe(true);
    expect(isOpenSignificantlyWide("EARLY", "K9s")).toBe(false); // полоса допуска
    expect(isOpenSignificantlyWide("EARLY", "KTs")).toBe(false); // открытие
  });

  it("EARLY офсьют QJo шире нормы (чарт только AJo+/KQo)", () => {
    expect(isOpenSignificantlyWide("EARLY", "QJo")).toBe(true);
    expect(isOpenSignificantlyWide("EARLY", "KJo")).toBe(false); // допуск от KQo
  });

  it("CO: K7s в чарте (K7s+), K5s шире (допуск только K6s)", () => {
    expect(isOpenSignificantlyWide("CO", "K7s")).toBe(false);
    expect(isOpenSignificantlyWide("CO", "K5s")).toBe(true);
  });

  it("BTN широкий: K2s шире, K3s граница", () => {
    expect(isOpenSignificantlyWide("BTN", "K2s")).toBe(true);
    expect(isOpenSignificantlyWide("BTN", "K3s")).toBe(false);
  });

  it("пары никогда не шире (все в 22+)", () => {
    expect(isOpenSignificantlyWide("EARLY", "22")).toBe(false);
    expect(isOpenSignificantlyWide("EARLY", "55")).toBe(false);
  });

  it("позиции вне чарта (BB/OTHER) не судим", () => {
    expect(isOpenPosition("BB")).toBe(false);
    expect(isOpenPosition("OTHER")).toBe(false);
    expect(isOpenSignificantlyWide("BB", "72o")).toBe(false);
    expect(isOpenSignificantlyWide("OTHER", "72o")).toBe(false);
  });
});
