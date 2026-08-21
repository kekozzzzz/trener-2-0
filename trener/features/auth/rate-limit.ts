import { headers } from "next/headers";

// Простой счётчик попыток с фиксированным окном, живёт в памяти процесса.
// Для одной VM (текущий деплой) этого достаточно; при переходе на несколько
// инстансов заменить на общий store (Redis/PostgreSQL) — тот же приём, что уже
// отмечен для in-process блокировки воркера в app/api/cron/run-tasks/route.ts.
//
// Это НЕ "use server"-модуль: экспортирует обычные (не async) функции, которые
// вызывает server action features/auth/actions.ts. На клиент не попадает —
// импортируется только серверным кодом и тянет next/headers (server-only).

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

// Чтобы Map не рос бесконечно: при каждой новой записи изредка подметаем
// протухшие окна. Для пары сотен пользователей объём ничтожен — порог высокий.
const SWEEP_THRESHOLD = 10_000;

function liveBucket(key: string, now: number): Bucket | null {
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) return null;
  return bucket;
}

function sweep(now: number): void {
  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) buckets.delete(key);
  }
}

// Текущее число попыток в живом окне ключа (0 — окна нет или оно истекло).
// Не инкрементит: вызывается ДО проверки пароля, чтобы решить «уже заблокирован?».
export function hitCount(key: string, now: number = Date.now()): number {
  return liveBucket(key, now)?.count ?? 0;
}

// Зафиксировать одну попытку: создаёт окно или увеличивает счётчик в текущем.
export function recordHit(key: string, windowMs: number, now: number = Date.now()): void {
  const bucket = liveBucket(key, now);
  if (bucket) {
    bucket.count += 1;
    return;
  }
  if (buckets.size >= SWEEP_THRESHOLD) sweep(now);
  buckets.set(key, { count: 1, resetAt: now + windowMs });
}

// Снять счётчик ключа (после успешного входа — чтобы серия удачных логинов не
// упёрлась в потолок прошлых неудачных попыток того же email).
export function clearHits(key: string): void {
  buckets.delete(key);
}

// Сколько осталось до сброса окна ключа, мс (0 — окна нет). Для сообщения юзеру.
export function retryAfterMs(key: string, now: number = Date.now()): number {
  const bucket = liveBucket(key, now);
  return bucket ? Math.max(0, bucket.resetAt - now) : 0;
}

// IP клиента. Порядок доверия — от неподделываемого к подделываемому:
// (1) x-real-ip — КЗ-релей ставит его сам из $remote_addr (TCP-адрес соединения
//     с релеем), клиент этот заголовок переписать не может;
// (2) cf-connecting-ip — ставит Cloudflare, если когда-нибудь вернёмся к proxied-
//     режиму (сейчас DNS-only, заголовок не приходит от Cloudflare вообще);
// (3) x-forwarded-for, ПОСЛЕДНИЙ элемент цепочки — релей использует
//     $proxy_add_x_forwarded_for, который ДОПИСЫВАЕТ свой IP в конец уже
//     присланного заголовка, а не заменяет его. Значит первый элемент — это то,
//     что прислал сам клиент (может быть что угодно), а надёжен только последний.
// РАНЬШЕ бралось cf-connecting-ip → ПЕРВЫЙ элемент x-forwarded-for → x-real-ip —
// оба первых источника клиент подделывает произвольным заголовком в запросе,
// это полностью обходило IP-лимиты на логине/регистрации/сбросе пароля/форме
// поддержки. Вне HTTP-контекста (тесты, фоновый код) headers() бросает — тогда
// общий ключ "unknown".
export async function clientIp(): Promise<string> {
  try {
    const store = await headers();
    const real = store.get("x-real-ip");
    if (real) return real.trim();
    const cf = store.get("cf-connecting-ip");
    if (cf) return cf.trim();
    const forwarded = store.get("x-forwarded-for");
    if (forwarded) {
      const parts = forwarded.split(",").map((p) => p.trim()).filter(Boolean);
      if (parts.length > 0) return parts[parts.length - 1]!;
    }
  } catch {
    // нет запроса в контексте — отдаём общий ключ
  }
  return "unknown";
}
