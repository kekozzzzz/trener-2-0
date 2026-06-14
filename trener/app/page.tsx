"use server";

import { redirect } from "next/navigation";
import { uploadTournament } from "@/features/tournaments/actions";
import { BlurFade } from "@/components/ui/blur-fade";
import { ShineBorder } from "@/components/ui/shine-border";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SubmitButton } from "@/components/upload/submit-button";

const DEMO_PLAYER_ID = "00000000-0000-0000-0000-000000000001";

async function handleUpload(formData: FormData) {
  "use server";
  const file = formData.get("file") as File | null;
  if (!file || file.size === 0 || file.size > 5 * 1024 * 1024) return;

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
    <main className="mx-auto max-w-2xl space-y-8 px-8 py-16">
      <BlurFade direction="up" offset={8} blur="0px" duration={0.3}>
        <div className="space-y-3">
          <h1 className="text-display">Тренер 2.0</h1>
          <p className="text-body text-muted-foreground">
            Загрузи HH-файл GGPoker MTT — получишь три числа.
          </p>
        </div>
      </BlurFade>

      {error && (
        <BlurFade key={error} direction="up" offset={8} blur="0px" duration={0.3}>
          <div className="relative border border-destructive p-4">
            <ShineBorder
              shineColor="#FF5C5C"
              borderWidth={1}
              duration={1}
              style={{ animationIterationCount: 1 }}
            />
            <p className="text-small text-destructive">
              {error === "UNSUPPORTED_FORMAT"
                ? "Загрузи MTT-турнир GGPoker"
                : "Ошибка разбора файла"}
            </p>
          </div>
        </BlurFade>
      )}

      <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.05}>
        <form action={handleUpload} encType="multipart/form-data" className="space-y-4">
          <div className="space-y-2">
            <Label
              htmlFor="file"
              className="font-mono text-label uppercase tracking-label text-muted-foreground"
            >
              HH-файл (.txt)
            </Label>
            <Input id="file" type="file" name="file" accept=".txt" required />
          </div>
          <SubmitButton />
        </form>
      </BlurFade>
    </main>
  );
}
