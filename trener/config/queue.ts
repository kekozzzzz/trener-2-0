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

// Отложенный повтор задачи, ушедшей в карантин (POISONED). Брак содержания часто
// ВЕРОЯТНОСТНЫЙ: на одном и том же споте модель то сползает в запрещённую формулировку, то нет
// (карантин 26.09 — четыре брака подряд, пятый заход чистый). Пара заходов спустя паузу
// подбирают такой случай сами, без участия игрока, которому страница обещает «вернёмся позже».
//
// Пауза короткая (решение Артёма 26.09): тревога о карантине падает в Telegram сразу, настоящую
// поломку всё равно чиню руками, а держать игрока в ожидании час незачем. Правило 3 — в .env.
const DEFAULT_POISON_RETRY_DELAY_MS = 20 * 60_000;
export function getPoisonRetryDelayMs(): number {
  const raw = Number(process.env.QUEUE_POISON_RETRY_DELAY_MS);
  return Number.isInteger(raw) && raw > 0 ? raw : DEFAULT_POISON_RETRY_DELAY_MS;
}

// Сколько отложенных заходов даём СВЕРХ обычных попыток. Каждый заход — одна попытка: attempt
// при возврате НЕ обнуляем, поэтому первая же неудача снова отправляет задачу в карантин, а
// число уже сделанных заходов видно прямо в attempt — отдельная колонка в БД не нужна.
// 0 — выключить отложенный повтор совсем.
const DEFAULT_POISON_RETRY_ROUNDS = 2;
export function getPoisonRetryRounds(): number {
  const raw = Number(process.env.QUEUE_POISON_RETRY_ROUNDS);
  return Number.isInteger(raw) && raw >= 0 && raw <= 10 ? raw : DEFAULT_POISON_RETRY_ROUNDS;
}
