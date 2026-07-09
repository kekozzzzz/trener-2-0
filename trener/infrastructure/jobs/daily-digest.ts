import type { PrismaClient } from "@prisma/client";
import { promises as fs } from "fs";
import nodePath from "path";
import { getQueueStuckThresholdMs, getDigestHeartbeatPath } from "@/config/notify";
import { safeNotifyAdmin } from "@/infrastructure/adapters/notify";
import { buildCostReport, formatUsd, type CostReport } from "@/features/usage/cost-report";

// Ежедневный дайджест администратору (architecture/06-внешние-сервисы.md, раздел 2.2):
// одно сообщение в Telegram со сводкой за сутки — пользователи, очередь и расходы Claude.
// Расходы берём из таблицы llm_usage (пишется в anthropic-адаптере из message.usage) —
// admin-ключ Anthropic Console НЕ нужен. Блок «Подписки» отложен (платежи не сделаны).

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

  const cost = await buildCostReport(db, 24);

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
    "",
    ...renderCostBlock(cost),
  ];

  if (stuck > 0 || poisoned > 0) {
    lines.push("", "⚠️ Очередь требует внимания — загляни на сервер.");
  }

  return lines.join("\n");
}

// Блок расходов Claude для дайджеста: всего запросов/$, эффект кэша и топ-3 по тратам.
function renderCostBlock(cost: CostReport): string[] {
  const cacheText =
    cost.cacheNetUsd > 0.00005
      ? `сэкономил ${formatUsd(cost.cacheNetUsd)}`
      : cost.cacheNetUsd < -0.00005
        ? `стоил лишних ${formatUsd(-cost.cacheNetUsd)}`
        : "≈ $0";

  const lines = [
    "💸 Расходы Claude",
    `• Запросов: ${cost.totalRequests}`,
    `• Потрачено: ${formatUsd(cost.totalCostUsd)}`,
    `• Кэш: ${cacheText}`,
  ];

  if (cost.topPlayers.length > 0) {
    lines.push("• Топ по расходам:");
    for (const p of cost.topPlayers.slice(0, 3)) {
      const who = p.email ?? p.playerId.slice(0, 8);
      lines.push(`   – ${who}: ${p.requests} зап., ${formatUsd(p.costUsd)}`);
    }
  }

  return lines;
}

// Собирает и отправляет дайджест. Возвращает, дошёл ли он: cron-роут по этому флагу
// отдаёт честный статус вместо слепого «sent». Падение Telegram cron-запрос не роняет
// (данные в БД целы), но и молча не проглатывается — safeNotifyAdmin логирует причину,
// а false здесь делает провал видимым в статусе крона. При УСПЕХЕ обновляем «пульс» —
// по нему сторож тишины на релее ловит «сводка вообще перестала приходить».
export async function runDailyDigest(db: PrismaClient): Promise<boolean> {
  const message = await buildDailyDigest(db);
  const delivered = await safeNotifyAdmin(message);
  if (delivered) await writeDigestHeartbeat();
  return delivered;
}

// Пульс дайджеста: метка времени последней УСПЕШНОЙ отправки. Сторож тишины на релее
// (независимый Telegram-канал) читает mtime этого файла и бьёт тревогу, если сводка не
// приходила > суток. Провал записи для самого дайджеста не важен — глушим в лог. В тестах
// не пишем, чтобы не плодить файлы.
async function writeDigestHeartbeat(): Promise<void> {
  if (process.env.NODE_ENV === "test" || process.env.VITEST) return;
  try {
    const file = getDigestHeartbeatPath();
    await fs.mkdir(nodePath.dirname(file), { recursive: true });
    await fs.writeFile(file, new Date().toISOString(), "utf8");
  } catch (err) {
    console.error("[digest] не удалось записать пульс дайджеста:", err);
  }
}
