import { prisma } from "@/infrastructure/db/client";
import { notFound } from "next/navigation";

const DEMO_PLAYER_ID = "00000000-0000-0000-0000-000000000001";

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
      <p style={{ marginTop: "2rem" }}>
        <a href="/">← Загрузить ещё</a>
        {" · "}
        <a href="/status">Статус загрузок →</a>
      </p>
    </main>
  );
}
