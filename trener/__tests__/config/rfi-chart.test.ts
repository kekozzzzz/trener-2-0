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
  it("MP: K4s заметно шире, K5s граница (молчим), K8s в чарте", () => {
    expect(isOpenSignificantlyWide("MP", "K4s")).toBe(true);
    expect(isOpenSignificantlyWide("MP", "K5s")).toBe(false); // полоса допуска от K6s
    expect(isOpenSignificantlyWide("MP", "K8s")).toBe(false); // открытие
  });

  it("MP офсьют: QJo/JTo в чарте, Q9o шире нормы", () => {
    expect(isOpenSignificantlyWide("MP", "QJo")).toBe(false);
    expect(isOpenSignificantlyWide("MP", "JTo")).toBe(false);
    expect(isOpenSignificantlyWide("MP", "Q9o")).toBe(true);
  });

  it("UTG чуть тайтовее MP по офсьюту: JTo шире с UTG, но в чарте с MP", () => {
    expect(isOpenSignificantlyWide("UTG", "JTo")).toBe(true);
    expect(isOpenSignificantlyWide("MP", "JTo")).toBe(false);
  });

  it("CO: Q5s в чарте (Q5s+), Q3s шире (допуск только Q4s)", () => {
    expect(isOpenSignificantlyWide("CO", "Q5s")).toBe(false);
    expect(isOpenSignificantlyWide("CO", "Q3s")).toBe(true);
  });

  it("BTN широкий: J5s в чарте, мусор 72o шире", () => {
    expect(isOpenSignificantlyWide("BTN", "J5s")).toBe(false);
    expect(isOpenSignificantlyWide("BTN", "72o")).toBe(true);
  });

  it("пары никогда не шире (все в 22+)", () => {
    expect(isOpenSignificantlyWide("MP", "22")).toBe(false);
    expect(isOpenSignificantlyWide("MP", "55")).toBe(false);
  });

  it("позиции вне чарта (BB/OTHER) не судим", () => {
    expect(isOpenPosition("BB")).toBe(false);
    expect(isOpenPosition("OTHER")).toBe(false);
    expect(isOpenSignificantlyWide("BB", "72o")).toBe(false);
    expect(isOpenSignificantlyWide("OTHER", "72o")).toBe(false);
  });
});
