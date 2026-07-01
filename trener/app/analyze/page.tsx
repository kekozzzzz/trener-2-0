import { noindex } from "@/lib/seo";
export const metadata = noindex;
import { redirect } from "next/navigation";
import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { uploadTournamentsBatch, type BatchItem } from "@/features/tournaments/actions";
import { recentTournaments } from "@/features/tournaments/queries";
import { requireSession } from "@/features/auth/session";
import { checkUploadQuota } from "@/features/usage/limit";
import { getUploadMaxFilesPerBatch } from "@/config/usage-limits";
import { PageHeader } from "@/components/page-header";
import { SiteFooter } from "@/components/site-footer";
import { TournamentRow } from "@/components/tournaments/tournament-row";
import { ShineBorder } from "@/components/ui/shine-border";
import { Label } from "@/components/ui/label";
import { FileInput } from "@/components/upload/file-input";
import { SubmitButton } from "@/components/upload/submit-button";
import { HandHistoryGuide } from "@/components/upload/hand-history-guide";
// Старая подсказка со скриншотами GGPoker (components/upload/upload-guide.tsx +
// картинки в /public/help) СОХРАНЕНА для будущего — сейчас показываем текстовую
// «Как выгрузить руки» по всем румам (раскрывашки). Вернуть скрины = снова её задействовать.

const MAX_FILE_BYTES = 5 * 1024 * 1024;

async function handleUpload(formData: FormData) {
  "use server";
  const { playerId } = await requireSession();

  // Лимит загрузок в час на игрока — защита от шторма. Считаем по «закиду» (один
  // клик = одна единица), а не по файлу: загрузка сама по себе дешёвая (парсинг),
  // платная стена стоит на РАЗБОРЕ (parse-tournament.ts). Проверяем ДО чтения файлов.
  if (!checkUploadQuota(playerId).ok) {
    redirect(`/analyze?error=RATE_LIMITED`);
  }

  const picked = formData
    .getAll("file")
    .filter((f): f is File => f instanceof File && f.size > 0);
  if (picked.length === 0) return;

  // Потолок файлов в пачке: берём первые N, остальное отсекаем (помечаем capped).
  const maxBatch = getUploadMaxFilesPerBatch();
  const capped = picked.length > maxBatch;
  const chosen = picked.slice(0, maxBatch);

  // Слишком большие файлы (>5 МБ) не читаем — считаем их «ошибкой» в сводке.
  const items: BatchItem[] = [];
  let oversize = 0;
  for (const file of chosen) {
    if (file.size > MAX_FILE_BYTES) {
      oversize++;
      continue;
    }
    items.push({ fileBuffer: Buffer.from(await file.arrayBuffer()), originalFilename: file.name });
  }

  const summary = await uploadTournamentsBatch(items, playerId);
  const failed = summary.failed + oversize;

  // Одиночная загрузка — поведение как раньше: сразу на страницу турнира (или дубль/ошибка).
  if (picked.length === 1) {
    const r = summary.singleResult;
    if (r?.ok) redirect(`/tournament/${r.tournamentId}`);
    if (r && !r.ok && r.error === "DUPLICATE") redirect(`/tournament/${r.existingTournamentId}?duplicate=1`);
    if (oversize === 1) redirect(`/analyze?error=TOO_LARGE`);
    redirect(`/analyze?error=${r && !r.ok ? r.error : "PARSE_FAILED"}`);
  }

  // Пачка (2+ файла) — на «Мои турниры» со сводкой по итогу обработки.
  const params = new URLSearchParams({
    uploaded: String(summary.uploaded),
    dup: String(summary.duplicates),
    failed: String(failed),
  });
  if (capped) params.set("capped", String(maxBatch));
  redirect(`/tournaments?${params.toString()}`);
}

// Код ошибки из query → ключ в словаре Analyze. Неизвестный код → общий текст ошибки.
const UPLOAD_ERROR_KEY: Record<string, string> = {
  UNSUPPORTED_FORMAT: "errorUnsupportedFormat",
  TOO_LARGE: "errorTooLarge",
  RATE_LIMITED: "errorRateLimited",
  PAYWALL: "errorPaywall",
  LIMIT_REACHED: "errorLimitReached",
};

async function UploadError({ error }: { error: string }) {
  const t = await getTranslations("Analyze");
  const key = UPLOAD_ERROR_KEY[error];
  return (
    <div className="relative border border-destructive p-4">
      <ShineBorder shineColor="#FF5C5C" borderWidth={1} duration={1} style={{ animationIterationCount: 1 }} />
      <p className="text-small text-destructive">{key ? t(key) : t("errorGeneric")}</p>
      {error === "PAYWALL" && (
        <Link
          href="/pricing"
          className="mt-2 inline-block font-mono text-label uppercase tracking-label text-primary transition-colors hover:text-foreground"
        >
          {t("viewPlans")}
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
  const t = await getTranslations("Analyze");
  const { playerId } = await requireSession();
  const { error } = await searchParams;
  const recent = await recentTournaments(playerId, 5);

  return (
    <main>
      <PageHeader />

      <section className="mx-auto max-w-5xl px-8 py-16">
        <div className="mx-auto max-w-2xl space-y-8 text-center">
          <div className="space-y-2">
            <h1 className="text-h1">{t("title")}</h1>
            <p className="text-small text-muted-foreground">
              {t("subtitle")}
            </p>
          </div>

          {error && <UploadError error={error} />}

          <form action={handleUpload} encType="multipart/form-data" className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="file" className="font-mono text-label uppercase tracking-label text-muted-foreground">
                {t("fileLabel")}
              </Label>
              <FileInput id="file" name="file" accept=".txt,.xml" required multiple />
            </div>
            <SubmitButton />
          </form>

          <HandHistoryGuide />
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto max-w-5xl px-8 py-16">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <h2 className="text-h2">{t("recentTitle")}</h2>
            {recent.length > 0 && (
              <Link
                href="/tournaments"
                className="font-mono text-label uppercase tracking-label text-muted-foreground transition-colors hover:text-foreground"
              >
                {t("allTournaments")}
              </Link>
            )}
          </div>

          {recent.length === 0 ? (
            <p className="mt-8 text-body text-muted-foreground">
              {t("recentEmpty")}
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
