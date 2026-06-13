import { prisma } from "@/infrastructure/db/client";
import { notFound } from "next/navigation";
import { getDialogueRoundsPerHand } from "@/config/dialogue";

const DEMO_PLAYER_ID = "00000000-0000-0000-0000-000000000001";

const DIALOGUE_STATE_LABEL: Record<string, string> = {
  QUESTION_ASKED: "вопрос задан",
  ANSWER_RECEIVED: "обрабатываем",
  VERDICT_SHOWN: "вердикт готов",
};

const DIALOGUE_STATE_STYLE: Record<string, React.CSSProperties> = {
  QUESTION_ASKED: { background: "#dbeafe", color: "#1d4ed8" },
  ANSWER_RECEIVED: { background: "#fef3c7", color: "#92400e" },
  VERDICT_SHOWN: { background: "#d1fae5", color: "#065f46" },
};

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id } });

  if (!tournament || tournament.deletedAt || tournament.playerId !== DEMO_PLAYER_ID) notFound();

  if (tournament.status === "UPLOADED" || tournament.status === "PARSING") {
    return (
      <main style={{ padding: "2rem", fontFamily: "monospace" }}>
        <h1>Разбираем файл...</h1>
        <p>Файл принят. Парсер считает метрики — займёт несколько секунд.</p>
        <p>
          <a href="/status">Смотреть статус →</a>
        </p>
        <p style={{ marginTop: "1rem" }}>
          <a href="/">← Загрузить ещё</a>
        </p>
      </main>
    );
  }

  if (tournament.status === "FAILED") {
    return (
      <main style={{ padding: "2rem", fontFamily: "monospace" }}>
        <h1>Ошибка разбора</h1>
        <p>Файл не удалось разобрать. Убедись, что это MTT-турнир GGPoker.</p>
        <p>
          <a href="/">← Попробовать снова</a>
        </p>
      </main>
    );
  }

  const vpip = tournament.vpipPercent ? Number(tournament.vpipPercent).toFixed(1) : "—";
  const hands = tournament.handsCount ?? "—";
  const result = tournament.resultBuyins ? Number(tournament.resultBuyins).toFixed(2) : "—";

  const handsForDialogue = await prisma.hand.findMany({
    where: { tournamentId: id, dialogue: { isNot: null } },
    include: { dialogue: { include: { rounds: true } } },
    orderBy: { createdAt: "asc" },
  });

  const totalRounds = getDialogueRoundsPerHand();

  return (
    <main style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h1>Результаты турнира</h1>
      <table style={{ borderCollapse: "collapse" }}>
        <tbody>
          <tr>
            <td style={{ paddingRight: "2rem" }}>VPIP</td>
            <td>
              <strong>{vpip}%</strong>
            </td>
          </tr>
          <tr>
            <td>Рук сыграно</td>
            <td>
              <strong>{hands}</strong>
            </td>
          </tr>
          <tr>
            <td>Итог</td>
            <td>
              <strong>{result} бай-ина</strong>
            </td>
          </tr>
        </tbody>
      </table>
      {handsForDialogue.length > 0 && (
        <>
          <h2 style={{ marginTop: "2rem" }}>Раздачи для разбора</h2>
          <table style={{ borderCollapse: "collapse", width: "100%", marginTop: "0.5rem" }}>
            <tbody>
              {handsForDialogue.map((hand) => {
                const dialogue = hand.dialogue!;
                const progress = dialogue.rounds.length;
                return (
                  <tr key={hand.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "6px 1rem 6px 0" }}>
                      <a href={`/tournament/${id}/hands/${hand.id}`}>Раздача →</a>
                    </td>
                    <td style={{ padding: "6px 1rem 6px 0" }}>
                      <span
                        style={{
                          ...(DIALOGUE_STATE_STYLE[dialogue.state] ?? { background: "#f3f4f6", color: "#111" }),
                          padding: "2px 8px",
                          borderRadius: "4px",
                          fontSize: "0.85em",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {DIALOGUE_STATE_LABEL[dialogue.state] ?? dialogue.state}
                      </span>
                    </td>
                    <td style={{ padding: "6px 0", color: "#6b7280" }}>
                      раунд {progress}/{totalRounds}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </>
      )}
      <p style={{ marginTop: "2rem" }}>
        <a href="/">← Загрузить ещё</a>
        {" · "}
        <a href="/status">Статус загрузок →</a>
      </p>
    </main>
  );
}
