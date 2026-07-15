/**
 * Приёмочный тест вертикального среза.
 * Сценарий:
 *   1. uploadTournament сохраняет турнир в статусе UPLOADED и ставит задачу в очередь.
 *   2. runWorkerOnce обрабатывает задачу PARSE_TOURNAMENT — турнир переходит в PARSED с метриками.
 *
 * Бьёт в реальную тестовую базу (trener_test).
 * beforeEach чистит tournaments и tasks тестового игрока.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import fs from "fs";
import path from "path";
import { uploadTournament, uploadTournamentsBatch } from "@/features/tournaments/actions";
import { submitAnswer } from "@/features/dialogue/actions";
import { runWorkerOnce } from "@/infrastructure/queue";

const TEST_PLAYER_ID = "aaaaaaaa-0000-0000-0000-000000000001";

const prisma = new PrismaClient({
  datasources: { db: { url: "postgresql://postgres:postgres@localhost:5432/trener_test" } },
});

const fixtureBuffer = fs.readFileSync(
  path.join(__dirname, "../fixtures/sample_mtt.txt")
);

const richBuffer = fs.readFileSync(
  path.join(__dirname, "../fixtures/ggpoker_mtt_rich.txt")
);

beforeAll(async () => {
  await prisma.player.upsert({
    where: { id: TEST_PLAYER_ID },
    update: {},
    create: { id: TEST_PLAYER_ID, email: "test@trener.local" },
  });
});

beforeEach(async () => {
  await prisma.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await prisma.task.deleteMany({ where: { type: { in: ["PARSE_TOURNAMENT", "GENERATE_HAND_ANALYSIS", "GENERATE_VERDICT", "GENERATE_DIALOGUE_QUESTION"] } } });
});

afterAll(async () => {
  await prisma.tournament.deleteMany({ where: { playerId: TEST_PLAYER_ID } });
  await prisma.task.deleteMany({ where: { type: { in: ["PARSE_TOURNAMENT", "GENERATE_HAND_ANALYSIS", "GENERATE_VERDICT", "GENERATE_DIALOGUE_QUESTION"] } } });
  await prisma.player.delete({ where: { id: TEST_PLAYER_ID } }).catch(() => {});
  await prisma.$disconnect();
});

describe("uploadTournament — главный путь", () => {
  it("создаёт турнир UPLOADED, воркер переводит в PARSED с тремя метриками", async () => {
    const result = await uploadTournament({
      fileBuffer: fixtureBuffer,
      originalFilename: "sample_mtt.txt",
      playerId: TEST_PLAYER_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // После загрузки — UPLOADED, метрик ещё нет
    const before = await prisma.tournament.findUnique({ where: { id: result.tournamentId } });
    expect(before!.status).toBe("UPLOADED");
    expect(before!.handsCount).toBeNull();

    // Воркер обрабатывает задачу PARSE_TOURNAMENT
    const { tasksProcessed } = await runWorkerOnce(prisma);
    expect(tasksProcessed).toBe(1);

    // Теперь PARSED с тремя метриками
    const after = await prisma.tournament.findUnique({ where: { id: result.tournamentId } });
    expect(after!.status).toBe("PARSED");
    expect(after!.handsCount).toBeGreaterThan(0);
    expect(after!.vpipPercent).not.toBeNull();
    expect(after!.resultBuyins).not.toBeNull();
  });

  it("считает ровно 3 раздачи для трёхручного файла", async () => {
    const result = await uploadTournament({
      fileBuffer: fixtureBuffer,
      originalFilename: "sample_mtt.txt",
      playerId: TEST_PLAYER_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await runWorkerOnce(prisma);

    const tournament = await prisma.tournament.findUnique({ where: { id: result.tournamentId } });
    expect(tournament!.handsCount).toBe(3);
  });

  it("возвращает ошибку для неподдерживаемого формата", async () => {
    const badBuffer = Buffer.from("PokerStars Hand #12345: Hold'em No Limit");

    const result = await uploadTournament({
      fileBuffer: badBuffer,
      originalFilename: "pokerstars.txt",
      playerId: TEST_PLAYER_ID,
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe("UNSUPPORTED_FORMAT");
  });
});

describe("uploadTournamentsBatch — пакетная загрузка", () => {
  it("создаёт по турниру на файл; воркер доводит оба до PARSED", async () => {
    const summary = await uploadTournamentsBatch(
      [
        { fileBuffer: fixtureBuffer, originalFilename: "sample_mtt.txt" },
        { fileBuffer: richBuffer, originalFilename: "ggpoker_mtt_rich.txt" },
      ],
      TEST_PLAYER_ID,
    );

    expect(summary.uploaded).toBe(2);
    expect(summary.duplicates).toBe(0);
    expect(summary.failed).toBe(0);
    // singleResult заполняется только для пачки из одного файла
    expect(summary.singleResult).toBeNull();

    const created = await prisma.tournament.findMany({ where: { playerId: TEST_PLAYER_ID } });
    expect(created).toHaveLength(2);
    expect(created.every((t) => t.status === "UPLOADED")).toBe(true);

    for (let i = 0; i < 20; i++) {
      const { tasksProcessed } = await runWorkerOnce(prisma);
      if (tasksProcessed === 0) break;
    }

    const parsed = await prisma.tournament.findMany({ where: { playerId: TEST_PLAYER_ID } });
    expect(parsed.every((t) => t.handsCount != null && t.handsCount > 0)).toBe(true);
  });

  it("дубль внутри пачки не создаёт второй турнир и попадает в счётчик", async () => {
    const summary = await uploadTournamentsBatch(
      [
        { fileBuffer: fixtureBuffer, originalFilename: "a.txt" },
        { fileBuffer: fixtureBuffer, originalFilename: "a-копия.txt" },
      ],
      TEST_PLAYER_ID,
    );

    expect(summary.uploaded).toBe(1);
    expect(summary.duplicates).toBe(1);

    const created = await prisma.tournament.findMany({ where: { playerId: TEST_PLAYER_ID } });
    expect(created).toHaveLength(1);
  });

  it("не-MTT файл в пачке считается ошибкой, остальные грузятся", async () => {
    const summary = await uploadTournamentsBatch(
      [
        { fileBuffer: Buffer.from("PokerStars Hand #1: Hold'em"), originalFilename: "bad.txt" },
        { fileBuffer: fixtureBuffer, originalFilename: "good.txt" },
      ],
      TEST_PLAYER_ID,
    );

    expect(summary.uploaded).toBe(1);
    expect(summary.failed).toBe(1);
  });
});

describe("карточка после полного цикла — PARSE_TOURNAMENT → GENERATE_HAND_ANALYSIS → CARD_READY", () => {
  it("сохраняет все размеченные раздачи, отмечает карточку и переводит турнир в CARD_READY", async () => {
    const result = await uploadTournament({
      fileBuffer: richBuffer,
      originalFilename: "ggpoker_mtt_rich.txt",
      playerId: TEST_PLAYER_ID,
    });

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Гоняем воркер, пока очередь не опустеет: PARSE_TOURNAMENT + 6x GENERATE_HAND_ANALYSIS
    for (let i = 0; i < 10; i++) {
      const { tasksProcessed } = await runWorkerOnce(prisma);
      if (tasksProcessed === 0) break;
    }

    const tournament = await prisma.tournament.findUnique({ where: { id: result.tournamentId } });
    expect(tournament!.status).toBe("CARD_READY");
    expect(tournament!.handsCount).toBe(6);

    const hands = await prisma.hand.findMany({ where: { tournamentId: result.tournamentId } });
    expect(hands).toHaveLength(6);
    // Фикс отбора 2026-07-14: в карточку идут только СПОРНЫЕ раздачи (CRITICAL/STRONG), тривиальные —
    // нет. Разбор (analysis) генерится ровно для отобранных, у остальных остаётся null.
    const selected = hands.filter((h) => h.selectedForCard);
    expect(selected.length).toBeGreaterThanOrEqual(2); // минимум 2 CRITICAL (см. ниже)
    expect(selected.every((h) => h.analysis !== null)).toBe(true);
    expect(hands.filter((h) => !h.selectedForCard).every((h) => h.analysis === null)).toBe(true);

    // 2 раздачи CRITICAL в фикстуре ggpoker_mtt_rich.txt — каждой соответствует Dialogue
    const dialogues = await prisma.dialogue.findMany({
      where: { hand: { tournamentId: result.tournamentId } },
    });
    expect(dialogues).toHaveLength(2);
    expect(dialogues.every((d) => d.state === "QUESTION_ASKED")).toBe(true);
    expect(dialogues.every((d) => d.verdict === null)).toBe(true);

    // Игрок отвечает на вопрос по первому диалогу — submitAnswer ставит GENERATE_VERDICT
    const [answered, untouched] = dialogues;
    const submitResult = await submitAnswer({ handId: answered.handId, answer: "Думал, что у меня сильная рука." });
    expect(submitResult).toEqual({ ok: true, state: "ANSWER_RECEIVED" });

    for (let i = 0; i < 10; i++) {
      const { tasksProcessed } = await runWorkerOnce(prisma);
      if (tasksProcessed === 0) break;
    }

    const answeredAfter = await prisma.dialogue.findUnique({ where: { handId: answered.handId } });
    expect(answeredAfter!.state).toBe("VERDICT_SHOWN");
    expect(answeredAfter!.verdict).toBeTruthy();

    // Второй диалог не трогали — остаётся в QUESTION_ASKED без вердикта
    const untouchedAfter = await prisma.dialogue.findUnique({ where: { handId: untouched.handId } });
    expect(untouchedAfter!.state).toBe("QUESTION_ASKED");
    expect(untouchedAfter!.verdict).toBeNull();
  });
});

describe("многораундовый диалог — N раундов до вердикта", () => {
  it("каждый ответ < N открывает новый раунд, вердикт появляется только после ответа на раунд N", async () => {
    const original = process.env.DIALOGUE_ROUNDS_PER_HAND;
    process.env.DIALOGUE_ROUNDS_PER_HAND = "3";

    try {
      const result = await uploadTournament({
        fileBuffer: richBuffer,
        originalFilename: "ggpoker_mtt_rich.txt",
        playerId: TEST_PLAYER_ID,
      });

      expect(result.ok).toBe(true);
      if (!result.ok) return;

      for (let i = 0; i < 10; i++) {
        const { tasksProcessed } = await runWorkerOnce(prisma);
        if (tasksProcessed === 0) break;
      }

      const dialogues = await prisma.dialogue.findMany({
        where: { hand: { tournamentId: result.tournamentId } },
        include: { rounds: true },
      });
      expect(dialogues).toHaveLength(2);

      const [target] = dialogues;
      expect(target.rounds).toHaveLength(1);
      expect(target.state).toBe("QUESTION_ASKED");

      for (let round = 1; round <= 3; round++) {
        const submitResult = await submitAnswer({
          handId: target.handId,
          answer: `Раунд ${round}: думал, что это правильное решение.`,
        });
        expect(submitResult).toEqual({ ok: true, state: "ANSWER_RECEIVED" });

        for (let i = 0; i < 10; i++) {
          const { tasksProcessed } = await runWorkerOnce(prisma);
          if (tasksProcessed === 0) break;
        }

        const dialogue = await prisma.dialogue.findUnique({
          where: { handId: target.handId },
          include: { rounds: { orderBy: { roundNumber: "asc" } } },
        });

        if (round < 3) {
          // Ещё не последний раунд — открыт следующий вопрос, вердикта нет
          expect(dialogue!.state).toBe("QUESTION_ASKED");
          expect(dialogue!.verdict).toBeNull();
          expect(dialogue!.rounds).toHaveLength(round + 1);
          expect(dialogue!.rounds[round].answer).toBeNull();
        } else {
          // Ответ на последний раунд — вердикт сформирован
          expect(dialogue!.state).toBe("VERDICT_SHOWN");
          expect(dialogue!.verdict).toBeTruthy();
          expect(dialogue!.rounds).toHaveLength(3);
          expect(dialogue!.rounds[2].answer).toBeTruthy();
        }
      }
    } finally {
      process.env.DIALOGUE_ROUNDS_PER_HAND = original;
    }
  });
});
