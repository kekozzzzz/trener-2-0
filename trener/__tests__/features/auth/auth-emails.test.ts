/**
 * Тесты конструкторов писем аккаунта (buildWelcomeEmail, buildPasswordChangedEmail).
 * Чистые функции без БД — проверяем адресата, тему и ключевые строки/ссылки.
 */
import { describe, it, expect } from "vitest";
import { buildWelcomeEmail, buildPasswordChangedEmail } from "@/features/auth/auth-emails";

const TO = "user@example.com";

describe("buildWelcomeEmail", () => {
  it("адресат, тема и приглашение начать разбор", () => {
    const msg = buildWelcomeEmail(TO, "ru");
    expect(msg.to).toBe(TO);
    expect(msg.subject).toMatch(/Whygrid/);
    expect(msg.text).toMatch(/перв/i); // про «первый разбор бесплатный»
    expect(msg.html).toContain("<a href=");
    // и текстовая, и html-версия непустые
    expect(msg.text.length).toBeGreaterThan(0);
    expect(msg.html.length).toBeGreaterThan(0);
  });

  it("locale en → тема и текст на английском", () => {
    const msg = buildWelcomeEmail(TO, "en");
    expect(msg.subject).toMatch(/Welcome/);
    expect(msg.text).toMatch(/free/i);
  });
});

describe("buildPasswordChangedEmail", () => {
  it("адресат, тема, дата и ссылка на сброс при чужой смене", () => {
    const changedAt = new Date("2026-07-15T10:00:00Z");
    const msg = buildPasswordChangedEmail(TO, changedAt, "ru");
    expect(msg.to).toBe(TO);
    expect(msg.subject).toMatch(/Пароль изменён/);
    expect(msg.text).toMatch(/2026/);
    expect(msg.text).toMatch(/forgot-password/);
    expect(msg.text).toMatch(/support@whygrid\.app/);
    expect(msg.html).toContain("forgot-password");
  });

  it("locale en → тема на английском", () => {
    const msg = buildPasswordChangedEmail(TO, new Date("2026-07-15T10:00:00Z"), "en");
    expect(msg.subject).toMatch(/Password changed/);
  });
});
