import { noindex } from "@/lib/seo";
export const metadata = noindex;
import { redirect } from "next/navigation";
import Link from "next/link";
import { uploadTournament } from "@/features/tournaments/actions";
import { recentTournaments } from "@/features/tournaments/queries";
import { requireSession } from "@/features/auth/session";
import { checkUploadQuota } from "@/features/usage/limit";
import { PageHeader } from "@/components/page-header";
import { SiteFooter } from "@/components/site-footer";
import { TournamentRow } from "@/components/tournaments/tournament-row";
import { ShineBorder } from "@/components/ui/shine-border";
import { Label } from "@/components/ui/label";
import { FileInput } from "@/components/upload/file-input";
import { SubmitButton } from "@/components/upload/submit-button";

async function handleUpload(formData: FormData) {
  "use server";
  const { playerId } = await requireSession();

  // Лимит загрузок в час на игрока (защита баланса Anthropic: один файл = десятки
  // платных вызовов). Проверяем ДО чтения файла и любой работы парсера/очереди.
  if (!checkUploadQuota(playerId).ok) {
    redirect(`/analyze?error=RATE_LIMITED`);
  }

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
    redirect(`/analyze?error=${result.error}`);
  } else {
    redirect(`/tournament/${result.tournamentId}`);
  }
}

const UPLOAD_ERROR_TEXT: Record<string, string> = {
  UNSUPPORTED_FORMAT: "Загрузи MTT-турнир GGPoker",
  RATE_LIMITED: "Слишком много загрузок за час. Подожди немного и попробуй снова.",
  PAYWALL: "Первый турнир ты уже разобрал бесплатно. Оформи подписку, чтобы разбирать дальше.",
  LIMIT_REACHED: "Лимит этого периода исчерпан — он обновится с началом нового периода подписки.",
};

function UploadError({ error }: { error: string }) {
  return (
    <div className="relative border border-destructive p-4">
      <ShineBorder shineColor="#FF5C5C" borderWidth={1} duration={1} style={{ animationIterationCount: 1 }} />
      <p className="text-small text-destructive">{UPLOAD_ERROR_TEXT[error] ?? "Ошибка разбора файла"}</p>
      {error === "PAYWALL" && (
        <Link
          href="/pricing"
          className="mt-2 inline-block font-mono text-label uppercase tracking-label text-primary transition-colors hover:text-foreground"
        >
          Посмотреть тарифы →
        </Link>
      )}
    </div>
  );
}

// Инструмент «Разбор»: загрузка турнира + последние турниры. Вынесен с главной
// (теперь главная — лендинг для всех), доступен залогиненным через пункт «Разбор».
export default async function AnalyzePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { playerId } = await requireSession();
  const { error } = await searchParams;
  const recent = await recentTournaments(playerId, 5);

  return (
    <main>
      <PageHeader />

      <section className="mx-auto max-w-5xl px-8 py-16">
        <div className="mx-auto max-w-2xl space-y-8 text-center">
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

      <SiteFooter />
    </main>
  );
}
