import { describe, it, expect } from "vitest";
import { blockerCount, mdf } from "@/parser/blockers";

describe("blockerCount", () => {
  it("туз в руке режет часть комбо AA и AK соперника", () => {
    const [aa, ak] = blockerCount(["As", "Kd"], ["AA", "AKs"]);
    expect(aa.total).toBe(6);
    expect(aa.blocked).toBeGreaterThan(0); // As режет тройку комбо AA
    expect(aa.blocked + aa.remaining).toBe(aa.total);
    expect(ak.total).toBe(4);
    expect(ak.blocked).toBeGreaterThan(0); // As и Kd режут AsKs / AdKd
  });

  it("несовпадающие карты ничего не режут", () => {
    const [qq] = blockerCount(["As", "Kd"], ["QQ"]);
    expect(qq.blocked).toBe(0);
    expect(qq.remaining).toBe(6);
  });
});

describe("mdf", () => {
  it("бет 2/3 банка → MDF ≈ 60%", () => {
    expect(mdf(66, 100)).toBe(60);
  });
  it("бет в банк → MDF 50%", () => {
    expect(mdf(100, 100)).toBe(50);
  });
});
