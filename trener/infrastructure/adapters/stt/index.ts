import { getDashscopeApiKey, getOpenrouterApiKey } from "@/config/stt";
import { fakeSttAdapter } from "./fake";
import { openrouterSttAdapter } from "./openrouter";
import { qwenSttAdapter } from "./qwen";
import type { SttPort } from "./types";

// Выбор движка по доступному ключу:
//  1) OpenRouter (боевой путь, через КЗ-релей) — если задан OPENROUTER_API_KEY;
//  2) DashScope напрямую (запасной) — если задан DASHSCOPE_API_KEY;
//  3) иначе фейк (дев без ключей и тесты).
export function getSttAdapter(): SttPort {
  if (getOpenrouterApiKey()) return openrouterSttAdapter;
  if (getDashscopeApiKey()) return qwenSttAdapter;
  return fakeSttAdapter;
}

export type { SttPort, TranscribeRequest, TranscribeResult } from "./types";
