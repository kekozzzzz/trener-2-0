import type { StepHandler } from "../types";

type ParsePayload = {
  tournamentId: string;
  handsCount: number;
  vpipPercent: number;
  resultBuyins: number;
};

export const parseTournamentStep: StepHandler = async (task, db) => {
  const { tournamentId, handsCount, vpipPercent, resultBuyins } =
    task.payload as ParsePayload;

  const { count } = await db.tournament.updateMany({
    where: { id: tournamentId, deletedAt: null },
    data: { status: "PARSED", handsCount, vpipPercent, resultBuyins },
  });

  if (count === 0) return; // soft-deleted before worker ran — skip silently
};
