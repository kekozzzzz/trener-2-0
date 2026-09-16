/**
 * Тесты SMTP email-адаптера (support@whygrid.app, infrastructure/adapters/email/smtp.ts).
 *
 * Покрывают:
 *  1. sendEmail создаёт транспорт с хостом/портом/логином/паролем из конфига и шлёт
 *     письмо с ожидаемыми from/to/subject/html/text.
 *  2. Ошибка транспорта → бросает (safeSendEmail её глушит — уже покрыто в unisender.test.ts,
 *     логика glushения общая для любого адаптера).
 *
 * Сеть не трогаем — nodemailer замокан целиком.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const sendMailMock = vi.fn();
const createTransportMock = vi.fn((_opts: unknown) => ({ sendMail: sendMailMock }));

vi.mock("nodemailer", () => ({
  default: { createTransport: (opts: unknown) => createTransportMock(opts) },
}));

const ENV_KEYS = [
  "EMAIL_SMTP_HOST",
  "EMAIL_SMTP_PORT",
  "EMAIL_SMTP_USER",
  "EMAIL_SMTP_PASSWORD",
  "EMAIL_FROM_ADDRESS",
  "EMAIL_FROM_NAME",
] as const;
const savedEnv: Record<string, string | undefined> = {};

beforeEach(() => {
  for (const k of ENV_KEYS) savedEnv[k] = process.env[k];
  process.env.EMAIL_SMTP_HOST = "smtp.mail.ru";
  process.env.EMAIL_SMTP_PORT = "465";
  process.env.EMAIL_SMTP_USER = "whygrid.app@mail.ru";
  process.env.EMAIL_SMTP_PASSWORD = "test-app-password";
  process.env.EMAIL_FROM_ADDRESS = "support@whygrid.app";
  process.env.EMAIL_FROM_NAME = "Whygrid";
  sendMailMock.mockReset();
  createTransportMock.mockClear();
});

afterEach(() => {
  for (const k of ENV_KEYS) {
    if (savedEnv[k] === undefined) delete process.env[k];
    else process.env[k] = savedEnv[k];
  }
  vi.restoreAllMocks();
});

const MSG = { to: "player@example.com", subject: "Вход по ссылке", html: "<b>ссылка</b>", text: "ссылка" };

describe("smtpEmailAdapter.sendEmail", () => {
  it("создаёт транспорт из конфига и шлёт письмо с ожидаемыми полями", async () => {
    sendMailMock.mockResolvedValue({ messageId: "1" });
    const { smtpEmailAdapter } = await import("@/infrastructure/adapters/email/smtp");

    await smtpEmailAdapter.sendEmail(MSG);

    expect(createTransportMock).toHaveBeenCalledTimes(1);
    const transportOpts = createTransportMock.mock.calls[0][0] as unknown as {
      host: string;
      port: number;
      secure: boolean;
      auth: { user: string; pass: string };
    };
    expect(transportOpts.host).toBe("smtp.mail.ru");
    expect(transportOpts.port).toBe(465);
    expect(transportOpts.secure).toBe(true);
    expect(transportOpts.auth).toEqual({ user: "whygrid.app@mail.ru", pass: "test-app-password" });

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mail = sendMailMock.mock.calls[0][0];
    expect(mail.from).toBe('"Whygrid" <support@whygrid.app>');
    expect(mail.to).toBe("player@example.com");
    expect(mail.subject).toBe("Вход по ссылке");
    expect(mail.html).toBe("<b>ссылка</b>");
    expect(mail.text).toBe("ссылка");
  });

  it("ошибка транспорта → бросает", async () => {
    sendMailMock.mockRejectedValue(new Error("auth failed"));
    const { smtpEmailAdapter } = await import("@/infrastructure/adapters/email/smtp");

    await expect(smtpEmailAdapter.sendEmail(MSG)).rejects.toThrow("auth failed");
  });
});
