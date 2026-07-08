// Устойчивый fetch к КЗ-релею — общий для LLM-разбора и распознавания речи (оба ходят
// через один релей). Две задачи:
//
//  1. ТАЙМАУТ. Без него зависший релей (принял соединение, но молчит) держит fetch по
//     дефолту undici ~5 минут: у разбора лейн воркера всё это время занят задачей в
//     PROCESSING, турнир «замерзает»; у голоса человек смотрит на крутилку. Ограничиваем.
//
//  2. БЫСТРЫЙ ПОВТОР по свежему соединению при ВРЕМЕННЫХ сбоях релея. Перегруженный
//     nginx рвёт соединение или отдаёт 502/503/504 быстро (доли секунды) — это разовая
//     икота, а не залёгший сервис. Повтор гасит её внутри того же ожидания, и человек
//     не замечает, что что-то запиналось.
//
// Полный «висяк» (таймаут) НЕ повторяем: если релей молчал целый таймаут, второй заход
// снова зависнет — только зря держали бы лейн ×N. Отдаём ошибку наверх: в очереди её
// подхватит штатный retry/карантин (worker.ts), у голоса — красная кнопка у микрофона.

// Коды, при которых заход считается временным и повторяется. 4xx (кроме 429) — это
// «мы что-то не так послали», повтор бессмыслен; их пропускаем к вызывающему.
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

// Отдельный класс, чтобы вызывающий/тесты могли отличить таймаут релея от прочих ошибок.
export class RelayTimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RelayTimeoutError";
  }
}

export type ResilientFetchOptions = {
  timeoutMs: number; // предел ожидания ОДНОГО захода
  retries: number; // сколько дополнительных заходов при временном сбое (0 — без повтора)
  label: string; // имя для сообщений об ошибке (напр. "OpenRouter", "STT")
};

export async function resilientFetch(
  url: string,
  init: RequestInit,
  opts: ResilientFetchOptions,
): Promise<Response> {
  let lastErr: unknown;

  for (let attempt = 0; attempt <= opts.retries; attempt++) {
    let res: Response;
    try {
      res = await fetch(url, { ...init, signal: AbortSignal.timeout(opts.timeoutMs) });
    } catch (err) {
      // AbortSignal.timeout сработал — релей молчал весь таймаут. НЕ повторяем (см. шапку).
      if (err instanceof DOMException && err.name === "TimeoutError") {
        throw new RelayTimeoutError(`${opts.label}: таймаут вызова (${opts.timeoutMs} мс) — релей не ответил`);
      }
      // Сетевой сбой (соединение оборвалось/не установилось) — временный, пробуем ещё.
      lastErr = err;
      if (attempt < opts.retries) {
        await sleep(retryDelayMs(attempt));
        continue;
      }
      throw err;
    }

    // Временный 5xx/429 от перегруженного релея — повтор по свежему соединению. Тело
    // сливаем, иначе соединение остаётся висеть открытым.
    if (RETRYABLE_STATUS.has(res.status) && attempt < opts.retries) {
      await res.text().catch(() => {});
      lastErr = new Error(`${opts.label}: HTTP ${res.status}`);
      await sleep(retryDelayMs(attempt));
      continue;
    }

    return res; // успех ИЛИ не-повторяемый ответ (4xx, либо 5xx на последнем заходе) — решает вызывающий по res.ok
  }

  // Недостижимо: цикл на каждом заходе либо возвращает res, либо бросает. Для типов.
  throw lastErr ?? new Error(`${opts.label}: запрос не выполнен`);
}

// Короткая нарастающая пауза перед повтором: 300мс, 600мс, ... Повтор должен быть быстрым —
// цель погасить икоту незаметно, а не выдержать долгий backoff (это делает уже очередь).
function retryDelayMs(attempt: number): number {
  return 300 * (attempt + 1);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
