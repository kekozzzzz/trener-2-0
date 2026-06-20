import { describe, it, expect } from "vitest";
import { ipv4InRange, ipv4InAnyRange } from "@/lib/net";

describe("ipv4InRange", () => {
  it("одиночный IP — точное совпадение", () => {
    expect(ipv4InRange("185.71.76.10", "185.71.76.10")).toBe(true);
    expect(ipv4InRange("185.71.76.11", "185.71.76.10")).toBe(false);
  });

  it("CIDR — попадание и непопадание в диапазон", () => {
    expect(ipv4InRange("185.71.76.5", "185.71.76.0/27")).toBe(true);
    expect(ipv4InRange("185.71.76.31", "185.71.76.0/27")).toBe(true); // /27 = .0–.31
    expect(ipv4InRange("185.71.76.32", "185.71.76.0/27")).toBe(false); // следующий блок
    expect(ipv4InRange("77.75.156.50", "77.75.156.0/24")).toBe(true);
    expect(ipv4InRange("77.75.157.1", "77.75.156.0/24")).toBe(false);
  });

  it("/0 — любой адрес, мусор — false", () => {
    expect(ipv4InRange("1.2.3.4", "0.0.0.0/0")).toBe(true);
    expect(ipv4InRange("not-an-ip", "1.2.3.0/24")).toBe(false);
    expect(ipv4InRange("1.2.3.4", "garbage")).toBe(false);
    expect(ipv4InRange("999.1.1.1", "999.1.1.1")).toBe(false); // октет > 255
  });

  it("ipv4InAnyRange — хотя бы один диапазон", () => {
    const ranges = ["185.71.76.0/27", "77.75.156.0/24"];
    expect(ipv4InAnyRange("77.75.156.9", ranges)).toBe(true);
    expect(ipv4InAnyRange("8.8.8.8", ranges)).toBe(false);
  });
});
