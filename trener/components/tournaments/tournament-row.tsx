import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { getTranslations } from "next-intl/server";
import type { PlayerStyle, TournamentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import type { TournamentListItem } from "@/features/tournaments/queries";
import { cn } from "@/lib/utils";

// Стиль игрока → ключ подписи в словаре.
const STYLE_KEY: Record<PlayerStyle, string> = {
  LOOSE: "styleLoose",
  TIGHT: "styleTight",
  PASSIVE: "stylePassive",
  AGGRESSIVE: "styleAggressive",
};

// Код площадки из HH → читаемая подпись. "WPN" — это сеть; игроки знают её скины
// ACR/PokerKing, поэтому показываем их. Неизвестный код выводим как есть. Названия
// румов не переводим.
const ROOM_LABEL: Record<string, string> = {
  GGPoker: "GGPoker",
  WPN: "ACR / PokerKing",
};
function roomLabel(room: string): string {
  return ROOM_LABEL[room] ?? room;
}

// Статус → ключ подписи и готовность. PARSED/CARD_READY показываем как готовый
// разбор с метриками; остальные — бейджем без метрик.
const STATUS: Record<TournamentStatus, { labelKey: string; ready: boolean; failed: boolean }> = {
  UPLOADED: { labelKey: "statusQueued", ready: false, failed: false },
  PARSING: { labelKey: "statusParsing", ready: false, failed: false },
  PARSED: { labelKey: "statusReady", ready: true, failed: false },
  CARD_READY: { labelKey: "statusReady", ready: true, failed: false },
  FAILED: { labelKey: "statusFailed", ready: false, failed: true },
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

export async function TournamentRow({ tournament }: { tournament: TournamentListItem }) {
  const t = await getTranslations("TournamentRow");
  const status = STATUS[tournament.status];

  return (
    <Link
      href={`/tournament/${tournament.id}`}
      className={cn(
        "group flex items-center justify-between gap-4 border bg-card p-6 transition-colors duration-150 ease-out hover:border-primary",
        tournament.fullyReviewed ? "border-primary" : "border-border"
      )}
    >
      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <span className="truncate text-body text-foreground">
            {tournament.name ?? t("tournament")}
          </span>
          {tournament.room && <Badge variant="outline">{roomLabel(tournament.room)}</Badge>}
          {tournament.fullyReviewed && <Badge variant="done">{t("passed")}</Badge>}
          {status.ready ? (
            tournament.styleDiagnosis && (
              <Badge variant="outline">{t(STYLE_KEY[tournament.styleDiagnosis])}</Badge>
            )
          ) : (
            <Badge variant="outline" className={cn(status.failed && "border-destructive text-destructive")}>
              {t(status.labelKey)}
            </Badge>
          )}
        </div>
        <span className="font-mono text-label uppercase tracking-label text-muted-foreground">
          {dateFormat.format(tournament.playedAt)}
        </span>
      </div>

      <div className="flex items-center gap-6">
        {status.ready && (
          <>
            <Metric label={t("vpip")}>{tournament.vpipPercent != null ? `${tournament.vpipPercent.toFixed(1)}%` : "—"}</Metric>
          </>
        )}
        <ArrowRight className="size-4 text-muted-foreground transition-colors duration-150 ease-out group-hover:text-primary" />
      </div>
    </Link>
  );
}
