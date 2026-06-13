import { prisma } from "@/infrastructure/db/client";
import { notFound } from "next/navigation";
import { getDialogue } from "@/features/dialogue/queries";
import { AnswerForm } from "./answer-form";
import { WaitClient } from "./wait-client";

const DEMO_PLAYER_ID = "00000000-0000-0000-0000-000000000001";

export default async function HandDialoguePage({
  params,
}: {
  params: Promise<{ id: string; handId: string }>;
}) {
  const { id, handId } = await params;

  const hand = await prisma.hand.findUnique({
    where: { id: handId },
    include: { tournament: true },
  });

  if (
    !hand ||
    hand.tournamentId !== id ||
    hand.tournament.playerId !== DEMO_PLAYER_ID ||
    hand.tournament.deletedAt
  ) {
    notFound();
  }

  const dialogue = await getDialogue(handId);
  if (!dialogue) notFound();

  const openRound = dialogue.state === "QUESTION_ASKED" ? dialogue.rounds[dialogue.rounds.length - 1] : null;
  const historyRounds = openRound ? dialogue.rounds.slice(0, -1) : dialogue.rounds;

  return (
    <main style={{ padding: "2rem", fontFamily: "monospace", maxWidth: "800px" }}>
      <h1>Разбор раздачи</h1>

      <section style={{ marginTop: "1rem" }}>
        {dialogue.hand.played && <p>{dialogue.hand.played}</p>}
        <p>
          Итог: <strong>{dialogue.hand.chipResult >= 0 ? "+" : ""}{dialogue.hand.chipResult} фишек</strong>
        </p>
      </section>

      {historyRounds.length > 0 && (
        <section style={{ marginTop: "1.5rem" }}>
          <h2>История</h2>
          {historyRounds.map((round) => (
            <div key={round.roundNumber} style={{ marginBottom: "1rem" }}>
              <p>
                <strong>Вопрос {round.roundNumber}:</strong> {round.question}
              </p>
              <p style={{ color: "#374151" }}>{round.answer}</p>
            </div>
          ))}
        </section>
      )}

      <section style={{ marginTop: "1.5rem" }}>
        {dialogue.state === "QUESTION_ASKED" && openRound && (
          <>
            <p>
              <strong>Вопрос {openRound.roundNumber}:</strong> {openRound.question}
            </p>
            <AnswerForm tournamentId={id} handId={handId} />
          </>
        )}

        {dialogue.state === "ANSWER_RECEIVED" && <WaitClient handId={handId} />}

        {dialogue.state === "VERDICT_SHOWN" && (
          <>
            <h2>Вердикт</h2>
            <p>{dialogue.verdict}</p>
          </>
        )}
      </section>

      <p style={{ marginTop: "2rem" }}>
        <a href={`/tournament/${id}`}>← К турниру</a>
      </p>
    </main>
  );
}
