import Link from "next/link";
import { ArrowRight } from "lucide-react";
import type { PlayerStyle, TournamentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import type { TournamentListItem } from "@/features/tournaments/queries";
import { cn } from "@/lib/utils";

const STYLE_LABEL: Record<PlayerStyle, string> = {
  LOOSE: "Лузовый",
  TIGHT: "Тайтовый",
  PASSIVE: "Пассивный",
  AGGRESSIVE: "Агрессивный",
};

// Статус → подпись и готовность. PARSED/CARD_READY показываем как готовый
// разбор с метриками; остальные — бейджем без метрик.
const STATUS: Record<TournamentStatus, { label: string; ready: boolean; failed: boolean }> = {
  UPLOADED: { label: "в очереди", ready: false, failed: false },
  PARSING: { label: "разбираем", ready: false, failed: false },
  PARSED: { label: "готов", ready: true, failed: false },
  CARD_READY: { label: "готов", ready: true, failed: false },
  FAILED: { label: "ошибка", ready: false, failed: true },
};

// timeZone UTC — playedAt хранится в UTC из компонентов HH-файла, показываем дату ровно как в файле.
const dateFormat = new Intl.DateTimeFormat("ru-RU", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: "UTC",
});

function Metric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="text-right">
      <p className="font-mono text-label uppercase tracking-label text-muted-foreground">{label}</p>
      <p className="mt-1 font-mono text-body text-foreground">{children}</p>
    </div>
  );
}

export function TournamentRow({ tournament }: { tournament: TournamentListItem }) {
  const status = STATUS[tournament.status];
  const result = tournament.resultBuyins;
  const resultSign = result != null && result >= 0 ? "+" : "";

  return (
    <Link
      href={`/tournament/${tournament.id}`}
      className="group flex items-center justify-between gap-4 border border-border bg-card p-6 transition-colors duration-150 ease-out hover:border-primary"
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="truncate text-body text-foreground">
            {tournament.name ?? "Турнир"}
          </span>
          {status.ready ? (
            tournament.styleDiagnosis && (
              <Badge variant="outline">{STYLE_LABEL[tournament.styleDiagnosis]}</Badge>
            )
          ) : (
            <Badge variant="outline" className={cn(status.failed && "border-destructive text-destructive")}>
              {status.label}
            </Badge>
          )}
        </div>
        <span className="font-mono text-label uppercase tracking-label text-muted-foreground">
          {dateFormat.format(tournament.playedAt)}
          {tournament.room && ` · ${tournament.room}`}
        </span>
      </div>

      <div className="flex items-center gap-6">
        {status.ready && (
          <>
            <Metric label="VPIP">{tournament.vpipPercent != null ? `${tournament.vpipPercent.toFixed(1)}%` : "—"}</Metric>
            <Metric label="Бай-ины">
              <span className={cn(result != null && result >= 0 ? "text-primary" : "text-foreground")}>
                {result != null ? `${resultSign}${result.toFixed(2)}` : "—"}
              </span>
            </Metric>
          </>
        )}
        <ArrowRight className="size-4 text-muted-foreground transition-colors duration-150 ease-out group-hover:text-primary" />
      </div>
    </Link>
  );
}
