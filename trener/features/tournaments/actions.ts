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
  | { ok: false; error: "UNSUPPORTED_FORMAT" | "PARSE_FAILED" }
  | { ok: false; error: "DUPLICATE"; existingTournamentId: string };

export async function uploadTournament(input: UploadInput): Promise<UploadResult> {
  const { fileBuffer, originalFilename: _originalFilename, playerId } = input;

  // Разбираем синхронно для валидации формата и получения метрик.
  // Метрики кладём в payload задачи — воркер применит их к турниру.
  const parsed = parseGGPokerMtt(fileBuffer);

  if (!parsed.ok) {
    return { ok: false, error: parsed.error.type };
  }

  const { room, externalTournamentId, name, playedAt } = parsed.data;

  // Дедупликация: тот же игрок уже загрузил турнир с этим номером с той же площадки.
  // Повтор не создаём — отдаём ссылку на существующий разбор (deletedAt: null — удалённый
  // можно загрузить заново).
  const duplicate = await prisma.tournament.findFirst({
    where: { playerId, room, externalTournamentId, deletedAt: null },
    select: { id: true },
  });

  if (duplicate) {
    return { ok: false, error: "DUPLICATE", existingTournamentId: duplicate.id };
  }

  const tournament = await prisma.$transaction(async (tx) => {
    const t = await tx.tournament.create({
      data: {
        playerId,
        playedAt: new Date(playedAt), // реальная дата турнира из HH, не момент загрузки
        room,
        name,
        externalTournamentId,
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
