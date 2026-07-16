import { describe, it, expect } from "vitest";
import { boardDangerFacts, renderShowdownFacts } from "@/parser/facts";
import type { TableSnapshot } from "@/parser/types";

function snap(partial: Partial<TableSnapshot>): TableSnapshot {
  return { seats: [], heroCards: [], board: [], actions: [], potTotal: 0, ...partial };
}

describe("boardDangerFacts — фаза 4: опасность борда", () => {
  it("борд с трипсом: любая карманная пара уже фулл", () => {
    const lines = boardDangerFacts(["As", "Kd"], ["4c", "4h", "4s", "Qd"]);
    expect(lines.some((l) => l.includes("трипс") && l.includes("фулл-хаус"))).toBe(true);
  });

  it("спаренный борд: фулл-хаус в игре, и свой фулл младший (KK7 + 77)", () => {
    const lines = boardDangerFacts(["7c", "7d"], ["Kc", "Kh", "7s"]);
    expect(lines.some((l) => l.includes("спарена") && l.includes("фулл-хаус уже в игре"))).toBe(true);
    expect(lines.some((l) => l.includes("НЕ старший"))).toBe(true);
  });

  it("свой фулл СТАРШИЙ (KK7 + KK) — маркер младшего фулла не срабатывает", () => {
    // KK на KK7 — каре королей/фулл королей, не младший.
    const lines = boardDangerFacts(["Kd", "Ks"], ["Kc", "Kh", "7s"]);
    expect(lines.some((l) => l.includes("НЕ старший"))).toBe(false);
  });

  it("сухой неспаренный борд — маркеров нет", () => {
    expect(boardDangerFacts(["As", "Kd"], ["2c", "7h", "Td"])).toEqual([]);
  });

  it("до флопа — пусто", () => {
    expect(boardDangerFacts(["As", "Kd"], [])).toEqual([]);
  });
});

describe("renderShowdownFacts — фаза 4: вскрытые карты с комбинацией", () => {
  it("классифицирует руку вскрывшегося (JJ на борде с 99 → фулл-хаус)", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "BTN", startingStack: 1000 },
        { label: "Player 6", position: "BB", startingStack: 1000, shownCards: ["Jh", "Jc"] },
      ],
      board: ["9d", "9s", "Jd", "2c", "5h"],
    });
    const out = renderShowdownFacts(s);
    expect(out).toContain("Player 6 вскрыл Jh Jc");
    expect(out).toContain("фулл-хаус");
    expect(out).toContain("НЕ гадай");
  });

  // Поведение изменено 2026-07-17: раньше при отсутствии вскрытия возвращалась ПУСТОТА, и модель
  // заполняла тишину сама — аудит 16.07 поймал выдуманное вскрытие целиком и карты соперника «88»,
  // с которыми тот бы проиграл. Теперь отсутствие факта называется вслух.
  it("нет вскрытий → прямо сказано, что карт соперников нет и не будет", () => {
    const s = snap({
      seats: [{ label: "Hero", position: "BTN", startingStack: 1000 }],
      board: ["9d", "9s", "Jd"],
    });
    const out = renderShowdownFacts(s);
    expect(out).toContain("никто не вскрылся");
    expect(out).toContain("не называй их конкретных карт");
    expect(out).not.toContain("вскрыл "); // блока вскрытых карт нет
  });

  // Инцидент 2026-07-12: детерминированный итог вскрытия против руки Hero (кто старше).
  // Борд QQ432, Hero 66 (две пары дам+шестёрок) против вскрытых JJ (две пары дам+валетов).
  it("итог вскрытия: рука Hero проиграла старшей руке соперника (66 против JJ на QQ432)", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "EARLY", startingStack: 6000 },
        { label: "Player 4", position: "BB", startingStack: 6000, shownCards: ["Jc", "Jd"] },
      ],
      heroCards: ["6c", "6d"],
      board: ["Qh", "Qs", "4d", "3c", "2h"],
    });
    const out = renderShowdownFacts(s);
    expect(out).toContain("Player 4 вскрыл Jc Jd");
    expect(out).toContain("две пары (дам и валетов)");
    expect(out).toContain("твоя рука (две пары (дам и шестёрок)) проиграла");
  });

  it("итог вскрытия: рука Hero старше (наоборот — JJ против 66)", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "EARLY", startingStack: 6000 },
        { label: "Player 4", position: "BB", startingStack: 6000, shownCards: ["6c", "6d"] },
      ],
      heroCards: ["Jc", "Jd"],
      board: ["Qh", "Qs", "4d", "3c", "2h"],
    });
    expect(renderShowdownFacts(s)).toContain("старше этой - против неё ты выиграл вскрытие");
  });

  // Блокер из ревью: Hero сфолдил до вскрытия, соперники вскрылись. Руки Hero на шоудауне
  // не было — строку «твоя рука выиграла/проиграла» давать НЕЛЬЗЯ (ложный факт), но саму
  // комбинацию вскрывшегося показываем.
  it("Hero сфолдил до вскрытия — комбинация соперника есть, ложного сравнения с Hero нет", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "EARLY", startingStack: 6000 },
        { label: "Player 4", position: "BB", startingStack: 6000, shownCards: ["Jc", "Jd"] },
      ],
      heroCards: ["6c", "6d"],
      board: ["Qh", "Qs", "4d", "3c", "2h"],
      actions: [{ street: "TURN", actor: "Hero", action: "FOLD" }],
    });
    const out = renderShowdownFacts(s);
    expect(out).toContain("Player 4 вскрыл Jc Jd");
    expect(out).toContain("две пары (дам и валетов)");
    expect(out).not.toContain("твоя рука");
  });
});

describe("renderShowdownFacts — кто забрал банк (collected)", () => {
  it("победитель из collected — соперник забрал банк, в BB", () => {
    const s = snap({
      seats: [
        { label: "Hero", position: "EARLY", positionName: "UTG", startingStack: 6000, collected: 0 },
        { label: "Player 4", position: "BB", positionName: "BB", startingStack: 6000, collected: 3000 },
      ],
      heroCards: ["6c", "6d"],
      board: ["Qh", "Qs", "4d", "3c", "2h"],
      actions: [{ street: "PREFLOP", actor: "Player 4", action: "POST_BB", amount: 100 }],
    });
    const out = renderShowdownFacts(s);
    expect(out).toContain("Банк по итогам забрал");
    expect(out).toContain("BB - 30 BB");
  });
});
