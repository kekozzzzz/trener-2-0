// Seed — минимальные данные для вертикального среза первого вечера.
// Срез: загрузка файла → три метрики в БД → числа обратно.
//
// Идемпотентный: повторный запуск не создаёт дублей (upsert по фиксированным email/id).

import { PrismaClient, TournamentStatus, PlayerStyle, HandImportance, DialogueState, MessageAuthor } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Дев-логин для seed-игрока: demo@trener.local / demo12345
const SEED_PASSWORD_HASH = bcrypt.hashSync("demo12345", 10);

// Фиксированные UUID для идемпотентности — никогда не менять между запусками
const SEED_PLAYER_ID       = "00000000-0000-0000-0000-000000000001";
const SEED_TOURNAMENT_ID   = "00000000-0000-0000-0000-000000000010";
const SEED_HH_FILE_ID      = "00000000-0000-0000-0000-000000000011";
const SEED_HAND_CRITICAL_ID = "00000000-0000-0000-0000-000000000020";
const SEED_HAND_STRONG_ID   = "00000000-0000-0000-0000-000000000021";
const SEED_HAND_MEDIUM_ID   = "00000000-0000-0000-0000-000000000022";
const SEED_DIALOGUE_ID      = "00000000-0000-0000-0000-000000000030";

async function main() {
  console.log("Seed: старт...");

  // ── 1. Игрок ─────────────────────────────────────────────────────────────────
  const player = await prisma.player.upsert({
    where: { id: SEED_PLAYER_ID },
    update: {},
    create: {
      id: SEED_PLAYER_ID,
      email: "demo@trener.local",
      passwordHash: SEED_PASSWORD_HASH,
      termsAcceptedAt: new Date("2026-06-08T18:00:00Z"),
    },
  });
  console.log(`  Игрок: ${player.email}`);

  // ── 2. Профиль игрока ─────────────────────────────────────────────────────────
  const profile = await prisma.playerProfile.upsert({
    where: { playerId: SEED_PLAYER_ID },
    update: {},
    create: {
      playerId: SEED_PLAYER_ID,
      avgVpip: 27.4,          // средний VPIP по истории
      avgResultBuyins: -0.35, // средний результат в бай-инах (минус = в минусе на дистанции)
      avgHandsCount: 78,      // среднее количество рук в турнире
      tournamentsCounted: 12, // по 12 турнирам посчитано — достаточно для личного среднего
      recalculatedAt: new Date("2026-06-08T20:00:00Z"),
    },
  });
  console.log(`  Профиль: VPIP avg=${profile.avgVpip}%, по ${profile.tournamentsCounted} турнирам`);

  // ── 3. Турнир — главный агрегат ───────────────────────────────────────────────
  // Статус CARD_READY: парсер уже посчитал метрики, карточка готова.
  // Именно эти три числа и есть «вертикальный срез»: VPIP, рук, результат.
  const tournament = await prisma.tournament.upsert({
    where: { id: SEED_TOURNAMENT_ID },
    update: {},
    create: {
      id: SEED_TOURNAMENT_ID,
      playerId: SEED_PLAYER_ID,
      playedAt: new Date("2026-06-08T18:30:00Z"),
      vpipPercent: 28.6,    // посчитал парсер: Hero входил в 24 из 84 рук
      handsCount: 84,       // парсер посчитал 84 раздачи в файле
      resultBuyins: -1.5,   // итог турнира: минус 1.5 бай-ина
      styleDiagnosis: PlayerStyle.LOOSE,
      status: TournamentStatus.CARD_READY,
    },
  });
  console.log(
    `  Турнир: VPIP=${tournament.vpipPercent}%, рук=${tournament.handsCount}, результат=${tournament.resultBuyins} BI`
  );

  // ── 4. Ссылка на HH-файл (файл условно лежит локально) ───────────────────────
  await prisma.hhFile.upsert({
    where: { id: SEED_HH_FILE_ID },
    update: {},
    create: {
      id: SEED_HH_FILE_ID,
      tournamentId: SEED_TOURNAMENT_ID,
      storageKey: "local/uploads/demo_2026-06-08.txt",
      originalFilename: "GGPoker_Tournament_2026-06-08.txt",
      sizeBytes: 48320,
    },
  });
  console.log("  HH-файл: записан");

  // ── 5. Раздачи — три уровня важности ─────────────────────────────────────────
  // Данные обезличены: никаких никнеймов, только Hero/Villain/Player N (правило 5, правило 1).

  const criticalHand = await prisma.hand.upsert({
    where: { id: SEED_HAND_CRITICAL_ID },
    update: {},
    create: {
      id: SEED_HAND_CRITICAL_ID,
      tournamentId: SEED_TOURNAMENT_ID,
      importanceLevel: HandImportance.CRITICAL,
      chipResult: -3200, // потеря 3200 фишек — парсер отобрал как критическую
      tableData: {
        handNumber: "RC-GGPoker-20260608-184512",
        street: "RIVER",
        position: "BTN",
        heroCards: ["Ah", "Kd"],
        board: ["Qh", "Jc", "Th", "2s", "7d"],
        actions: [
          { player: "Hero",   street: "PREFLOP", action: "raise", amount: 400 },
          { player: "Villain", street: "PREFLOP", action: "call",  amount: 400 },
          { player: "Hero",   street: "FLOP",    action: "bet",   amount: 600 },
          { player: "Villain", street: "FLOP",   action: "call",  amount: 600 },
          { player: "Hero",   street: "TURN",    action: "bet",   amount: 1200 },
          { player: "Villain", street: "TURN",   action: "call",  amount: 1200 },
          { player: "Hero",   street: "RIVER",   action: "allin", amount: 3200 },
          { player: "Villain", street: "RIVER",  action: "call",  amount: 3200 }
        ],
        potBeforeRiver: 4400,
        effectiveStack: 3200,
        spr: 0.73,
        potOddsVillain: 0.42
      },
      analysis: {
        heroAction: "Олл-ин на ривере за 3200 в пот 4400 (SPR 0.73). Стрит собран на борде (Q-J-T).",
        optimalLine:
          "На ривере с нулевым блефовым диапазоном у Villain и заряженным бордом лучше check-call: защищаемся от возможного стрита у оппонента, не раздуваем пот в ситуации, когда нас побивают многие руки оппонента.",
        keyMistake: "Ставка олл-ин на ривере с незащищённым диапазоном при SPR < 1 — слишком высокий риск.",
        metricsUsed: { chipResult: -3200, spr: 0.73, potOddsVillain: 0.42 }
      },
    },
  });

  const strongHand = await prisma.hand.upsert({
    where: { id: SEED_HAND_STRONG_ID },
    update: {},
    create: {
      id: SEED_HAND_STRONG_ID,
      tournamentId: SEED_TOURNAMENT_ID,
      importanceLevel: HandImportance.STRONG,
      chipResult: -1100,
      tableData: {
        handNumber: "RC-GGPoker-20260608-192034",
        street: "TURN",
        position: "SB",
        heroCards: ["9s", "9h"],
        board: ["Ks", "Qd", "7c", "Ad"],
        actions: [
          { player: "Hero",    street: "PREFLOP", action: "call", amount: 200 },
          { player: "Villain", street: "PREFLOP", action: "raise", amount: 600 },
          { player: "Hero",    street: "PREFLOP", action: "call",  amount: 400 },
          { player: "Hero",    street: "FLOP",    action: "check" },
          { player: "Villain", street: "FLOP",    action: "bet",  amount: 700 },
          { player: "Hero",    street: "FLOP",    action: "call", amount: 700 },
          { player: "Hero",    street: "TURN",    action: "check" },
          { player: "Villain", street: "TURN",    action: "bet",  amount: 1100 },
          { player: "Hero",    street: "TURN",    action: "call", amount: 1100 }
        ],
        potBeforeRiver: 4600,
        effectiveStack: 5200,
        spr: 1.13,
        potOddsHero: 0.32
      },
      analysis: {
        heroAction: "Колл 1100 на тёрне с карманными девятками на борде K-Q-7-A.",
        optimalLine:
          "Фолд тёрн: борд пробивает диапазон рейза оппонента с BB, четыре оверкарты к девяткам, никаких аутов на улучшение. Колл отдаёт деньги против сильного диапазона без шансов.",
        keyMistake: "Защита руки ниже флопа против продолжения на двух стрит-картах.",
        metricsUsed: { chipResult: -1100, potOddsHero: 0.32 }
      },
    },
  });

  const mediumHand = await prisma.hand.upsert({
    where: { id: SEED_HAND_MEDIUM_ID },
    update: {},
    create: {
      id: SEED_HAND_MEDIUM_ID,
      tournamentId: SEED_TOURNAMENT_ID,
      importanceLevel: HandImportance.MEDIUM,
      chipResult: -400,
      tableData: {
        handNumber: "RC-GGPoker-20260608-195801",
        street: "FLOP",
        position: "CO",
        heroCards: ["Jd", "Tc"],
        board: ["8h", "6s", "2d"],
        actions: [
          { player: "Hero",    street: "PREFLOP", action: "raise", amount: 300 },
          { player: "Villain", street: "PREFLOP", action: "call",  amount: 300 },
          { player: "Hero",    street: "FLOP",    action: "bet",   amount: 400 },
          { player: "Villain", street: "FLOP",    action: "fold" }
        ],
        potBeforeFlop: 750,
        effectiveStack: 8500
      },
      analysis: {
        heroAction: "Ставка 400 в пот 750 с J-T на сухом борде 8-6-2 и фолд оппонента.",
        optimalLine: "Правильное решение: продолжение на сухом борде с J-T даёт коллекции хорошие аутсайды (стрит-дро) и позволяет легко продолжить игру при улучшении.",
        keyMistake: null,
        metricsUsed: { chipResult: -400 }
      },
    },
  });

  console.log(
    `  Раздачи: CRITICAL (${criticalHand.chipResult} фишек), STRONG (${strongHand.chipResult}), MEDIUM (${mediumHand.chipResult})`
  );

  // ── 6. Диалог по критической раздаче — состояние QUESTION_ASKED ───────────────
  // Это ядро продукта: вопрос задан, ответ ждём — вердикт ещё не показан.
  // state = QUESTION_ASKED физически запрещает показать вердикт раньше ответа (правило 2).
  await prisma.dialogue.upsert({
    where: { id: SEED_DIALOGUE_ID },
    update: {},
    create: {
      id: SEED_DIALOGUE_ID,
      handId: SEED_HAND_CRITICAL_ID,
      verdict: null,  // покажем только после последнего раунда — state-машина это гарантирует
      state: DialogueState.QUESTION_ASKED,
      rounds: {
        create: {
          roundNumber: 1,
          question:
            "Ты пошёл олл-ин на ривере при SPR 0.73 и борде с потенциальным стритом. " +
            "Что именно ты думал о диапазоне оппонента в этот момент — " +
            "какие руки ты ждал у него на колле?",
          answer: null, // ждём ответа игрока
        },
      },
    },
  });
  console.log("  Диалог: вопрос раунда 1 задан, ждём ответа игрока");

  console.log("\nSeed завершён. Данные в БД:");
  console.log("  players:        1");
  console.log("  player_profiles: 1");
  console.log("  tournaments:    1  (статус CARD_READY)");
  console.log("  hh_files:       1");
  console.log("  hands:          3  (CRITICAL + STRONG + MEDIUM)");
  console.log("  dialogues:      1  (состояние QUESTION_ASKED)");
}

main()
  .catch((e) => {
    console.error("Seed провалился:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
