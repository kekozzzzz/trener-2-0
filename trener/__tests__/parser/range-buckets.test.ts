import { describe, it, expect } from "vitest";
import { rangeBuckets, fullDeckOdds } from "@/parser/range-buckets";

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

// Факт 5 (свип + запрос Артёма): полнодечная перепись «сколько раскладов тебя бьют».
describe("fullDeckOdds — перепись всей колоды против готовой руки", () => {
  it("инвариант beats+losesTo+ties=total; разбивка losesTo по силе", () => {
    // Борд K-9-3, Hero сет девяток. Бьют только старшие: KK (сет королей) — из колоды перебором.
    const o = fullDeckOdds(["9c", "9d"], ["Ks", "9s", "3h"])!;
    expect(o.beats + o.losesTo + o.ties).toBe(o.total);
    expect(o.total).toBeGreaterThan(1000); // ~C(47,2)
    expect(o.losesTo).toBeGreaterThan(0); // KK (сет королей) бьёт сет девяток
    // сет девяток бьёт руки с парой+ (напр. пара королей) → не чистый блеф-кэтчер
    expect(o.heroBeatsValue).toBe(true);
  });

  it("сильная рука на сухом борде: бьющих мало", () => {
    // Топ-сет королей на K-7-2 радуга: почти ничего не бьёт (только редкие каре/фулл невозможны рано).
    const o = fullDeckOdds(["Kc", "Kd"], ["Ks", "7h", "2d"])!;
    expect(o.losesTo).toBe(0); // на флопе K-7-2 сет королей — лучшая возможная рука
    expect(o.beats).toBeGreaterThan(o.total - o.losesTo - o.ties - 1);
  });

  it("блеф-кэтчер на ривере: бьёшь только воздух", () => {
    // Hero A-high (туз-хай, пары нет) на 5-мастном борде без пар: бьёт только младший туз-хай/king-хай.
    const o = fullDeckOdds(["Ah", "Qd"], ["2c", "7s", "9d", "Jh", "Kc"])!;
    expect(o.heroBeatsValue).toBe(false); // ни одной готовой руки соперника Hero не бьёт
  });

  it("кривой вход → null", () => {
    expect(fullDeckOdds(["Kc"], ["Ks", "9s", "3h"])).toBeNull(); // одна карта
    expect(fullDeckOdds(["Kc", "Jc"], ["Ks", "9s"])).toBeNull(); // борд < 3
  });
});
