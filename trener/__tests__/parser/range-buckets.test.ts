import { describe, it, expect } from "vitest";
import { rangeBuckets } from "@/parser/range-buckets";

describe("rangeBuckets — кто платит велью, кто фолдит", () => {
  it("сет 99 против смешанного диапазона: инвариант + есть кто платит и кто фолдит", () => {
    // Борд K93: 99 = сет. KK - сет выше (бьёт нас); KQ/JJ/22 - пары ниже (платят); AQ - воздух (фолд).
    const b = rangeBuckets(["9c", "9d"], ["Ks", "9s", "3h"], ["KK", "KQo", "JJ", "22", "AQo"])!;
    expect(b.beats + b.losesTo + b.ties).toBe(b.total);
    expect(b.worsePays + b.worseAir).toBe(b.beats);
    expect(b.losesTo).toBeGreaterThan(0); // KK
    expect(b.worsePays).toBeGreaterThan(0); // KQ/JJ/22
    expect(b.worseAir).toBeGreaterThan(0); // AQ
  });

  it("блеф: топ-пара, а весь диапазон соперника её бьёт → worsePays = 0", () => {
    // Борд K93: у Hero KJ (топ-пара). Диапазон {AA,KK,99,33} - всё сеты/оверпары выше → платить нечему.
    const b = rangeBuckets(["Kc", "Jc"], ["Ks", "9s", "3h"], ["AA", "KK", "99", "33"])!;
    expect(b.worsePays).toBe(0); // ничего слабее не платит - «велью» тут нет
    expect(b.losesTo).toBeGreaterThan(0);
  });

  it("кривой вход → null", () => {
    expect(rangeBuckets(["Kc"], ["Ks", "9s", "3h"], ["AA"])).toBeNull(); // одна карта
    expect(rangeBuckets(["Kc", "Jc"], ["Ks", "9s", "3h"], [])).toBeNull(); // пустой диапазон
  });
});
