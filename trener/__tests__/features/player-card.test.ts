/**
 * Карточка ученика (память тренера об игроке, фаза 1):
 *  - buildCardLeaks: топ системных ликов из динамики лик-трекера, числа парсера;
 *  - renderPlayerCard: блок «Твой ученик» в промпт — характеристика + лики + правила
 *    пользования; пустая карточка не рендерится;
 *  - блок попадает во все 4 роли тренера (разбор, диалог, вердикт, чат).
 * План: plans/2026-07-06-память-тренера-об-игроке.md.
 */

import { describe, it, expect } from "vitest";
import { buildCardLeaks } from "@/features/memory/player-card";
import { renderPlayerCard } from "@/config/prompts/player-card";
import { buildHandAnalysisPrompt } from "@/config/prompts/hand-analysis";
import { buildDialogueQuestionPrompt } from "@/config/prompts/dialogue-question";
import { buildVerdictPrompt } from "@/config/prompts/verdict";
import { buildChatReplyPrompt } from "@/config/prompts/chat-reply";
import type { LeakDynamics } from "@/features/profile/leak-trend";
import type { PlayerCard, TournamentContext } from "@/infrastructure/adapters/llm/types";
import type { TableSnapshot } from "@/parser/types";

const dyn = (kind: LeakDynamics["kind"], window: number[], current: number): LeakDynamics => ({
  kind,
  window,
  current,
  priorTotal: window.reduce((s, n) => s + n, 0),
  improved: current === 0,
});

describe("buildCardLeaks", () => {
  it("переводит динамику в строки карточки: суммы, дни, прогресс", () => {
    const leaks = buildCardLeaks([dyn("LIMP", [2, 0, 3], 0), dyn("OPEN_WIDE", [1, 1, 0], 2)], 3);
    expect(leaks).toHaveLength(2);
    expect(leaks[0]).toMatchObject({ priorTotal: 5, daysWithLeak: 2, windowDays: 3, improvedLastDay: true });
    expect(leaks[0].label).toContain("лимп");
    expect(leaks[1]).toMatchObject({ priorTotal: 2, daysWithLeak: 2, improvedLastDay: false });
  });

  it("режет до топ-4", () => {
    const four = [
      dyn("LIMP", [9], 1),
      dyn("OPEN_WIDE", [8], 1),
      dyn("BB_3BET_WIDE", [7], 1),
      dyn("ISO_WIDE", [6], 1),
      dyn("SQUEEZE_WIDE", [5], 1),
    ];
    expect(buildCardLeaks(four, 1)).toHaveLength(4);
  });
});

const card: PlayerCard = {
  characteristic: "Тайтовый игрок, VPIP 19%, переплачивает с дро.",
  tournamentsCounted: 12,
  leaks: [
    { label: "лимпы (вход в банк коллом вместо рейза или фолда)", priorTotal: 7, daysWithLeak: 4, windowDays: 9, improvedLastDay: false },
  ],
  notes: [{ date: "2026-06-28", text: "Договорились фолдить колл 3-бета вне позиции." }],
};

describe("renderPlayerCard", () => {
  it("рендерит характеристику, лики и правила пользования", () => {
    const block = renderPlayerCard(card);
    expect(block).toContain("ТВОЙ УЧЕНИК");
    expect(block).toContain("по 12 загруженным турнирам");
    expect(block).toContain("7 раз за 4 из 9 последних игровых дней");
    expect(block).toContain("повторяющаяся история");
    expect(block).toContain("не выдумывай числа");
  });

  it("прогресс подсвечивается, пустая карточка — пустая строка", () => {
    const improved: PlayerCard = { ...card, leaks: [{ ...card.leaks[0], improvedLastDay: true }] };
    expect(renderPlayerCard(improved)).toContain("прогресс");
    expect(renderPlayerCard(null)).toBe("");
    expect(renderPlayerCard(undefined)).toBe("");
  });
});

// Минимальный снимок стола для сборки промптов.
const snapshot: TableSnapshot = {
  handNumber: "1",
  blinds: { sb: 50, bb: 100, ante: 0 },
  heroCards: ["Ah", "Kh"],
  board: [],
  seats: [
    { label: "Hero", position: "BTN", positionName: "BTN", startingStack: 5000, shownCards: null },
    { label: "Player 2", position: "BB", positionName: "BB", startingStack: 5000, shownCards: null },
  ],
  actions: [],
} as unknown as TableSnapshot;

const tournament: TournamentContext = {
  handsCount: 100,
  vpipPercent: 20,
  resultBuyins: -1,
  styleDiagnosis: "TIGHT",
};

describe("карточка во всех 4 ролях", () => {
  it("hand-analysis / dialogue / verdict / chat включают блок при наличии карточки и не включают без неё", () => {
    const history = [{ roundNumber: 1, question: "Почему колл?", answer: "Думал, блефует" }];

    const prompts = [
      buildHandAnalysisPrompt({ locale: "ru", importanceLevel: "CRITICAL", chipResult: -1000, tableSnapshot: snapshot, tournament, playerCard: card }),
      buildDialogueQuestionPrompt({ locale: "ru", history, draftVerdict: "черновик", chipResult: -1000, tableSnapshot: snapshot, tournament, playerCard: card }),
      buildVerdictPrompt({ locale: "ru", history, draftVerdict: "черновик", chipResult: -1000, tableSnapshot: snapshot, tournament, playerCard: card }),
      buildChatReplyPrompt({ locale: "ru", history: [{ author: "PLAYER" as const, text: "а если пуш?" }], analysisSummary: "сводка", chipResult: -1000, tableSnapshot: snapshot, tournament, playerCard: card }),
    ];
    for (const p of prompts) expect(p).toContain("ТВОЙ УЧЕНИК");

    const without = buildHandAnalysisPrompt({ locale: "ru", importanceLevel: "CRITICAL", chipResult: -1000, tableSnapshot: snapshot, tournament });
    expect(without).not.toContain("ТВОЙ УЧЕНИК");
  });
});
