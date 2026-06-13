import { prisma } from "@/infrastructure/db/client";
import { enqueue } from "@/infrastructure/queue";
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
  const { fileBuffer, originalFilename: _originalFilename, playerId } = input;

  // Разбираем синхронно для валидации формата и получения метрик.
  // Метрики кладём в payload задачи — воркер применит их к турниру.
  const parsed = parseGGPokerMtt(fileBuffer);

  if (!parsed.ok) {
    return { ok: false, error: parsed.error.type };
  }

  const tournament = await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.create({
      data: {
        playerId,
        playedAt: new Date(),
        status: "UPLOADED",
      },
    });

    await enqueue(tx, {
      type: "PARSE_TOURNAMENT",
      payload: { tournamentId: t.id, parsed: parsed.data },
    });

    return t;
  });

  return { ok: true, tournamentId: tournament.id };
}
