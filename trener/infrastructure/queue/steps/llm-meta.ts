import type { RawTask } from "../types";
import type { LlmCallMeta } from "@/infrastructure/adapters/llm/types";
import { contentRejectionReason } from "@/infrastructure/adapters/llm/errors";

// Контекст вызова модели для шага очереди: чей запрос (учёт расходов) + за что забраковали
// прошлую попытку ЭТОЙ ЖЕ задачи (зрячий повтор, см. adapters/llm/errors.ts).
//
// `task.error` хранит ошибку предыдущей попытки: воркер пишет её перед возвратом задачи в
// PENDING, и она доживает до следующего захвата. Первая попытка — error пуст, повтор идёт как
// раньше. Сбой связи и «зависла в PROCESSING» сюда не попадают: их отсеивает
// contentRejectionReason, и в промпт уходит только брак содержания.
export function llmMeta(task: RawTask, playerId: string): LlmCallMeta {
  return { playerId, previousRejection: contentRejectionReason(task.error) ?? undefined };
}
