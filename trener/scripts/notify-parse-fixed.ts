// Разовая РУЧНАЯ рассылка «починили — попробуй снова» тем, кто раньше упёрся в
// ошибку разбора с конкретной сигнатурой (unrecognized_uploads.signature).
// Запускать после того как реально задеплоен фикс/новый парсер под эту сигнатуру —
// не крон, вызывается вручную ровно один раз на сигнатуру.
// Запуск: npm run notify:parse-fixed -- "<сигнатура>"
import { prisma } from "../infrastructure/db/client";
import { safeSendEmail } from "../infrastructure/adapters/email";
import { buildParseFixedEmail, findRecipientsForSignature } from "../features/tournaments/parse-fixed-email";

try {
  process.loadEnvFile();
} catch {
  // .env рядом нет — переменные уже в окружении (прод) или их нет вовсе.
}

async function main() {
  const signature = process.argv[2];
  if (!signature) {
    console.error('Использование: npm run notify:parse-fixed -- "<сигнатура>"');
    process.exit(1);
  }

  const recipients = await findRecipientsForSignature(signature);
  if (recipients.length === 0) {
    console.log(`Нет игроков с активным email для сигнатуры "${signature}".`);
    return;
  }

  console.log(`Сигнатура "${signature}": рассылаю ${recipients.length} игрок(ам).`);
  for (const { email, locale } of recipients) {
    await safeSendEmail(buildParseFixedEmail(email, locale));
    console.log(`  -> отправлено: ${email}`);
  }
  console.log("Готово.");
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
