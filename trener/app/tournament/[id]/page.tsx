import { prisma } from "@/infrastructure/db/client";
import { notFound } from "next/navigation";

export default async function TournamentPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const tournament = await prisma.tournament.findUnique({ where: { id } });

  if (!tournament || tournament.deletedAt) notFound();

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
      </p>
    </main>
  );
}
