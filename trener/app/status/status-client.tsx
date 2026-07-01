"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useTranslations } from "next-intl";
import { triggerWorkerAction } from "./actions";

type Tournament = {
  id: string;
  status: string;
  createdAt: string;
  vpipPercent: string | null;
  handsCount: number | null;
  resultBuyins: string | null;
};

type Task = {
  id: string;
  type: string;
  status: string;
  payload: Record<string, unknown>;
  createdAt: string;
  attempt: number;
};

// Приходит ТОЛЬКО админу (config/admin.ts). У обычного пользователя cost === null.
type CostPlayer = { playerId: string; email: string | null; requests: number; costUsd: number };
type CostReport = {
  totalRequests: number;
  totalCostUsd: number;
  cacheNetUsd: number; // >0 — кэш сэкономил; <0 — стоил лишнего
  topPlayers: CostPlayer[];
};

function usd(v: number): string {
  return `$${v.toFixed(Math.abs(v) >= 1 ? 2 : 4)}`;
}

// Значения — ключи перевода в namespace Status (см. messages/*.json).
const TOURNAMENT_LABEL: Record<string, string> = {
  UPLOADED:   "tournamentUploaded",
  PARSING:    "tournamentParsing",
  PARSED:     "tournamentParsed",
  CARD_READY: "tournamentParsed",
  FAILED:     "tournamentFailed",
};

const TASK_LABEL: Record<string, string> = {
  PENDING:    "taskPending",
  PROCESSING: "taskProcessing",
  DONE:       "taskDone",
  FAILED:     "taskFailedLabel",
  POISONED:   "taskPoisoned",
};

const BADGE_STYLE: Record<string, React.CSSProperties> = {
  UPLOADED:   { background: "#e5e7eb", color: "#374151" },
  PARSING:    { background: "#dbeafe", color: "#1d4ed8" },
  PARSED:     { background: "#d1fae5", color: "#065f46" },
  CARD_READY: { background: "#d1fae5", color: "#065f46" },
  PENDING:    { background: "#e5e7eb", color: "#374151" },
  PROCESSING: { background: "#dbeafe", color: "#1d4ed8" },
  DONE:       { background: "#d1fae5", color: "#065f46" },
  FAILED:     { background: "#fee2e2", color: "#991b1b" },
  POISONED:   { background: "#fee2e2", color: "#991b1b" },
};

function Badge({ status, label }: { status: string; label: string }) {
  return (
    <span
      style={{
        ...(BADGE_STYLE[status] ?? { background: "#f3f4f6", color: "#111" }),
        padding: "2px 8px",
        borderRadius: "4px",
        fontSize: "0.85em",
        whiteSpace: "nowrap",
      }}
    >
      {label}
    </span>
  );
}

