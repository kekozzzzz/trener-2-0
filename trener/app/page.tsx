"use server";

import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { uploadTournament } from "@/features/tournaments/actions";
import { BlurFade } from "@/components/ui/blur-fade";
import { ShineBorder } from "@/components/ui/shine-border";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PricingCard } from "@/components/ui/pricing-card";
import { FileInput } from "@/components/upload/file-input";
import { SubmitButton } from "@/components/upload/submit-button";
import { cn } from "@/lib/utils";

const DEMO_PLAYER_ID = "00000000-0000-0000-0000-000000000001";

const STEPS = [
  {
    number: "/01",
    title: "Загрузи турнир",
    description:
      "Скинь HH-файл GGPoker MTT — без регистрации и настроек. Парсер разберёт каждую раздачу турнира.",
  },
  {
    number: "/02",
    title: "Тебя спросят «почему»",
    description:
      "По паре самых спорных раздач тренер спросит, почему ты сыграл именно так — прежде чем дать оценку.",
  },
  {
    number: "/03",
    title: "Увидь разрыв",
    description:
      "Сравнишь свой ответ с разбором — и сам увидишь, где твоя логика не совпала с тем, что случилось на столе.",
  },
];

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
    <main>
      <BlurFade direction="up" offset={8} blur="0px" duration={0.3}>
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
            <span className="font-mono text-label uppercase tracking-label text-foreground">
              Тренер 2.0
            </span>
            <span className="font-mono text-label uppercase tracking-label text-muted-foreground">
              GGPoker MTT
            </span>
          </div>
        </header>
      </BlurFade>

      <section className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
        <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.05}>
          <div className="max-w-2xl space-y-6">
            <Badge variant="outline">Сократовский AI-тренер</Badge>
            <h1 className="text-h1 sm:text-display">
              Пойми, почему ты слил — на своих раздачах
            </h1>
            <p className="text-body text-muted-foreground">
              Загружаешь HH-файл GGPoker — парсер считает VPIP, потери в фишках и SPR, а тренер
              спрашивает «почему», прежде чем дать оценку.
            </p>
            <a href="#upload" className={cn(buttonVariants(), "gap-2")}>
              Загрузить турнир
              <ArrowRight className="size-4" />
            </a>
          </div>
        </BlurFade>
      </section>

      <section className="border-y border-border">
        <div className="mx-auto max-w-5xl px-8 py-16">
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.1}>
            <h2 className="text-h2">Как это работает</h2>
          </BlurFade>
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.15}>
            <div className="mt-8 grid divide-y divide-border border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {STEPS.map((step) => (
                <div key={step.number} className="p-8">
                  <p className="font-mono text-label uppercase tracking-label text-primary">
                    {step.number}
                  </p>
                  <h3 className="mt-4 text-h3">{step.title}</h3>
                  <p className="mt-2 text-small text-muted-foreground">{step.description}</p>
                </div>
              ))}
            </div>
          </BlurFade>
        </div>
      </section>

      <section id="upload" className="mx-auto max-w-5xl px-8 py-16">
        <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.2}>
          <div className="max-w-2xl space-y-8">
            <div className="space-y-2">
              <h2 className="text-h2">Загрузи турнир</h2>
              <p className="text-small text-muted-foreground">
                HH-файл GGPoker MTT в формате .txt, до 5 МБ.
              </p>
            </div>

            {error && (
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
            )}

            <form action={handleUpload} encType="multipart/form-data" className="space-y-4">
              <div className="space-y-2">
                <Label
                  htmlFor="file"
                  className="font-mono text-label uppercase tracking-label text-muted-foreground"
                >
                  HH-файл (.txt)
                </Label>
                <FileInput id="file" name="file" accept=".txt" required />
              </div>
              <SubmitButton />
            </form>
          </div>
        </BlurFade>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-8 py-16">
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.25}>
            <div className="max-w-2xl space-y-6">
              <h2 className="text-h2">Тариф</h2>
              <PricingCard
                title="Базовый"
                description="Загружай турниры, разбирай раздачи, спрашивай «почему»"
                price={12}
                features={[
                  {
                    title: "Что входит",
                    items: [
                      "До 20 турниров в месяц",
                      "~10 адаптивных раздач за сессию",
                      "Парсер VPIP, потерь в фишках, SPR",
                      "Сократовский диалог по каждой раздаче",
                    ],
                  },
                ]}
                buttonText="Загрузить турнир"
              />
            </div>
          </BlurFade>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-8 font-mono text-label uppercase tracking-label text-muted-foreground">
          <span>Тренер 2.0</span>
          <span>© {new Date().getFullYear()}</span>
        </div>
      </footer>
    </main>
  );
}
