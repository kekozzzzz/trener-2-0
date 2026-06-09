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

  await db.tournament.update({
    where: { id: tournamentId },
    data: { status: "PARSED", handsCount, vpipPercent, resultBuyins },
  });
};
