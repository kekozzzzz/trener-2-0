/**
 * Тест выбора email-адаптера (infrastructure/adapters/email/index.ts).
 *
 * Порядок приоритета (правило 4 — сменный адаптер за портом): SMTP (support@whygrid.app)
 * — основной канал; Unisender Go — запасной, если задан только он; иначе noop.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";

const ENV_KEYS = [
  "EMAIL_SMTP_HOST",
  "EMAIL_SMTP_USER",
  "EMAIL_SMTP_PASSWORD",
  "EMAIL_API_KEY",
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) {
    savedEnv[k] = process.env[k];
    delete process.env[k];
  }
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
});

describe("getEmailAdapter", () => {
  it("SMTP настроен → выбирает smtpEmailAdapter, даже если задан и Unisender", async () => {
    process.env.EMAIL_SMTP_HOST = "smtp.mail.ru";
    process.env.EMAIL_SMTP_USER = "whygrid.app@mail.ru";
    process.env.EMAIL_SMTP_PASSWORD = "pass";
    process.env.EMAIL_API_KEY = "unisender-key";

    const { getEmailAdapter } = await import("@/infrastructure/adapters/email");
    const { smtpEmailAdapter } = await import("@/infrastructure/adapters/email/smtp");

    expect(getEmailAdapter()).toBe(smtpEmailAdapter);
  });

  it("только Unisender настроен → выбирает unisenderEmailAdapter (запасной путь)", async () => {
    process.env.EMAIL_API_KEY = "unisender-key";

    const { getEmailAdapter } = await import("@/infrastructure/adapters/email");
    const { unisenderEmailAdapter } = await import("@/infrastructure/adapters/email/unisender");

    expect(getEmailAdapter()).toBe(unisenderEmailAdapter);
  });

  it("ничего не настроено → выбирает noopEmailAdapter", async () => {
    const { getEmailAdapter } = await import("@/infrastructure/adapters/email");
    const { noopEmailAdapter } = await import("@/infrastructure/adapters/email/noop");

    expect(getEmailAdapter()).toBe(noopEmailAdapter);
  });
});
