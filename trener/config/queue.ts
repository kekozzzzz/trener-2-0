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
