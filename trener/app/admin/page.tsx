import { noindex } from "@/lib/seo";
export const metadata = noindex;
// Статистика собирается из БД на каждый заход — без кэша страницы.
export const dynamic = "force-dynamic";

import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { prisma } from "@/infrastructure/db/client";
import { requireSession } from "@/features/auth/session";
import { isAdminEmail } from "@/config/admin";
import {
  buildAdminStats,
  type DayPoint,
  type PeriodCounts,
  type AcquisitionSourceStats,
} from "@/features/admin/stats";
import { formatUsd } from "@/features/usage/cost-report";
import { PageHeader } from "@/components/page-header";
import { CopyLinkButton } from "@/components/copy-link-button";

// Вкладка владельца: сводка по продукту (регистрации, входы, страны, пробники,
// подписки, деньги, загрузки, ИИ-расходы, очередь). Доступ ТОЛЬКО владельцу
// (isAdminEmail): остальным — 404, не раскрывая существование страницы.
export default async function AdminPage() {
  const { playerId } = await requireSession();
  const player = await prisma.player.findUnique({
    where: { id: playerId },
    select: { email: true },
  });
  if (!isAdminEmail(player?.email)) notFound();

  const t = await getTranslations("Admin");
  const s = await buildAdminStats(prisma);

  return (
    <main>
      <PageHeader />
      <section className="mx-auto max-w-5xl px-8 py-16">
        <h1 className="text-h1">{t("title")}</h1>
        <p className="mt-2 font-mono text-label uppercase tracking-label text-muted-foreground">
          {t("generatedAt")}{" "}
          {s.generatedAt.toLocaleString("ru-RU", { timeZone: "Europe/Moscow" })} МСК
        </p>

        {/* Регистрации и входы */}
        <div className="mt-12 grid gap-8 md:grid-cols-2">
          <Card>
            <CardTitle>{t("registrations")}</CardTitle>
            <PeriodRow counts={s.players.registrations} t={t} />
            <Bars points={s.players.registrationsByDay} />
            <p className="mt-4 text-small text-muted-foreground">
              {t("playersOpen")}: <Num>{s.players.open}</Num> · {t("playersClosed")}:{" "}
              <Num>{s.players.closed}</Num>
            </p>
          </Card>
          <Card>
            <CardTitle>{t("logins")}</CardTitle>
            <PeriodRow counts={s.logins.counts} t={t} />
            <Bars points={s.logins.byDay} />
            <p className="mt-4 text-small text-muted-foreground">
              {t("uniquePlayers30")}: <Num>{s.logins.uniquePlayers30}</Num> ·{" "}
              {t("failedAttempts30")}: <Num>{s.logins.failed30}</Num>
            </p>
          </Card>
        </div>

        {/* Источники переходов: меченые ссылки /go/<source> на внешние площадки */}
        <Card className="mt-8">
          <CardTitle>{t("sourcesTitle")}</CardTitle>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {s.acquisition.map((src) => (
              <SourceRow key={src.slug} src={src} t={t} />
            ))}
          </div>
        </Card>

        {/* Страны */}
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <Card>
            <CardTitle>{t("countriesLogins")}</CardTitle>
            <CountryList items={s.countries.logins30} unknown={t("unknownCountry")} empty={t("noDataYet")} />
          </Card>
          <Card>
            <CardTitle>{t("countriesRegistrations")}</CardTitle>
            <CountryList items={s.countries.registrations30} unknown={t("unknownCountry")} empty={t("noDataYet")} />
          </Card>
        </div>

        {/* Пробный разбор и подписки */}
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <Card>
            <CardTitle>{t("trial")}</CardTitle>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <Stat label={t("trialTried")} value={s.trial.triedFree} accent />
              <Stat label={t("trialConverted")} value={s.trial.converted} />
              <Stat label={t("trialNotPaying")} value={s.trial.notPaying} />
            </div>
            <p className="mt-4 text-small text-muted-foreground">
              {t("conversion")}:{" "}
              <Num>
                {s.trial.triedFree > 0
                  ? `${Math.round((s.trial.converted / s.trial.triedFree) * 100)}%`
                  : "—"}
              </Num>
            </p>
          </Card>
          <Card>
            <CardTitle>{t("subscriptions")}</CardTitle>
            {s.subscriptions.activeByPlan.length === 0 ? (
              <p className="mt-4 text-small text-muted-foreground">{t("noActive")}</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {s.subscriptions.activeByPlan.map((p) => (
                  <li key={p.planCode} className="flex items-baseline justify-between">
                    <span className="font-mono text-label uppercase tracking-label text-muted-foreground">
                      {p.planCode}
                    </span>
                    <Num>{p.count}</Num>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-4 text-small text-muted-foreground">
              {t("new30")}: <Num>{s.subscriptions.new30}</Num> · {t("canceled30")}:{" "}
              <Num>{s.subscriptions.canceled30}</Num>
            </p>
          </Card>
        </div>

        {/* Деньги */}
        <Card className="mt-8">
          <CardTitle>{t("money")}</CardTitle>
          {s.money.length === 0 ? (
            <p className="mt-4 text-small text-muted-foreground">{t("noDataYet")}</p>
          ) : (
            s.money.map((m) => (
              <div key={m.currency} className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-5">
                <Stat label={`${t("today")}, ${m.currency}`} value={fmtAmount(m.today)} accent />
                <Stat label={`${t("last7")}, ${m.currency}`} value={fmtAmount(m.last7)} />
                <Stat label={`${t("last30")}, ${m.currency}`} value={fmtAmount(m.last30)} />
                <Stat label={t("payments30")} value={m.payments30} />
                <Stat label={t("refunds30")} value={fmtAmount(m.refunds30)} />
              </div>
            ))
          )}
        </Card>

        {/* Турниры и активность */}
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <Card>
            <CardTitle>{t("tournamentsTitle")}</CardTitle>
            <PeriodRow counts={s.tournaments.uploads} t={t} />
            <p className="mt-4 text-small text-muted-foreground">
              {t("failed30")}: <Num>{s.tournaments.failed30}</Num> · {t("unrecognized30")}:{" "}
              <Num>{s.tournaments.unrecognized30}</Num>
            </p>
          </Card>
          <Card>
            <CardTitle>{t("activityTitle")}</CardTitle>
            <div className="mt-4 grid grid-cols-3 gap-4">
              <Stat label={t("dialogueAnswers30")} value={s.activity.dialogueAnswers30} />
              <Stat label={t("chatToday")} value={s.activity.chatMessages.today} />
              <Stat label={t("chat30")} value={s.activity.chatMessages.last30} />
            </div>
          </Card>
        </div>

        {/* ИИ-расходы и очередь */}
        <div className="mt-8 grid gap-8 md:grid-cols-2">
          <Card>
            <CardTitle>{t("llmTitle")}</CardTitle>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <Stat label={t("llmDay")} value={formatUsd(s.llm.day.totalCostUsd)} accent />
              <Stat label={t("llmMonth")} value={formatUsd(s.llm.month.totalCostUsd)} />
            </div>
            <p className="mt-4 text-small text-muted-foreground">
              {t("llmRequests")}: <Num>{s.llm.month.totalRequests}</Num> · {t("llmCacheSaved")}:{" "}
              <Num>{formatUsd(s.llm.month.cacheNetUsd)}</Num>
            </p>
            {s.llm.month.topPlayers.length > 0 && (
              <ul className="mt-4 space-y-1">
                {s.llm.month.topPlayers.slice(0, 3).map((p) => (
                  <li
                    key={p.playerId}
                    className="flex items-baseline justify-between text-small text-muted-foreground"
                  >
                    <span className="truncate">{p.email ?? p.playerId.slice(0, 8)}</span>
                    <span className="font-mono">{formatUsd(p.costUsd)}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card>
            <CardTitle>{t("queueTitle")}</CardTitle>
            <div className="mt-4 grid grid-cols-4 gap-4">
              <Stat label="PENDING" value={s.queue.pending} />
              <Stat label="PROCESSING" value={s.queue.processing} />
              <Stat label="POISONED" value={s.queue.poisoned} accent={s.queue.poisoned > 0} />
              <Stat label="FAILED" value={s.queue.failed} />
            </div>
          </Card>
        </div>
      </section>
    </main>
  );
}

// ─────────────────────────── Локальные кирпичики ─────────────────────────────

function Card({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <div className={`border border-border bg-card p-6 ${className}`}>{children}</div>;
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="font-mono text-label uppercase tracking-label text-muted-foreground">
      {children}
    </h2>
  );
}

function Num({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-foreground">{children}</span>;
}

function Stat({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <div>
      <p className="font-mono text-label uppercase tracking-label text-muted-foreground">{label}</p>
      <p className={`mt-2 font-mono text-h2 ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function PeriodRow({
  counts,
  t,
}: {
  counts: PeriodCounts;
  t: (key: string) => string;
}) {
  return (
    <div className="mt-4 grid grid-cols-3 gap-4 sm:grid-cols-5">
      <Stat label={t("today")} value={counts.today} accent />
      <Stat label={t("yesterday")} value={counts.yesterday} />
      <Stat label={t("last7")} value={counts.last7} />
      <Stat label={t("last30")} value={counts.last30} />
      <Stat label={t("total")} value={counts.total} />
    </div>
  );
}

// Мини-график по дням: лаймовые столбики на сетке из 1px-линий не нужны —
// достаточно полосок высотой от объёма. Однократная отрисовка, без анимации.
function Bars({ points }: { points: DayPoint[] }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="mt-6">
      <div className="flex h-24 items-end gap-1">
        {points.map((p) => (
          <div key={p.label} className="flex-1" title={`${p.label}: ${p.count}`}>
            <div
              className={p.count > 0 ? "bg-primary" : "bg-border"}
              style={{ height: p.count > 0 ? `${Math.max(6, (p.count / max) * 96)}px` : "2px" }}
            />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between font-mono text-label uppercase tracking-label text-muted-foreground">
        <span>{points[0]?.label}</span>
        <span>{points[points.length - 1]?.label}</span>
      </div>
    </div>
  );
}

function SourceRow({
  src,
  t,
}: {
  src: AcquisitionSourceStats;
  t: (key: string) => string;
}) {
  return (
    <div className="border border-border p-4">
      <div className="flex items-center justify-between gap-4">
        <span className="font-mono text-label uppercase tracking-label text-foreground">
          {src.label}
        </span>
        <CopyLinkButton link={src.link} copyLabel={t("sourcesCopy")} copiedLabel={t("sourcesCopied")} />
      </div>
      <p className="mt-2 truncate font-mono text-small text-muted-foreground">{src.link}</p>
      <div className="mt-4 grid grid-cols-2 gap-4">
        <Stat label={t("sourcesVisits")} value={src.visitsTotal} accent />
        <Stat label={t("sourcesRegistrations")} value={src.registrationsTotal} />
      </div>
      <p className="mt-4 text-small text-muted-foreground">
        {t("sourcesVisits30")}: <Num>{src.visits30}</Num> · {t("sourcesRegistrations")}:{" "}
        <Num>{src.registrations30}</Num>
      </p>
    </div>
  );
}

function CountryList({
  items,
  unknown,
  empty,
}: {
  items: { country: string | null; count: number }[];
  unknown: string;
  empty: string;
}) {
  if (items.length === 0) return <p className="mt-4 text-small text-muted-foreground">{empty}</p>;
  const max = Math.max(1, ...items.map((i) => i.count));
  return (
    <ul className="mt-4 space-y-2">
      {items.map((i) => (
        <li key={i.country ?? "unknown"} className="flex items-center gap-4">
          <span className="w-16 shrink-0 font-mono text-label uppercase tracking-label text-muted-foreground">
            {i.country ?? unknown}
          </span>
          <span className="h-2 bg-primary" style={{ width: `${(i.count / max) * 100}%` }} />
          <span className="ml-auto font-mono text-small text-foreground">{i.count}</span>
        </li>
      ))}
    </ul>
  );
}

// Денежная сумма без хвоста копеек, если она целая (12 000 / 12 000,50).
function fmtAmount(v: number): string {
  return v.toLocaleString("ru-RU", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}
