/**
 * Тесты конструкторов писем подписки (buildPaymentSuccessEmail, buildRenewalReminderEmail).
 * Чистые функции без БД — проверяем адресата, тему, тариф, сумму, дату и вариативность
 * напоминания (автосписание vs ручное продление).
 */
import { describe, it, expect } from "vitest";
import {
  buildPaymentSuccessEmail,
  buildRenewalReminderEmail,
} from "@/features/subscription/subscription-emails";

const TO = "user@example.com";

describe("buildPaymentSuccessEmail", () => {
  it("тема, тариф, сумма в рублях и дата окончания", () => {
    const until = new Date("2026-07-15T10:00:00Z");
    const msg = buildPaymentSuccessEmail(TO, "Продвинутый", until, 200000, "ru");
    expect(msg.to).toBe(TO);
    expect(msg.subject).toMatch(/Оплата прошла/);
    expect(msg.text).toMatch(/Продвинутый/);
    expect(msg.text).toMatch(/2\s000\s₽/); // 200000 копеек = 2000 ₽ (разделитель — NBSP)
    expect(msg.text).toMatch(/2026/);
    expect(msg.html).toContain("/account");
  });

  it("locale en → тема на английском, сумма и тариф сохранены", () => {
    const until = new Date("2026-07-15T10:00:00Z");
    const msg = buildPaymentSuccessEmail(TO, "Продвинутый", until, 200000, "en");
    expect(msg.subject).toMatch(/Payment received/);
    expect(msg.text).toMatch(/Продвинутый/);
    expect(msg.text).toMatch(/2\s000\s₽/);
  });
});

describe("buildRenewalReminderEmail", () => {
  const end = new Date("2026-07-15T10:00:00Z");

  it("автосписание (карта привязана) → про списание", () => {
    const msg = buildRenewalReminderEmail(TO, "Базовый", end, true, "ru");
    expect(msg.subject).toMatch(/продление/i);
    expect(msg.text).toMatch(/спишем|списан/i);
    expect(msg.text).toMatch(/Базовый/);
  });

  it("без карты → про истечение и ручное продление", () => {
    const msg = buildRenewalReminderEmail(TO, "Базовый", end, false, "ru");
    expect(msg.subject).toMatch(/истекает/i);
    expect(msg.text).toMatch(/истекает/i);
    expect(msg.text).toMatch(/продли/i);
  });

  it("locale en → тема на английском в обоих вариантах", () => {
    expect(buildRenewalReminderEmail(TO, "Базовый", end, true, "en").subject).toMatch(/renews soon/i);
    expect(buildRenewalReminderEmail(TO, "Базовый", end, false, "en").subject).toMatch(/expires soon/i);
  });
});
