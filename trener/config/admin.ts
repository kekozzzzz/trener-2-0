import { OPERATOR } from "@/config/legal";

// Кто видит админские данные (расходы LLM по всем игрокам).
// По умолчанию админ — оператор (владелец продукта): его email уже задан в
// config/legal.ts (OPERATOR.contactEmail). Так на /status секцию расходов видит
// только владелец, без правки .env на сервере. Можно расширить/переопределить
// списком в .env: ADMIN_EMAILS=a@x.ru,b@y.ru (правило проекта №3 — конфиг, не хардкод).
export function getAdminEmails(): string[] {
  const fromEnv = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;

  return OPERATOR.contactEmail ? [OPERATOR.contactEmail.trim().toLowerCase()] : [];
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}
