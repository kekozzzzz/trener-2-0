// Конкурентность воркера очереди: сколько задач разгребать одновременно.
// Разбор турнира — это ~8 параллельных GENERATE_HAND_ANALYSIS; считать их по одной
// (последовательно) = 40-60с, параллельно = ~10с. claimTask берёт задачи через
// FOR UPDATE SKIP LOCKED, поэтому N воркеров не возьмут одну и ту же задачу.
//
// Правило 3 — операционная настройка живёт в конфиге/.env, не в бизнес-логике.
// Переопределяется QUEUE_CONCURRENCY, чтобы тюнить под VM без передеплоя.
// Внимание: значение не должно превышать размер пула соединений Prisma
// (connection_limit в DATABASE_URL) — иначе параллельные транзакции просто встанут
// в очередь за соединением, прироста не будет.
const DEFAULT_CONCURRENCY = 5;

export function getQueueConcurrency(): number {
  const raw = Number(process.env.QUEUE_CONCURRENCY);
  if (Number.isInteger(raw) && raw >= 1 && raw <= 32) return raw;
  return DEFAULT_CONCURRENCY;
}

// Сколько задача может «висеть» в PROCESSING, прежде чем считается осиротевшей: процесс
// умер во время обработки (pm2 restart) ЛИБО лейн завис на сетевом вызове. claimTask берёт
// только PENDING, сама себя такая задача не починит — её возвращает жнец (reapStuckTasks),
// и по этому же порогу health/дайджест считают «воркер завис». Порог заметно больше самого
// долгого шага (LLM-вызов ≤90с даже с повторами), чтобы не трогать живую работу. Правило 3 —
// в .env (QUEUE_STUCK_TIMEOUT_MS), тюнить без передеплоя. Единый источник для worker.ts и health.
const DEFAULT_STUCK_PROCESSING_MS = 10 * 60_000;
export function getStuckProcessingThresholdMs(): number {
  const raw = Number(process.env.QUEUE_STUCK_TIMEOUT_MS);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_STUCK_PROCESSING_MS;
}
