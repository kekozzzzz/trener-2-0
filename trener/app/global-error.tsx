"use client";

// Глобальная страница ошибки (заменяет корневой layout при крэше рендера) —
// стили инлайном: globals.css здесь может не загрузиться (QA 2026-07-05, пункт 3;
// давний хвост из memory: global-error.tsx после 413-инцидента).
export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="ru">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: "48px 32px",
          background: "#0D0D0D",
          color: "#F5F5F5",
          fontFamily: "system-ui, -apple-system, sans-serif",
        }}
      >
        <p style={{ margin: 0, fontFamily: "monospace", fontSize: 12, letterSpacing: 2, color: "#8A8A8A" }}>
          WHYGRID · ОШИБКА
        </p>
        <h1 style={{ margin: "16px 0 0", fontSize: 32, lineHeight: 1.2 }}>Что-то сломалось на нашей стороне</h1>
        <p style={{ margin: "16px 0 0", maxWidth: 560, color: "#B3B3B3", lineHeight: 1.5 }}>
          Твои турниры и разборы целы. Попробуй обновить страницу - если не помогает, напиши на{" "}
          <a href="mailto:support@whygrid.app" style={{ color: "#D4FF33" }}>
            support@whygrid.app
          </a>
          .
        </p>
        <div style={{ marginTop: 24, display: "flex", gap: 12 }}>
          <button
            type="button"
            onClick={() => reset()}
            style={{
              padding: "12px 20px",
              background: "#D4FF33",
              color: "#0D0D0D",
              border: "none",
              fontFamily: "monospace",
              fontSize: 12,
              letterSpacing: 2,
              textTransform: "uppercase",
              cursor: "pointer",
            }}
          >
            Обновить
          </button>
          <a
            href="/"
            style={{
              padding: "12px 20px",
              border: "1px solid #4D4D4D",
              color: "#F5F5F5",
              fontFamily: "monospace",
              fontSize: 12,
              letterSpacing: 2,
              textTransform: "uppercase",
              textDecoration: "none",
            }}
          >
            На главную
          </a>
        </div>
      </body>
    </html>
  );
}
