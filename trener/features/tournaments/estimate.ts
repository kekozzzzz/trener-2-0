import type { PrismaClient } from "@prisma/client";

// Оценка «примерно сколько займёт разбор турнира» ДО того, как появится живая скорость.
// Правило 1 — числа не выдумываем: берём РЕАЛЬНОЕ среднее время работы недавних разборов.
// Время работы = done_at − updated_at (updated_at ставится при захвате задачи воркером),
// то есть чистая обработка, без ожидания в очереди. handSeconds — на одну раздачу,
// summarySeconds — на сборку общей картины. null, если данных ещё нет (свежая система) —
// тогда UI просто не показывает оценку (лучше молчать, чем соврать).
export type AnalysisTiming = { handSeconds: number | null; summarySeconds: number | null };

export async function getAnalysisTimingSec(db: Pick<PrismaClient, "$queryRaw">): Promise<AnalysisTiming> {
  const rows = await db.$queryRaw<Array<{ type: string; avg_sec: number | null }>>`
    SELECT type, AVG(EXTRACT(EPOCH FROM (done_at - updated_at))) AS avg_sec
    FROM tasks
    WHERE type IN ('GENERATE_HAND_ANALYSIS', 'GENERATE_TOURNAMENT_SUMMARY')
      AND status = 'DONE' AND done_at IS NOT NULL
      AND done_at >= NOW() - INTERVAL '14 days'
    GROUP BY type
  `;
  const pick = (t: string): number | null => {
    const raw = rows.find((r) => r.type === t)?.avg_sec;
    const n = raw == null ? null : Number(raw);
    return n != null && Number.isFinite(n) && n > 0 ? n : null;
  };
  return {
    handSeconds: pick("GENERATE_HAND_ANALYSIS"),
    summarySeconds: pick("GENERATE_TOURNAMENT_SUMMARY"),
  };
}
