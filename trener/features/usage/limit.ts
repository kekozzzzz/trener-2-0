// Часовые лимиты на платные (LLM) действия игрока — защита баланса Anthropic от
// шторма вызовов. Тонкая обёртка над общим счётчиком окна features/auth/rate-limit.ts
// (он же используется лимитером входа): тот же token-bucket в памяти процесса,
// только ключ — по игроку, а не по IP/email, и пороги берутся из config/usage-limits.ts.
//
// Не "use server"-модуль: обычные функции, которые вызывают server actions точек
// входа (загрузка турнира, ответ в диалоге, чат по раздаче) до запуска платной
// работы. На клиент не попадает.

import { hitCount, recordHit, retryAfterMs } from "@/features/auth/rate-limit";
import {
  isUsageLimitEnabled,
  getUploadMaxPerHour,
  getUploadWindowMs,
  getLlmMessageMaxPerHour,
  getLlmMessageWindowMs,
  getTranscribeMaxPerHour,
  getTranscribeWindowMs,
} from "@/config/usage-limits";

export type QuotaDecision = { ok: true } | { ok: false; retryAfterMs: number };

// Чистое ядро: «есть ли ещё квота у ключа, и если да — списать одну единицу».
// Считаем только принятые запросы (проверка ДО инкремента, recordHit лишь на
// успехе) — потолок ограничивает число платных действий за окно. Принимает now
// явно, чтобы тестировать логику окна без флага среды и без подмены времени.
export function consumeQuota(
  key: string,
  max: number,
  windowMs: number,
  now: number = Date.now(),
): QuotaDecision {
  if (hitCount(key, now) >= max) {
    return { ok: false, retryAfterMs: retryAfterMs(key, now) };
  }
  recordHit(key, windowMs, now);
  return { ok: true };
}

// Квота на загрузку турниров игроком. В тестовой среде лимитер выключен (см.
// isUsageLimitEnabled) — пропускаем, чтобы сквозной счётчик не ронял чужие кейсы.
export function checkUploadQuota(playerId: string): QuotaDecision {
  if (!isUsageLimitEnabled()) return { ok: true };
  return consumeQuota(`upload:${playerId}`, getUploadMaxPerHour(), getUploadWindowMs());
}

// Квота на сообщения к LLM (ответы в диалоге + чат по раздаче — общий счётчик:
// оба пути упираются в один вызов Claude, и шторм по любому из них одинаково
// бьёт по балансу).
export function checkLlmMessageQuota(playerId: string): QuotaDecision {
  if (!isUsageLimitEnabled()) return { ok: true };
  return consumeQuota(`llm-msg:${playerId}`, getLlmMessageMaxPerHour(), getLlmMessageWindowMs());
}

// Квота на распознавание речи (надиктовки в /api/stt). Отдельный счётчик: путь не
// зовёт Claude, у него свой потолок.
export function checkTranscribeQuota(playerId: string): QuotaDecision {
  if (!isUsageLimitEnabled()) return { ok: true };
  return consumeQuota(`stt:${playerId}`, getTranscribeMaxPerHour(), getTranscribeWindowMs());
}
