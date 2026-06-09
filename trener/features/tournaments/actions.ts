import { prisma } from "@/infrastructure/db/client";
import { parseGGPokerMtt } from "@/parser/ggpoker";

type UploadInput = {
  fileBuffer: Buffer;
  originalFilename: string;
  playerId: string;
};

type UploadResult =
  | { ok: true; tournamentId: string }
  | { ok: false; error: "UNSUPPORTED_FORMAT" | "PARSE_FAILED" };

export async function uploadTournament(input: UploadInput): Promise<UploadResult> {
  const { fileBuffer, originalFilename, playerId } = input;

  const parsed = parseGGPokerMtt(fileBuffer);

  if (!parsed.ok) {
    return { ok: false, error: parsed.error.type };
  }

  const { handsCount, vpipPercent, resultBuyins } = parsed.data;

  const tournament = await prisma.tournament.create({
    data: {
      playerId,
      playedAt: new Date(),
      handsCount,
      vpipPercent,
      resultBuyins,
      status: "PARSED",
    },
  });

  return { ok: true, tournamentId: tournament.id };
}
