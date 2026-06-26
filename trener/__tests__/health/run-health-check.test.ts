/**
 * Тесты агрегатора здоровья (infrastructure/health/run-health-check.ts).
 * Без сети: база и порты — фейки. Проверяем сведение статусов и таймаут.
 */

import { describe, it, expect } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { NotifyPort } from "@/infrastructure/adapters/notify";
import type { LlmPort } from "@/infrastructure/adapters/llm";
import { runHealthCheck } from "@/infrastructure/health/run-health-check";

function db(opts: { ok?: boolean; stuck?: number } = {}): PrismaClient {
  const { ok = true, stuck = 0 } = opts;
  return {
    $queryRaw: async () => {
      if (!ok) throw new Error("db down");
      return [{ "?column?": 1 }];
    },
    task: { count: async () => stuck },
  } as unknown as PrismaClient;
}

const notify = (fn: () => Promise<boolean>): NotifyPort => ({ ping: fn } as unknown as NotifyPort);
const llm = (fn: () => Promise<boolean>): LlmPort => ({ ping: fn } as unknown as LlmPort);

const up = async () => true;
const down = async () => false;

describe("runHealthCheck", () => {
  it("всё зелёное → status ok", async () => {
    const r = await runHealthCheck({ db: db(), notify: notify(up), llm: llm(up) });
    expect(r.status).toBe("ok");
    expect(r.checks).toEqual({ db: "ok", telegram: "ok", claude: "ok", worker: "ok" });
  });

  it("telegram недоступен → telegram fail, но status ОСТАЁТСЯ ok (справочная проверка)", async () => {
    const r = await runHealthCheck({ db: db(), notify: notify(down), llm: llm(up) });
    expect(r.status).toBe("ok");
    expect(r.checks.telegram).toBe("fail");
    expect(r.checks.db).toBe("ok");
    expect(r.checks.claude).toBe("ok");
  });

  it("claude бросил исключение → claude fail, но status ОСТАЁТСЯ ok (справочная проверка)", async () => {
    const r = await runHealthCheck({
      db: db(),
      notify: notify(up),
      llm: llm(async () => {
        throw new Error("relay down");
      }),
    });
    expect(r.status).toBe("ok");
    expect(r.checks.claude).toBe("fail");
    expect(r.checks.telegram).toBe("ok");
  });

  it("оба справочных канала (telegram+claude) лежат, но база и воркер живы → status ok", async () => {
    const r = await runHealthCheck({ db: db(), notify: notify(down), llm: llm(down) });
    expect(r.status).toBe("ok");
    expect(r.checks.telegram).toBe("fail");
    expect(r.checks.claude).toBe("fail");
  });

  it("очередь зависла (есть просроченные PENDING) → worker fail", async () => {
    const r = await runHealthCheck({ db: db({ stuck: 4 }), notify: notify(up), llm: llm(up) });
    expect(r.status).toBe("down");
    expect(r.checks.worker).toBe("fail");
  });

  it("база не отвечает → db fail", async () => {
    const r = await runHealthCheck({ db: db({ ok: false }), notify: notify(up), llm: llm(up) });
    expect(r.status).toBe("down");
    expect(r.checks.db).toBe("fail");
  });

  it("проверка зависла дольше таймаута → fail", async () => {
    const prev = process.env.HEALTH_CHECK_TIMEOUT_MS;
    process.env.HEALTH_CHECK_TIMEOUT_MS = "50";
    try {
      const r = await runHealthCheck({
        db: db(),
        notify: notify(() => new Promise<boolean>((resolve) => setTimeout(() => resolve(true), 500))),
        llm: llm(up),
      });
      expect(r.checks.telegram).toBe("fail");
      expect(r.status).toBe("ok"); // telegram — справочный, его таймаут не роняет монитор
    } finally {
      if (prev === undefined) delete process.env.HEALTH_CHECK_TIMEOUT_MS;
      else process.env.HEALTH_CHECK_TIMEOUT_MS = prev;
    }
  });
});
