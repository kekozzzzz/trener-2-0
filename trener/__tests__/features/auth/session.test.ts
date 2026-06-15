/**
 * Тесты сессионной cookie (features/auth/session.ts).
 *
 * Покрывают:
 *  1. createSession → getSession round-trip.
 *  2. destroySession удаляет cookie.
 *  3. Истёкший токен → null.
 *  4. Подделанная подпись → null.
 *  5. Отсутствие cookie → null.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { createHmac } from "crypto";

const { cookieStore } = vi.hoisted(() => ({ cookieStore: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (cookieStore.has(name) ? { name, value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  }),
}));

import { createSession, getSession, destroySession } from "@/features/auth/session";

function sign(data: string): string {
  return createHmac("sha256", process.env.SESSION_SECRET!).update(data).digest("base64url");
}

function encode(payload: { playerId: string; exp: number }): string {
  const data = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${data}.${sign(data)}`;
}

beforeEach(() => {
  cookieStore.clear();
});

describe("session", () => {
  it("createSession → getSession round-trip", async () => {
    await createSession("player-1");

    const session = await getSession();
    expect(session).toEqual({ playerId: "player-1" });
  });

  it("destroySession удаляет cookie", async () => {
    await createSession("player-1");
    await destroySession();

    expect(await getSession()).toBeNull();
  });

  it("истёкший токен → null", async () => {
    cookieStore.set("session", encode({ playerId: "player-1", exp: Date.now() - 1000 }));

    expect(await getSession()).toBeNull();
  });

  it("подделанная подпись → null", async () => {
    const token = encode({ playerId: "player-1", exp: Date.now() + 60_000 });
    const [data] = token.split(".");
    cookieStore.set("session", `${data}.forged-signature`);

    expect(await getSession()).toBeNull();
  });

  it("отсутствие cookie → null", async () => {
    expect(await getSession()).toBeNull();
  });
});
