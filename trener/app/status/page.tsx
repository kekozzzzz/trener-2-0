import { requireSession } from "@/features/auth/session";
import { StatusClient } from "./status-client";

export default async function StatusPage() {
  await requireSession();

  return (
    <main style={{ padding: "2rem", fontFamily: "monospace", maxWidth: "800px" }}>
      <h1>Статус загрузок</h1>
      <p>
        <a href="/analyze">← Загрузить файл</a>
      </p>
      <StatusClient />
    </main>
  );
}
