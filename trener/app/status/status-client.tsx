"use client";

import { useEffect, useState, useCallback } from "react";

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
  error: string | null;
  attempt: number;
};

const TOURNAMENT_LABEL: Record<string, string> = {
  UPLOADED:   "ожидание",
  PARSING:    "разбирается",
  PARSED:     "готово",
  CARD_READY: "готово",
  FAILED:     "ошибка",
};

const TASK_LABEL: Record<string, string> = {
  PENDING:    "ожидание",
  PROCESSING: "в работе",
  DONE:       "готово",
  FAILED:     "ошибка",
  POISONED:   "карантин",
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
  const [data, setData] = useState<{ tournaments: Tournament[]; tasks: Task[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/status");
      if (res.ok) setData(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  async function triggerWorker() {
    await fetch("/api/cron/run-tasks", { method: "POST" });
    await fetchStatus();
  }

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 3000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  if (!data) return <p>Загружаем...</p>;

  const { tournaments, tasks } = data;

  const hasPending = tasks.some((t) => t.status === "PENDING" || t.status === "PROCESSING") ||
    tournaments.some((t) => t.status === "UPLOADED" || t.status === "PARSING");

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "1rem", marginBottom: "0.5rem" }}>
        <span style={{ fontSize: "0.8em", color: "#6b7280" }}>
          {loading ? "обновляем..." : "обновляется каждые 3 сек"}
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
            Запустить воркер
          </button>
        )}
      </div>

      <h2 style={{ marginTop: "1rem" }}>Турниры</h2>
      {tournaments.length === 0 ? (
        <p style={{ color: "#6b7280" }}>Нет загруженных турниров. <a href="/">Загрузить файл →</a></p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", marginTop: "0.5rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ textAlign: "left", padding: "4px 1rem 4px 0", fontWeight: "normal", color: "#6b7280" }}>Время</th>
              <th style={{ textAlign: "left", padding: "4px 1rem 4px 0", fontWeight: "normal", color: "#6b7280" }}>Статус</th>
              <th style={{ textAlign: "left", padding: "4px 0", fontWeight: "normal", color: "#6b7280" }}>Результат</th>
            </tr>
          </thead>
          <tbody>
            {tournaments.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "6px 1rem 6px 0" }}>{time(t.createdAt)}</td>
                <td style={{ padding: "6px 1rem 6px 0" }}>
                  <Badge status={t.status} label={TOURNAMENT_LABEL[t.status] ?? t.status} />
                </td>
                <td style={{ padding: "6px 0" }}>
                  {(t.status === "PARSED" || t.status === "CARD_READY") && t.vpipPercent != null ? (
                    <a href={`/tournament/${t.id}`}>
                      VPIP {Number(t.vpipPercent).toFixed(1)}% · {t.handsCount} рук · {Number(t.resultBuyins).toFixed(2)} BI →
                    </a>
                  ) : t.status === "FAILED" ? (
                    <span style={{ color: "#991b1b" }}>формат не поддерживается</span>
                  ) : (
                    <span style={{ color: "#9ca3af" }}>—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <h2 style={{ marginTop: "1.5rem" }}>Очередь задач</h2>
      {tasks.length === 0 ? (
        <p style={{ color: "#6b7280" }}>Нет задач в очереди.</p>
      ) : (
        <table style={{ borderCollapse: "collapse", width: "100%", marginTop: "0.5rem" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid #e5e7eb" }}>
              <th style={{ textAlign: "left", padding: "4px 1rem 4px 0", fontWeight: "normal", color: "#6b7280" }}>Время</th>
              <th style={{ textAlign: "left", padding: "4px 1rem 4px 0", fontWeight: "normal", color: "#6b7280" }}>Тип</th>
              <th style={{ textAlign: "left", padding: "4px 1rem 4px 0", fontWeight: "normal", color: "#6b7280" }}>Статус</th>
              <th style={{ textAlign: "left", padding: "4px 0", fontWeight: "normal", color: "#6b7280" }}>Ошибка</th>
            </tr>
          </thead>
          <tbody>
            {tasks.map((t) => (
              <tr key={t.id} style={{ borderBottom: "1px solid #f3f4f6" }}>
                <td style={{ padding: "6px 1rem 6px 0" }}>{time(t.createdAt)}</td>
                <td style={{ padding: "6px 1rem 6px 0" }}>{t.type}</td>
                <td style={{ padding: "6px 1rem 6px 0" }}>
                  <Badge status={t.status} label={TASK_LABEL[t.status] ?? t.status} />
                  {t.attempt > 1 && (
                    <span style={{ color: "#6b7280", fontSize: "0.8em", marginLeft: "4px" }}>
                      (попытка {t.attempt})
                    </span>
                  )}
                </td>
                <td style={{ padding: "6px 0", color: "#991b1b", fontSize: "0.85em" }}>
                  {t.error ?? ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
