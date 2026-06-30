// ВРЕМЕННАЯ страница для покерной приёмки: строит «Твои чарты» на РЕАЛЬНЫХ файлах из
// папке Test/ (живая GG-сессия Артёма), в обход входа и базы — читаем файлы с диска,
// гоним тем же парсером, что и боевой разбор, и тем же агрегатором. УДАЛИТЬ после показа.
import fs from "fs";
import path from "path";
import { noindex } from "@/lib/seo";
import { parseHandHistory } from "@/parser";
import { aggregateOpenChart } from "@/features/profile/open-chart";
import { OpenChartPanel } from "@/components/profile/open-chart-panel";

export const metadata = noindex;
export const dynamic = "force-dynamic";

export default function ChartRealPage() {
  const dir = path.join(process.cwd(), "..", "Test");
  const files = fs.existsSync(dir)
    ? fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith(".txt"))
    : [];

  const hands: { tableData: unknown }[] = [];
  const log: string[] = [];
  let counted = 0;

  for (const f of files) {
    const buf = fs.readFileSync(path.join(dir, f));
    const res = parseHandHistory(buf);
    if (res.ok) {
      counted += 1;
      for (const h of res.data.hands) hands.push({ tableData: h.tableSnapshot });
      log.push(`${f.slice(0, 32)}… — ${res.data.hands.length} раздач`);
    } else {
      log.push(`${f.slice(0, 32)}… — не распознан (${res.error.type})`);
    }
  }

  const chart = aggregateOpenChart(hands);

  return (
    <main className="mx-auto max-w-5xl px-8 py-16">
      <h1 className="text-h1">Твои чарты — на реальном файле</h1>
      <ul className="mt-4 space-y-1 font-mono text-small text-muted-foreground">
        {log.map((l, i) => (
          <li key={i}>{l}</li>
        ))}
        <li className="text-foreground">Всего открываний-раздач в выборке: {hands.length}</li>
      </ul>
      <div className="mt-8 border border-border bg-card p-6">
        <OpenChartPanel chart={chart} tournamentsCounted={counted} />
      </div>
    </main>
  );
}
