// Кто видит админские данные (расходы LLM по всем игрокам) и кто — владелец
// (обход бюджета, project_owner_comp_access). Это login-email владельца продукта.
// Раньше брался из OPERATOR.contactEmail, но contactEmail теперь ПУБЛИЧНЫЙ ящик
// поддержки (support@whygrid.app), а владелец входит под личным аккаунтом — поэтому
// идентичность владельца отделена от публичного контакта. По умолчанию — список ниже;
// переопределяется .env: ADMIN_EMAILS=a@x.ru,b@y.ru (правило проекта №3 — конфиг, не хардкод).
const DEFAULT_ADMIN_EMAILS = ["artemkekoz@gmail.com"];

export function getAdminEmails(): string[] {
  const fromEnv = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;

  return DEFAULT_ADMIN_EMAILS.map((e) => e.trim().toLowerCase());
}

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return getAdminEmails().includes(email.toLowerCase());
}

// Собственные тестовые аккаунты Артёма (проверка оплаты и т.п.) — не должны попадать
// в продуктовую статистику (регистрации/воронка/деньги), иначе искажают картину
// реального интереса пользователей. Идентификатор — UUID игрока, не email: у одного
// из тестов аккаунт уже закрыт и анонимизирован (email стёрт), по email его не найти.
// Найдено и подтверждено Артёмом 2026-07-19 (см. retrospectives).
const DEFAULT_EXCLUDED_TEST_PLAYER_IDS = [
  "957b9004-3a84-436b-b447-89668a1ee9ae", // artemiy_bog@mail.ru, тестовая оплата 25.06
  "f187fdb1-efa6-480d-96a0-82b3648fc449", // закрытый тестовый аккаунт, тоже 25.06
];

export function getExcludedTestPlayerIds(): string[] {
  const fromEnv = (process.env.EXCLUDED_TEST_PLAYER_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return fromEnv.length > 0 ? fromEnv : DEFAULT_EXCLUDED_TEST_PLAYER_IDS;
}

// Смещение часового пояса владельца от UTC в часах — по нему админ-статистика
// режет сутки («сегодня/вчера»). По умолчанию Москва (+3, летнего времени в РФ нет).
export function getAdminTzOffsetHours(): number {
  const raw = Number(process.env.ADMIN_TZ_OFFSET_HOURS);
  return Number.isFinite(raw) ? raw : 3;
}
