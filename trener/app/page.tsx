"use server";

import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { uploadTournament } from "@/features/tournaments/actions";
import { recentTournaments } from "@/features/tournaments/queries";
import { requireSession } from "@/features/auth/session";
import { getCurrentPlayer } from "@/features/auth/queries";
import { AuthNav } from "@/components/auth-nav";
import { Wordmark } from "@/components/ui/wordmark";
import { PageHeader } from "@/components/page-header";
import { TournamentRow } from "@/components/tournaments/tournament-row";
import { BlurFade } from "@/components/ui/blur-fade";
import { ShineBorder } from "@/components/ui/shine-border";
import { Badge } from "@/components/ui/badge";
import { buttonVariants } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { FileInput } from "@/components/upload/file-input";
import { SubmitButton } from "@/components/upload/submit-button";
import { cn } from "@/lib/utils";

const STEPS = [
  {
    number: "/01",
    title: "Загрузи турнир",
    description:
      "Зарегистрируйся и скинь HH-файл GGPoker MTT — первый турнир разберём бесплатно. Парсер пройдёт по каждой раздаче.",
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

// Сравнение с альтернативами для витрины гостя: почему сервис, а не тренер/самообучение.
// Лайм-акцент (accent) — только на колонке сервиса (один сигнальный цвет, design-system.md §1).
const ALTERNATIVES = [
  {
    tag: "Личный тренер",
    verdict: "Слишком дорого",
    description: "$50/час — и мало кто возьмётся всерьёз разбирать микролимиты.",
    accent: false,
  },
  {
    tag: "Разбираться самому",
    verdict: "Легко ошибиться",
    description:
      "Можно не так понять, не найти ответ или принять чужую утечку за правило — и закрепить ошибку вместо того, чтобы убрать её.",
    accent: false,
  },
  {
    tag: "Whygrid",
    verdict: "от $12 в месяц",
    description:
      "Твои собственные раздачи. Парсер считает математику точно, а тренер ведёт вопросами — пока ты сам не увидишь, где слил.",
    accent: true,
  },
];

async function handleUpload(formData: FormData) {
  "use server";
  const { playerId } = await requireSession();

  const file = formData.get("file") as File | null;
  if (!file || file.size === 0 || file.size > 5 * 1024 * 1024) return;

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await uploadTournament({
    fileBuffer: buffer,
    originalFilename: file.name,
    playerId,
  });

  if (!result.ok) {
    if (result.error === "DUPLICATE") {
      // Повтор: ведём к уже существующему разбору с пометкой.
      redirect(`/tournament/${result.existingTournamentId}?duplicate=1`);
    }
    redirect(`/?error=${result.error}`);
  } else {
    redirect(`/tournament/${result.tournamentId}`);
  }
}

function UploadError({ error }: { error: string }) {
  return (
    <div className="relative border border-destructive p-4">
      <ShineBorder shineColor="#FF5C5C" borderWidth={1} duration={1} style={{ animationIterationCount: 1 }} />
      <p className="text-small text-destructive">
        {error === "UNSUPPORTED_FORMAT" ? "Загрузи MTT-турнир GGPoker" : "Ошибка разбора файла"}
      </p>
    </div>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-8 font-mono text-label uppercase tracking-label text-muted-foreground">
        <Wordmark />
        <span>© {new Date().getFullYear()}</span>
      </div>
    </footer>
  );
}

export default async function UploadPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const player = await getCurrentPlayer();

  // Залогиненный игрок видит дашборд: форма загрузки + последние турниры.
  if (player) {
    const recent = await recentTournaments(player.id, 5);
    return (
      <main>
        <PageHeader />

        <section className="mx-auto max-w-5xl px-8 py-16">
          <div className="max-w-2xl space-y-8">
            <div className="space-y-2">
              <h1 className="text-h1">Загрузить турнир</h1>
              <p className="text-small text-muted-foreground">HH-файл GGPoker MTT в формате .txt, до 5 МБ.</p>
            </div>

            {error && <UploadError error={error} />}

            <form action={handleUpload} encType="multipart/form-data" className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="file" className="font-mono text-label uppercase tracking-label text-muted-foreground">
                  HH-файл (.txt)
                </Label>
                <FileInput id="file" name="file" accept=".txt" required />
              </div>
              <SubmitButton />
            </form>
          </div>
        </section>

        <section className="border-t border-border">
          <div className="mx-auto max-w-5xl px-8 py-16">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <h2 className="text-h2">Последние турниры</h2>
              {recent.length > 0 && (
                <Link
                  href="/tournaments"
                  className="font-mono text-label uppercase tracking-label text-muted-foreground transition-colors hover:text-foreground"
                >
                  Все турниры →
                </Link>
              )}
            </div>

            {recent.length === 0 ? (
              <p className="mt-8 text-body text-muted-foreground">
                Пока ни одного турнира. Загрузи первый — он появится здесь.
              </p>
            ) : (
              <div className="mt-8 space-y-4">
                {recent.map((tournament) => (
                  <TournamentRow key={tournament.id} tournament={tournament} />
                ))}
              </div>
            )}
          </div>
        </section>

        <Footer />
      </main>
    );
  }

  // Гость видит витрину: hero, «как это работает», приглашение войти/зарегистрироваться.
  return (
    <main>
      <BlurFade direction="up" offset={8} blur="0px" duration={0.3}>
        <header className="border-b border-border">
          <div className="mx-auto flex max-w-5xl items-center justify-between px-8 py-6">
            <Wordmark />
            <div className="flex items-center gap-4">
              <AuthNav />
            </div>
          </div>
        </header>
      </BlurFade>

      <section className="mx-auto max-w-5xl px-8 py-16 sm:py-24">
        <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.05}>
          <div className="mx-auto flex max-w-2xl flex-col items-center space-y-6 text-center">
            <Badge variant="outline">Сократовский AI-тренер</Badge>
            {/* Резиновый размер: плавно от ~h1 на узком окне до display (4rem) на широком —
                чтобы заголовок не переполнял экран при сжатии окна, оставаясь по центру. */}
            <h1 className="font-black leading-[1.05] tracking-[-0.02em] text-balance text-[clamp(2.25rem,7vw,4rem)]">
              Перестань терять деньги на базовых ошибках
            </h1>
            <p className="text-body text-muted-foreground">
              Одни и те же утечки забирают у тебя не бай-ины, а деньги. Whygrid находит их
              в твоих собственных раздачах и доводит до того, чтобы ты сам понял, где
              ошибся, — а не просто запомнил чужой совет.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <Link href="/register" className={cn(buttonVariants(), "gap-2")}>
                Загрузить турнир
                <ArrowRight className="size-4" />
              </Link>
              <Link href="/login" className={cn(buttonVariants({ variant: "outline" }))}>
                Войти
              </Link>
            </div>
            <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
              Попробуй бесплатно
            </p>
          </div>
        </BlurFade>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-8 py-16">
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.08}>
            <h2 className="text-h2 text-center">Почему не по-другому</h2>
            <p className="mx-auto mt-4 max-w-2xl text-center text-body text-muted-foreground">
              Ошибки в покере чинятся разбором. Вопрос только в том, каким.
            </p>
          </BlurFade>
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.12}>
            <div className="mt-8 grid divide-y divide-border border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {ALTERNATIVES.map((alt) => (
                <div key={alt.tag} className="p-8 text-center">
                  <p
                    className={cn(
                      "font-mono text-label uppercase tracking-label",
                      alt.accent ? "text-primary" : "text-muted-foreground"
                    )}
                  >
                    {alt.tag}
                  </p>
                  <h3 className="mt-4 text-h3">{alt.verdict}</h3>
                  <p className="mt-2 text-small text-muted-foreground">{alt.description}</p>
                </div>
              ))}
            </div>
          </BlurFade>
        </div>
      </section>

      <section className="border-y border-border">
        <div className="mx-auto max-w-5xl px-8 py-16">
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.1}>
            <h2 className="text-h2 text-center">Как это работает</h2>
          </BlurFade>
          <BlurFade direction="up" offset={8} blur="0px" duration={0.3} delay={0.15}>
            <div className="mt-8 grid divide-y divide-border border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
              {STEPS.map((step) => (
                <div key={step.number} className="p-8 text-center">
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

      <Footer />
    </main>
  );
}
