/**
 * Блок «ридсы на оппонентов» в промптах диалога, вердикта и чата
 * (config/prompts/{dialogue-question,verdict,chat-reply}.ts). Раньше тип оппонента
 * видел только первичный разбор; теперь — каждый этап тренера (хвост профиля
 * оппонента, 2026-07-03).
 *
 * Гарантия: если request.opponents задан — блок «Ридсы парсера на оппонентов»
 * попадает в промпт перед снимком стола; если пуст/undefined — промпт без блока.
 */

import { describe, it, expect } from "vitest";
import type { TableSnapshot } from "@/parser/types";
import type { OpponentFact } from "@/parser/opponent-profile";
import type {
  NextQuestionRequest,
  VerdictRequest,
  ChatReplyRequest,
} from "@/infrastructure/adapters/llm/types";
import { buildDialogueQuestionPrompt } from "@/config/prompts/dialogue-question";
import { buildVerdictPrompt } from "@/config/prompts/verdict";
import { buildChatReplyPrompt } from "@/config/prompts/chat-reply";

const FISH: OpponentFact = {
  seatLabel: "Player 3",
  type: "FISH",
  confidence: "tentative",
  vpip: 42.9,
  pfr: 7.1,
  handsObserved: 14,
};

const snapshot: TableSnapshot = {
  seats: [
    { label: "Hero", position: "BTN", startingStack: 4000 },
    { label: "Player 3", position: "BB", startingStack: 4000 },
  ],
  actions: [
    { street: "PREFLOP", actor: "Player 3", action: "POST_BB", amount: 100 },
    { street: "PREFLOP", actor: "Hero", action: "RAISE", amount: 250 },
  ],
  heroCards: ["Ac", "Kc"],
  board: [],
  potTotal: 350,
};

const tournament = { handsCount: 80, vpipPercent: 24, resultBuyins: -1, styleDiagnosis: "PASSIVE" as const };

const dialogueReq: NextQuestionRequest = {
  locale: "ru",
  history: [{ roundNumber: 1, question: "почему заколлировал?", answer: "думал слабее" }],
  draftVerdict: "колл тонковат",
  chipResult: -1200,
  tableSnapshot: snapshot,
  tournament,
  opponents: [FISH],
};

const verdictReq: VerdictRequest = {
  locale: "ru",
  history: [{ roundNumber: 1, question: "почему заколлировал?", answer: "думал слабее" }],
  draftVerdict: "колл тонковат",
  chipResult: -1200,
  tableSnapshot: snapshot,
  tournament,
  opponents: [FISH],
};

const chatReq: ChatReplyRequest = {
  locale: "ru",
  history: [{ author: "PLAYER", text: "а он вообще какой?" }],
  analysisSummary: "ты заколлировал ривер",
  chipResult: -1200,
  tableSnapshot: snapshot,
  tournament,
  opponents: [FISH],
};

const CASES: { name: string; build: (withOpp: boolean) => string }[] = [
  { name: "диалог", build: (o) => buildDialogueQuestionPrompt({ ...dialogueReq, opponents: o ? [FISH] : undefined }) },
  { name: "вердикт", build: (o) => buildVerdictPrompt({ ...verdictReq, opponents: o ? [FISH] : undefined }) },
  { name: "чат", build: (o) => buildChatReplyPrompt({ ...chatReq, opponents: o ? [FISH] : undefined }) },
];

describe.each(CASES)("блок оппонентов в промпте: $name", ({ build }) => {
  it("с оппонентами — блок ридсов перед снимком стола", () => {
    const prompt = build(true);
    const blockAt = prompt.indexOf("Ридсы парсера на оппонентов");
    const snapshotAt = prompt.indexOf("Размер стола:");
    expect(blockAt).toBeGreaterThan(-1);
    expect(snapshotAt).toBeGreaterThan(blockAt);
    // Тип оппонента подаётся ПОВЕДЕНИЕМ, а не ярлыком (дожим языка 2026-07-15, коммит ad6d41d):
    // «рыба» → «входит в банки широко, коллирует…». Тест обновлён под текущий формат.
    expect(prompt).toContain("Player 3: предположительно входит в банки широко");
  });

  it("без оппонентов — промпт без блока ридсов", () => {
    const prompt = build(false);
    expect(prompt).not.toContain("Ридсы парсера");
    expect(prompt).toContain("Размер стола:");
  });
});
