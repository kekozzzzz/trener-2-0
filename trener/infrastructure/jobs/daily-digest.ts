import type { PrismaClient } from "@prisma/client";
import { getQueueStuckThresholdMs } from "@/config/notify";
import { safeNotifyAdmin } from "@/infrastructure/adapters/notify";

// Ежедневный дайджест администратору (architecture/06-внешние-сервисы.md, раздел 2.2):
// одно сообщение в Telegram со сводкой за сутки — пользователи и состояние очереди.
// Блоки «Подписки» и «Расходы Claude» отложены: первого нет (платежи не сделаны),
// второй требует admin-ключа Anthropic Console — добавятся позже.

const DAY_MS = 24 * 60 * 60 * 1000;

// Собирает текст дайджеста из БД. Вынесено отдельно от отправки — чтобы
// тестировать формат и подсчёты без бота и сети.
export async function buildDailyDigest(db: PrismaClient): Promise<string> {
  const since = new Date(Date.now() - DAY_MS);
  const stuckBefore = new Date(Date.now() - getQueueStuckThresholdMs());

  const [newPlayers, uploadedTournaments, newDialogues, pending, stuck, poisoned, avgRow] = await Promise.all([
    db.player.count({ where: { createdAt: { gte: since } } }),
    db.tournament.count({ where: { createdAt: { gte: since }, deletedAt: null } }),
    db.dialogue.count({ where: { createdAt: { gte: since } } }),
    db.task.count({ where: { status: "PENDING" } }),
    db.task.count({ where: { status: "PENDING", runAfter: { lt: stuckBefore } } }),
    db.task.count({ where: { status: "POISONED" } }),
    db.$queryRaw<Array<{ avg_seconds: number | null }>>`
      SELECT AVG(EXTRACT(EPOCH FROM (done_at - created_at))) AS avg_seconds
      FROM tasks
      WHERE status = 'DONE' AND done_at >= ${since}
    `,
  ]);

  const rawAvg = avgRow[0]?.avg_seconds;
  const avgSeconds = rawAvg == null ? null : Number(rawAvg);
  const avgText = avgSeconds == null || !Number.isFinite(avgSeconds) ? "—" : `${Math.round(avgSeconds)} с`;

  const lines = [
    "📊 Сводка за сутки — Whygrid",
    "",
    "👥 Пользователи",
    `• Новых регистраций: ${newPlayers}`,
    `• Загружено турниров: ${uploadedTournaments}`,
    `• Новых диалогов: ${newDialogues}`,
    "",
    "⚙️ Очередь",
    `• Ждут обработки: ${pending}`,
    `• Зависших (просрочены): ${stuck}`,
    `• В карантине: ${poisoned}`,
    `• Среднее время обработки: ${avgText}`,
  ];

  if (stuck > 0 || poisoned > 0) {
    lines.push("", "⚠️ Очередь требует внимания — загляни на сервер.");
  }

  return lines.join("\n");
}

// Собирает и отправляет дайджест. Мягко: падение Telegram не роняет cron-запрос
// (уведомление вторично — данные в БД никуда не делись).
export async function runDailyDigest(db: PrismaClient): Promise<void> {
  const message = await buildDailyDigest(db);
  await safeNotifyAdmin(message);
}
