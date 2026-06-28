// Память тренера: поиск ПОХОЖИХ прошлых раздач игрока по отпечатку спота (Правило 1 —
// похожесть считает парсер, не LLM). Возвращает РЕАЛЬНЫЕ прошлые раздачи с меткой совпадения
// (EXACT — один в один, SIMILAR — что-то подобное), посчитанной детерминированно. Модель потом
// только проговаривает приведённое, выдумывать новые раздачи не может.

import { Prisma, type PrismaClient } from "@prisma/client";
import type { TableSnapshot } from "@/parser/types";
import type { PriorSpot } from "@/infrastructure/adapters/llm/types";
import { type SpotFingerprint, spotMatchScore } from "@/parser/spot-fingerprint";
import { heroDecisionLabel } from "@/parser/hand-summary";

// Из 6 признаков отпечатка: ≥5 совпавших — это уже «похоже»; меньше — натянуто, не показываем.
const MIN_MATCH_SCORE = 5;
const MAX_PRIOR_SPOTS = 3; // не заваливаем промпт: 2–3 самые близкие прошлые раздачи
const SCAN_LIMIT = 200; // сколько последних раздач игрока просматриваем кандидатами

type SpotCandidate = {
  fp: SpotFingerprint;
  cards: string[];
  decision: string | null;
  reasoning: string | null;
  chipResult: number;
  when: string | null;
};

// Чистый отбор: ранжируем кандидатов по числу совпавших признаков, берём топ с порогом.
// Метку EXACT/SIMILAR ставим ЗДЕСЬ (детерминированно), а не доверяем модели.
export function selectPriorSpots(
  currentFp: SpotFingerprint,
  candidates: SpotCandidate[],
): PriorSpot[] {
  return candidates
    .map((c) => ({ c, score: spotMatchScore(currentFp, c.fp) }))
    .filter((x) => x.score >= MIN_MATCH_SCORE)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_PRIOR_SPOTS)
    .map(({ c, score }) => ({
      matchLevel: score === 6 ? "EXACT" : "SIMILAR",
      cards: c.cards,
      decision: c.decision,
      reasoning: c.reasoning,
      chipResult: c.chipResult,
      when: c.when,
    }));
}

function shortDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

// Поиск похожих прошлых раздач игрока по всей его истории (кроме текущей). Берёт последние
// SCAN_LIMIT раздач с готовым отпечатком, ранжирует по похожести, возвращает топ.
export async function findPriorSimilarSpots(
  db: PrismaClient,
  params: { playerId: string; currentHandId: string; currentFp: SpotFingerprint },
): Promise<PriorSpot[]> {
  const rows = await db.hand.findMany({
    where: {
      tournament: { playerId: params.playerId, deletedAt: null },
      id: { not: params.currentHandId },
      spot: { not: Prisma.DbNull },
    },
    orderBy: { createdAt: "desc" },
    take: SCAN_LIMIT,
    select: {
      chipResult: true,
      tableData: true,
      spot: true,
      tournament: { select: { name: true, playedAt: true } },
      dialogue: {
        select: { rounds: { select: { answer: true }, orderBy: { roundNumber: "asc" } } },
      },
    },
  });

  const candidates: SpotCandidate[] = rows.map((r) => {
    const snap = r.tableData as unknown as TableSnapshot;
    const answers = (r.dialogue?.rounds ?? [])
      .map((x) => x.answer)
      .filter((a): a is string => Boolean(a));
    return {
      fp: r.spot as unknown as SpotFingerprint,
      cards: snap.heroCards ?? [],
      decision: heroDecisionLabel(snap),
      reasoning: answers.length ? answers[answers.length - 1] : null,
      chipResult: r.chipResult,
      when: r.tournament.name ?? shortDate(r.tournament.playedAt),
    };
  });

  return selectPriorSpots(params.currentFp, candidates);
}
