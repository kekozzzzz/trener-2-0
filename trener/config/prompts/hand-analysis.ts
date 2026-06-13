// Промпт для GENERATE_HAND_ANALYSIS — продуктовый контент (architecture/00-правила-проекта.md,
// «Спроси разрешения» №5: изменение этого файла в продакшне требует согласия).
//
// Обязательные строки правила 1:
//  - «не вычисляй метрики самостоятельно» — числа уже посчитаны парсером;
//  - «если не уверен — сформулируй уточняющий вопрос, а не категоричный совет».

import type { HandAnalysisRequest } from "@/infrastructure/adapters/llm/types";

export const HAND_ANALYSIS_SYSTEM_PROMPT = `Ты — сократовский тренер для микролимитного MTT-игрока в покер (GGPoker).
Твоя задача — по одной раздаче объяснить игроку, что произошло, и помочь ему самому увидеть свои ошибки.

Правила:
- Все числа (результат раздачи в фишках, статистика турнира, уровень важности раздачи) уже рассчитаны парсером и переданы тебе в запросе. Не вычисляй метрики самостоятельно — используй переданные значения как есть.
- Если не уверен в своей рекомендации — не выдавай её как категоричный совет. Сформулируй её как уточняющий вопрос игроку (что за оппонент, что происходило за столом до этого) вместо готового вердикта.
- Пиши по-русски, разговорным языком. Называй действия конкретно: "олл-ин", "колл", "рейз", "чек", "фолд" — без метафор вроде "шов".
- Никнеймы уже заменены на "Hero" (это игрок, которому ты отвечаешь, обращайся к нему на "ты") и "Player N" (оппоненты).
- Ответ — ТОЛЬКО валидный JSON, без пояснений вокруг и без markdown-код-блоков.`;

function renderTableSnapshot(request: HandAnalysisRequest): string {
  const { tableSnapshot } = request;

  const seats = tableSnapshot.seats
    .map((seat) => `${seat.label} (${seat.position}, стек ${seat.startingStack})`)
    .join("; ");

  const actions = tableSnapshot.actions
    .map((a) => `${a.street} — ${a.actor}: ${a.action}${a.amount != null ? ` ${a.amount}` : ""}`)
    .join("\n");

  return [
    `Места: ${seats}`,
    `Карты Hero: ${tableSnapshot.heroCards.join(" ") || "неизвестны"}`,
    `Борд: ${tableSnapshot.board.join(" ") || "не дошло до флопа"}`,
    `Банк по итогам раздачи: ${tableSnapshot.potTotal}`,
    `Действия по улицам:\n${actions}`,
  ].join("\n");
}

function outputSchemaFor(request: HandAnalysisRequest): string {
  if (request.importanceLevel === "CRITICAL") {
    return `{
  "played": "что Hero сделал по факту, по улицам, своими словами",
  "optimal": "альтернативная линия, которая была бы как минимум не хуже",
  "question": "один сократовский вопрос игроку о его решении — без подсказки правильного ответа",
  "draftVerdict": "черновик разбора для внутреннего использования — игрок его пока не увидит, он появится после ответа на question"
}`;
  }

  if (request.importanceLevel === "STRONG") {
    return `{
  "played": "что Hero сделал по факту, по улицам, своими словами",
  "optimal": "альтернативная линия (может совпадать с played, если линия и так оптимальна)",
  "note": "короткое подтверждение — почему это было правильное решение"
}`;
  }

  return `{
  "played": "что Hero сделал по факту, по улицам, своими словами",
  "optimal": "альтернативная линия, которая была бы немного лучше",
  "note": "лёгкая заметка — что можно было сыграть чуть иначе"
}`;
}

export function buildHandAnalysisPrompt(request: HandAnalysisRequest): string {
  const { tournament, importanceLevel, chipResult } = request;

  return `Контекст турнира: ${tournament.handsCount} раздач, VPIP ${tournament.vpipPercent}%, итог ${tournament.resultBuyins} бай-инов, стиль игрока — ${tournament.styleDiagnosis}.

Раздача отмечена парсером как ${importanceLevel}, результат Hero в этой раздаче — ${chipResult} фишек.

${renderTableSnapshot(request)}

Верни JSON строго такого вида:
${outputSchemaFor(request)}`;
}
