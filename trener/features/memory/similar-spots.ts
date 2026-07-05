// Память тренера: поиск ПОХОЖИХ прошлых раздач игрока (Правило 1 — похожесть считает
// парсер, не LLM). Два канала, оба детерминированные:
//   1) тот же спот — отпечаток совпал на ≥5 из 6 признаков (EXACT — все 6, SIMILAR — 5);
//   2) та же ошибка — совпала метка детектора (лимп, широкое открытие, доезд и т.д.),
//      здесь порог отпечатка не нужен: совпадение ошибки содержательно само по себе.
// Модель потом только проговаривает приведённые раздачи, выдумывать новые не может.
//
// Окно поиска — последние MEMORY_SCAN_TOURNAMENTS турниров игрока (план
// 2026-07-05-память-тренера-2). Запрос двухфазный, чтобы не таскать тяжёлые снимки:
// фаза A — только id + отпечаток по всему окну, скоринг в памяти; фаза B — детали
// (снимок, диалог, вердикт, турнир) только для отобранного топа.

import { Prisma, type PrismaClient } from "@prisma/client";
import type { TableSnapshot } from "@/parser/types";
import type { PriorSpot } from "@/infrastructure/adapters/llm/types";
import { spotMatchScore } from "@/parser/spot-fingerprint";
import { heroDecisionLabel } from "@/parser/hand-summary";
import { mistakeLabel, type SpotMark, type StoredSpot } from "./spot-marks";
import {
  MEMORY_MAX_PRIOR_SPOTS,
  MEMORY_MIN_MATCH_SCORE,
  MEMORY_SCAN_HANDS_MAX,
  MEMORY_SCAN_TOURNAMENTS,
  MEMORY_VERDICT_SNIPPET,
} from "@/config/memory";

export type LightCandidate = { id: string; spot: StoredSpot };

// Итог чистого отбора: какую раздачу показать и почему. mistake — общая с текущей
// раздачей метка ошибки (если совпала), идёт в подпись даже при matchLevel EXACT.
export type SpotPick = {
  id: string;
  matchLevel: PriorSpot["matchLevel"];
  mistake: SpotMark | null;
};

// Общая метка ошибки текущей раздачи и кандидата. LUCKY_WIN сравнивается по виду:
// «снова крупно вложился, будучи позади» — одна и та же ошибка на любой улице.
function sharedMistake(current: StoredSpot, candidate: StoredSpot): SpotMark | null {
  const currentKinds = new Set((current.marks ?? []).map((m) => m.kind));
  if (currentKinds.size === 0) return null;
  return (candidate.marks ?? []).find((m) => currentKinds.has(m.kind)) ?? null;
}

// Чистый отбор: ранжируем кандидатов, берём топ. Вес: один-в-один И та же ошибка →
// сильнее всего; дальше один-в-один; та же ошибка; просто похожий спот. При равном
// весе побеждает более свежая раздача (кандидаты приходят свежие → старые).
// Метку EXACT/SAME_MISTAKE/SIMILAR ставим ЗДЕСЬ (детерминированно), не доверяем модели.
export function selectSpotPicks(current: StoredSpot, candidates: LightCandidate[]): SpotPick[] {
  const ranked: Array<SpotPick & { weight: number }> = [];

  for (const c of candidates) {
    const score = spotMatchScore(current, c.spot);
    const mistake = sharedMistake(current, c.spot);
    if (score < MEMORY_MIN_MATCH_SCORE && !mistake) continue;

    const matchLevel: PriorSpot["matchLevel"] =
      score === 6 ? "EXACT" : mistake ? "SAME_MISTAKE" : "SIMILAR";
    const weight = (score === 6 ? 4 : 0) + (mistake ? 2 : 0) + (score === MEMORY_MIN_MATCH_SCORE ? 1 : 0);
    ranked.push({ id: c.id, matchLevel, mistake, weight });
  }

  return ranked
    .sort((a, b) => b.weight - a.weight) // sort стабилен: при равном весе — порядок кандидатов (свежие выше)
    .slice(0, MEMORY_MAX_PRIOR_SPOTS)
    .map(({ id, matchLevel, mistake }) => ({ id, matchLevel, mistake }));
}

// Вердикт прошлого разбора для блока памяти: целиком он длинный, напоминаем начало,
// режем по границе слова.
export function verdictSnippet(verdict: string | null): string | null {
  if (!verdict) return null;
  const clean = verdict.trim();
  if (!clean) return null;
  if (clean.length <= MEMORY_VERDICT_SNIPPET) return clean;
  const cut = clean.slice(0, MEMORY_VERDICT_SNIPPET);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : MEMORY_VERDICT_SNIPPET)}…`;
}

function shortDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

// Поиск похожих прошлых раздач игрока по окну последних турниров (кроме текущей раздачи).
export async function findPriorSimilarSpots(
  db: PrismaClient,
  params: { playerId: string; currentHandId: string; currentFp: StoredSpot },
): Promise<PriorSpot[]> {
  const tournaments = await db.tournament.findMany({
    where: { playerId: params.playerId, deletedAt: null },
    orderBy: { playedAt: "desc" },
    take: MEMORY_SCAN_TOURNAMENTS,
    select: { id: true },
  });
  if (tournaments.length === 0) return [];

  // Фаза A: лёгкая выборка — только id и отпечаток, свежие раздачи первыми.
  const light = await db.hand.findMany({
    where: {
      tournamentId: { in: tournaments.map((t) => t.id) },
      id: { not: params.currentHandId },
      spot: { not: Prisma.DbNull },
    },
    orderBy: { createdAt: "desc" },
    take: MEMORY_SCAN_HANDS_MAX,
    select: { id: true, spot: true },
  });

  const picks = selectSpotPicks(
    params.currentFp,
    light.map((r) => ({ id: r.id, spot: r.spot as unknown as StoredSpot })),
  );
  if (picks.length === 0) return [];

  // Фаза B: детали только для отобранного топа.
  const rows = await db.hand.findMany({
    where: { id: { in: picks.map((p) => p.id) } },
    select: {
      id: true,
      chipResult: true,
      tableData: true,
      tournament: { select: { name: true, playedAt: true } },
      dialogue: {
        select: {
          verdict: true,
          rounds: { select: { answer: true }, orderBy: { roundNumber: "asc" } },
        },
      },
    },
  });
  const byId = new Map(rows.map((r) => [r.id, r]));

  return picks.flatMap((pick) => {
    const r = byId.get(pick.id);
    if (!r) return [];
    const snap = r.tableData as unknown as TableSnapshot;
    const answers = (r.dialogue?.rounds ?? [])
      .map((x) => x.answer)
      .filter((a): a is string => Boolean(a));
    // «Когда» — всегда дата (игрок должен услышать конкретное число) + имя турнира.
    const when = `${shortDate(r.tournament.playedAt)}${r.tournament.name ? `, ${r.tournament.name}` : ""}`;
    return [
      {
        matchLevel: pick.matchLevel,
        mistake: pick.mistake ? mistakeLabel(pick.mistake) : null,
        cards: snap.heroCards ?? [],
        decision: heroDecisionLabel(snap),
        reasoning: answers.length ? answers[answers.length - 1] : null,
        verdict: verdictSnippet(r.dialogue?.verdict ?? null),
        chipResult: r.chipResult,
        when,
      },
    ];
  });
}
