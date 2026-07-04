import { prisma } from "@/infrastructure/db/client";
import { getModelRate } from "@/config/llm-pricing";

// Сырой usage из ответа Anthropic (message.usage), приведённый к нашим именам.
export type LlmCallUsage = {
  inputTokens: number; // вход не из кэша (input_tokens)
  outputTokens: number; // output_tokens
  cacheWriteTokens: number; // cache_creation_input_tokens
  cacheReadTokens: number; // cache_read_input_tokens
};

const PER_M = 1_000_000;

// Себестоимость одного вызова в долларах ПО ФАКТУ (с учётом кэша).
export function costFromUsage(u: LlmCallUsage, model: string): number {
  const r = getModelRate(model);
  return (
    (u.inputTokens * r.input +
      u.outputTokens * r.output +
      u.cacheWriteTokens * r.cacheWrite +
      u.cacheReadTokens * r.cacheRead) /
    PER_M
  );
}

// Сколько стоил бы тот же вызов БЕЗ кэширования: всё, что прошло через кэш
// (запись + чтение), при отключённом кэше было бы обычным входом полной ценой.
// Разница (этот минус фактический) и есть экономия/потеря от кэша.
export function costWithoutCache(u: LlmCallUsage, model: string): number {
  const r = getModelRate(model);
  const fullInput = u.inputTokens + u.cacheWriteTokens + u.cacheReadTokens;
  return (fullInput * r.input + u.outputTokens * r.output) / PER_M;
}

// Записать строку расхода. НИКОГДА не бросает: учёт вторичен и не должен ронять
// разбор (как safeNotifyAdmin). При playerId == null строку не пишем (нечего атрибутировать).
export async function recordLlmUsage(params: {
  playerId: string;
  step: string;
  model: string;
  usage: LlmCallUsage;
  // Точная цена от провайдера (OpenRouter usage.cost) — для вызовов с нетокенной
  // тарификацией (аудио у STT). Без неё считаем по ставкам модели, как раньше.
  costUsd?: number;
}): Promise<void> {
  try {
    await prisma.llmUsage.create({
      data: {
        playerId: params.playerId,
        step: params.step,
        model: params.model,
        inputTokens: params.usage.inputTokens,
        outputTokens: params.usage.outputTokens,
        cacheWriteTokens: params.usage.cacheWriteTokens,
        cacheReadTokens: params.usage.cacheReadTokens,
        costUsd: params.costUsd ?? costFromUsage(params.usage, params.model),
      },
    });
  } catch (err) {
    console.error("[llm-usage] не удалось записать расход вызова:", err);
  }
}
