/**
 * Тесты конструкторов писем аккаунта (buildWelcomeEmail, buildPasswordChangedEmail).
 * Чистые функции без БД — проверяем адресата, тему и ключевые строки/ссылки.
 * Тексты сокращены 2026-08-31 (план письма-редизайн-и-возврат-игрока): приветствие —
 * до заголовка + одной строки + кнопки; «пароль изменён» — без кнопки сброса
 * (действие бессмысленно, пароль уже сменён) и без «если это ты — всё ок».
 */
import { describe, it, expect } from "vitest";
import { buildWelcomeEmail, buildPasswordChangedEmail } from "@/features/auth/auth-emails";

const TO = "user@example.com";

describe("buildWelcomeEmail", () => {
  it("адресат, тема и кнопка на загрузку турнира", () => {
    const msg = buildWelcomeEmail(TO, "ru");
    expect(msg.to).toBe(TO);
    expect(msg.subject).toMatch(/Whygrid/);
    expect(msg.text).toMatch(/турнир/i);
    expect(msg.html).toContain("<a href=");
    expect(msg.html).toContain("/analyze");
    expect(msg.text.length).toBeGreaterThan(0);
    expect(msg.html.length).toBeGreaterThan(0);
  });

  it("locale en → тема и текст на английском", () => {
    const msg = buildWelcomeEmail(TO, "en");
    expect(msg.subject).toMatch(/Welcome/);
    expect(msg.text).toMatch(/tournament/i);
  });
});

describe("buildPasswordChangedEmail", () => {
  it("адресат, тема, дата и контакт поддержки — без кнопки сброса пароля", () => {
    const changedAt = new Date("2026-07-15T10:00:00Z");
    const msg = buildPasswordChangedEmail(TO, changedAt, "ru");
    expect(msg.to).toBe(TO);
    expect(msg.subject).toMatch(/Пароль изменён/);
    expect(msg.text).toMatch(/2026/);
    expect(msg.text).toMatch(/support@whygrid\.app/);
    expect(msg.html).toContain("mailto:support@whygrid.app");
    // Кнопка «Сбросить пароль» убрана — действие не имеет смысла постфактум.
    expect(msg.html).not.toContain("forgot-password");
  });

  it("locale en → тема на английском", () => {
    const msg = buildPasswordChangedEmail(TO, new Date("2026-07-15T10:00:00Z"), "en");
    expect(msg.subject).toMatch(/Password changed/);
  });
});
