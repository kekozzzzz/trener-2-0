import { StatusClient } from "./status-client";

export default function StatusPage() {
  return (
    <main style={{ padding: "2rem", fontFamily: "monospace", maxWidth: "800px" }}>
      <h1>Статус загрузок</h1>
      <p>
        <a href="/">← Загрузить файл</a>
      </p>
      <StatusClient />
    </main>
  );
}