function time(iso: string) {
  return new Date(iso).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function StatusClient() {
  const t = useTranslations("Status");
  const [data, setData] = useState<{ tournaments: Tournament[]; tasks: Task[]; cost?: CostReport | null } | null>(null);
  const [loading, setLoading] = useState(false);
  const [workerError, setWorkerError] = useState<string | null>(null);
  const inFlight = useRef(false);

  const fetchStatus = useCallback(async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setLoading(true);
    try {
      const res = await fetch("/api/status");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
      inFlight.current = false;
    }
  }, []);

  async function triggerWorker() {
    setWorkerError(null);
    try {
      const result = await triggerWorkerAction();
      if (!result.ok) setWorkerError(t("workerBusy"));
    } catch {
      setWorkerError(t("workerFailed"));
    }
    await fetchStatus();
  }

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  if (!data) return <p>{t("loading")}</p>;

  const { tournaments, tasks, cost } = data;

  const hasPending = tasks.some((t) => t.status === "PENDING" || t.status === "PROCESSING") ||
    tournaments.some((t) => t.status === "UPLOADED" || t.status === "PARSING");

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "0.8em", color: "#6b7280" }}>
          {loading ? t("refreshing") : t("autoRefresh")}
        </span>
        {hasPending && (
          <button
            onClick={triggerWorker}
            style={{
              fontFamily: "monospace",
              padding: "4px 12px",
              cursor: "pointer",
              border: "1px solid #374151",
              borderRadius: "4px",
              background: "#f9fafb",
            }}
          >
            {t("runWorker")}
          </button>
        )}
        {workerError && (
          <span style={{ color: "#991b1b", fontSize: "0.85em" }}>{workerError}</span>
        )}
      </div>

      {cost && (
        <div style={{ marginTop: "1rem", padding: "0.75rem 1rem", border: "1px solid #e5e7eb", borderRadius: "6px", background: "#fafafa" }}>
          <h2 style={{ marginTop: 0 }}>
            💸 {t("costTitle")}{" "}
            <span style={{ fontSize: "0.6em", color: "#9ca3af", fontWeight: "normal" }}>{t("costVisibleOnlyToYou")}</span>
          </h2>
          <p style={{ margin: "0.25rem 0" }}>
            {t("costRequests")}: <b>{cost.totalRequests}</b> · {t("costSpent")}: <b>{usd(cost.totalCostUsd)}</b> · {t("costCache")}:{" "}
            <b style={{ color: cost.cacheNetUsd >= 0 ? "#065f46" : "#991b1b" }}>
              {cost.cacheNetUsd >= 0 ? t("costCacheSaved", { amount: usd(cost.cacheNetUsd) }) : t("costCacheExtra", { amount: usd(-cost.cacheNetUsd) })}
            </b>
          </p>
          {cost.topPlayers.length > 0 && (
            <table style={{ borderCollapse: "collapse", marginTop: "0.5rem" }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
                  <th style={{ textAlign: "left", padding: "4px 1.5rem 4px 0", fontWeight: "normal", color: "#6b7280" }}>{t("colPlayer")}</th>
                  <th style={{ textAlign: "left", padding: "4px 1.5rem 4px 0", fontWeight: "normal", color: "#6b7280" }}>{t("costRequests")}</th>
                  <th style={{ textAlign: "left", padding: "4px 0", fontWeight: "normal", color: "#6b7280" }}>{t("costSpent")}</th>
                </tr>
              </thead>
              <tbody>
                {cost.topPlayers.map((p) => (
                  <tr key={p.playerId} style={{ borderBottom: "1px solid #f3f4f6" }}>
                    <td style={{ padding: "6px 1.5rem 6px 0" }}>{p.email ?? p.playerId.slice(0, 8)}</td>
                    <td style={{ padding: "6px 1.5rem 6px 0" }}>{p.requests}</td>
                    <td style={{ padding: "6px 0" }}>{usd(p.costUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      <h2 style={{ marginTop: "1rem" }}>{t("tournamentsHeading")}</h2>
      {tournaments.length === 0 ? (
        <p style={{ color: "#6b7280" }}>{t("noTournaments")} <a href="/analyze">{t("uploadFileArrow")}</a></p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", marginTop: "0.5rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ textAlign: "left", padding: "4px 1rem 4px 0", fontWeight: "normal", color: "#6b7280" }}>{t("colTime")}</th>
              <th style={{ textAlign: "left", padding: "4px 1rem 4px 0", fontWeight: "normal", color: "#6b7280" }}>{t("colStatus")}</th>
              <th style={{ textAlign: "left", padding: "4px 0", fontWeight: "normal", color: "#6b7280" }}>{t("colResult")}</th>
            </tr>
          </thead>
          <tbody>
            {tournaments.map((row) => (
              <tr key={row.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "6px 1rem 6px 0" }}>{time(row.createdAt)}</td>
                <td style={{ padding: "6px 1rem 6px 0" }}>
                  <Badge status={row.status} label={TOURNAMENT_LABEL[row.status] ? t(TOURNAMENT_LABEL[row.status]) : row.status} />
                </td>
                <td style={{ padding: "6px 0" }}>
                  {(row.status === "PARSED" || row.status === "CARD_READY") && row.vpipPercent != null ? (
                    <a href={`/tournament/${row.id}`}>
                      VPIP {Number(row.vpipPercent).toFixed(1)}% · {row.handsCount} {t("handsShort")} →
                    </a>
                  ) : row.status === "FAILED" ? (
                    <span style={{ color: "#991b1b" }}>{t("unsupportedFormat")}</span>
                  ) : (
                    <span style={{ color: "#9ca3af" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: "1.5rem" }}>{t("queueHeading")}</h2>
      {tasks.length === 0 ? (
        <p style={{ color: "#6b7280" }}>{t("noTasks")}</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", marginTop: "0.5rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ textAlign: "left", padding: "4px 1rem 4px 0", fontWeight: "normal", color: "#6b7280" }}>{t("colTime")}</th>
              <th style={{ textAlign: "left", padding: "4px 1rem 4px 0", fontWeight: "normal", color: "#6b7280" }}>{t("colType")}</th>
              <th style={{ textAlign: "left", padding: "4px 1rem 4px 0", fontWeight: "normal", color: "#6b7280" }}>{t("colStatus")}</th>
              <th style={{ textAlign: "left", padding: "4px 0", fontWeight: "normal", color: "#6b7280" }}>{t("colError")}</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "6px 1rem 6px 0" }}>{time(task.createdAt)}</td>
                <td style={{ padding: "6px 1rem 6px 0" }}>{task.type}</td>
                <td style={{ padding: "6px 1rem 6px 0" }}>
                  <Badge status={task.status} label={TASK_LABEL[task.status] ? t(TASK_LABEL[task.status]) : task.status} />
                  {task.attempt > 1 && (
                    <span style={{ color: "#6b7280", fontSize: "0.8em", marginLeft: "4px" }}>
                      ({t("attempt", { n: task.attempt })})
                    </span>
                  )}
                </td>
                <td style={{ padding: "6px 0", color: "#991b1b", fontSize: "0.85em" }}>
                  {task.status === "FAILED" || task.status === "POISONED" ? t("taskFailed") : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
