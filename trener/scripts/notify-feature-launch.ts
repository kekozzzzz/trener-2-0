// Разовый РУЧНОЙ бродкаст «у нас вышло что-то классное» — ВСЕМ живым аккаунтам с email.
// Не крон, не повторяется сам. Перед КАЖДЫМ запуском правь CONTENT ниже под конкретную
// фичу, потом: npm run notify:feature-launch
import { prisma } from "../infrastructure/db/client";
import { safeSendEmail } from "../infrastructure/adapters/email";
import { buildFeatureAnnouncementEmail, findBroadcastRecipients } from "../features/email/feature-announcement";
import type { FeatureAnnouncementContent } from "../features/email/feature-announcement";
import { getAppBaseUrl } from "../config/app";

try {
  process.loadEnvFile();
} catch {
  // .env рядом нет — переменные уже в окружении (прод) или их нет вовсе.
}

// ПРАВЬ ПЕРЕД КАЖДЫМ ЗАПУСКОМ — пример ниже про кэш-игры, замени на реальную фичу.
const CONTENT: FeatureAnnouncementContent = {
  ru: {
    subject: "Новое в Whygrid: разбор кэш-игр",
    heading: "Теперь разбираем и кэш-игры",
    paragraph: "Раньше Whygrid читал только турниры - теперь можно загрузить кэш-раздачи и получить тот же сократовский разбор.",
    buttonLabel: "Загрузить раздачи →",
    buttonUrl: `${getAppBaseUrl()}/analyze`,
  },
  en: {
    subject: "New in Whygrid: cash-game reviews",
    heading: "Now reviewing cash games too",
    paragraph: "Whygrid used to read tournaments only - now you can upload cash-game hands and get the same Socratic review.",
    buttonLabel: "Upload hands →",
    buttonUrl: `${getAppBaseUrl()}/analyze`,
  },
};

async function main() {
  const recipients = await findBroadcastRecipients(prisma);
  console.log(`Бродкаст: ${recipients.length} адресат(ов).`);
  console.log(`Тема (ru): "${CONTENT.ru.subject}"`);
  console.log('Проверь текст выше — Ctrl+C, если что-то не так, иначе рассылка начнётся через 5 секунд.');
  await new Promise((resolve) => setTimeout(resolve, 5000));

  for (const { email, locale } of recipients) {
    await safeSendEmail(buildFeatureAnnouncementEmail(email, CONTENT, locale));
    console.log(`  -> отправлено: ${email}`);
  }
  console.log(`Готово. Отправлено: ${recipients.length}.`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
