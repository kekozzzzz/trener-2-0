// Зрячий повтор (карантин 26.09): причину брака содержания показываем модели на следующей
// попытке, сбой связи — не показываем (в промпт уехал бы мусор).
import { describe, it, expect } from "vitest";
import { ContentRejectedError, contentRejectionReason } from "@/infrastructure/adapters/llm/errors";
import { withRejectionNote } from "@/config/prompts/retry-note";
import { llmMeta } from "@/infrastructure/queue/steps/llm-meta";
import type { RawTask } from "@/infrastructure/queue/types";

const task = (error: string | null, attempt = 2): RawTask =>
  ({
    id: "t1",
    type: "GENERATE_HAND_ANALYSIS",
    payload: {},
    status: "PROCESSING",
    attempt,
    run_after: new Date(),
    done_at: null,
    error,
    created_at: new Date(),
    updated_at: new Date(),
  }) as RawTask;

const FOLD_REJECTION =
  "LLM спорит с фолдом игрока, не назвав цену колла: по пот-оддсам нужно ≈38% эквити, а порог в тексте не назван";

describe("contentRejectionReason — что считаем браком содержания", () => {
  it("узнаёт брак сторожа, каким его пишет воркер (String(err))", () => {
    const stored = String(new ContentRejectedError(FOLD_REJECTION));
    expect(contentRejectionReason(stored)).toBe(FOLD_REJECTION);
  });

  it("сбой связи НЕ считает браком содержания — в промпт он не уедет", () => {
    expect(contentRejectionReason("RelayTimeoutError: OpenRouter: таймаут вызова (90000 мс)")).toBeNull();
    expect(contentRejectionReason("Error: fetch failed")).toBeNull();
  });

  it("жнец зависших задач тоже не причина для подсказки", () => {
    expect(contentRejectionReason("Reaped: зависла в PROCESSING (процесс прерван)")).toBeNull();
  });

  it("первая попытка — ошибки ещё нет", () => {
    expect(contentRejectionReason(null)).toBeNull();
  });
});

describe("withRejectionNote — хвост промпта для повтора", () => {
  it("без причины промпт не трогает вовсе (обычная первая попытка)", () => {
    expect(withRejectionNote("ПРОМПТ", undefined)).toBe("ПРОМПТ");
    expect(withRejectionNote("ПРОМПТ", "   ")).toBe("ПРОМПТ");
  });

  it("с причиной дописывает её в КОНЕЦ, сохраняя исходный промпт", () => {
    const out = withRejectionNote("ПРОМПТ", FOLD_REJECTION);
    expect(out.startsWith("ПРОМПТ")).toBe(true);
    expect(out).toContain("Прошлая попытка забракована");
    expect(out).toContain("≈38% эквити");
  });

  it("длинную причину обрезает — раздувать запрос цитатой незачем", () => {
    const out = withRejectionNote("ПРОМПТ", "я".repeat(900));
    expect(out).toContain("…");
    expect(out.length).toBeLessThan(900);
  });
});

describe("llmMeta — что шаг очереди передаёт адаптеру", () => {
  it("на повторе после брака содержания несёт причину", () => {
    const meta = llmMeta(task(String(new ContentRejectedError(FOLD_REJECTION))), "p1");
    expect(meta.playerId).toBe("p1");
    expect(meta.previousRejection).toBe(FOLD_REJECTION);
  });

  it("на повторе после сбоя связи причины нет — повтор идёт как раньше", () => {
    const meta = llmMeta(task("RelayTimeoutError: таймаут вызова"), "p1");
    expect(meta.previousRejection).toBeUndefined();
  });

  it("на первой попытке причины нет", () => {
    expect(llmMeta(task(null, 1), "p1").previousRejection).toBeUndefined();
  });
});
