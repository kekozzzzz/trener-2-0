// Кто видит админские данные (расходы LLM по всем игрокам) — email-allowlist в .env
// (правило проекта №3: конфиг, не хардкод). Пусто → админов нет (безопасно по умолчанию:
// расходы с чужими email не утекут обычному залогиненному пользователю на /status).
// Пример: ADMIN_EMAILS=artemkekoz@gmail.com
export function getAdminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}
