"use server";

import { redirect } from "next/navigation";
import { uploadTournament } from "@/features/tournaments/actions";

const DEMO_PLAYER_ID = "00000000-0000-0000-0000-000000000001";

async function handleUpload(formData: FormData) {
  "use server";
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0) return;

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadTournament({
    fileBuffer: buffer,
    originalFilename: file.name,
    playerId: DEMO_PLAYER_ID,
  });

  if (!result.ok) {
    redirect(`/?error=${result.error}`);
  } else {
    redirect(`/tournament/${result.tournamentId}`);
  }
}

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main style={{ padding: "2rem", fontFamily: "monospace" }}>
      <h1>Тренер 2.0</h1>
      <p>Загрузи HH-файл GGPoker MTT — получишь три числа.</p>

      {error && (
        <p style={{ color: "red" }}>
          {error === "UNSUPPORTED_FORMAT"
            ? "Загрузи MTT-турнир GGPoker"
            : "Ошибка разбора файла"}
        </p>
      )}

      <form action={handleUpload} encType="multipart/form-data">
        <input type="file" name="file" accept=".txt" required />
        <button type="submit" style={{ marginLeft: "1rem" }}>
          Загрузить
        </button>
      </form>
    </main>
  );
}
