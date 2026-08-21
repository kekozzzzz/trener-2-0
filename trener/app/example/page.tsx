import Link from "next/link";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { indexablePage, getMetaLocale } from "@/lib/seo";
import { getCurrentPlayer } from "@/features/auth/queries";
import { parseHandHistory } from "@/parser";
import { tableStateUpTo } from "@/parser/table-state";
import { detectHeroLuckyWin } from "@/parser/lucky-win";
import { bigBlindFromSnapshot } from "@/parser/big-blind";
import { EXAMPLE_HAND_RAW, EXAMPLE_HAND_DECISION_INDEX } from "@/config/example-hand";
import { PageHeader } from "@/components/page-header";
import { HandTable } from "@/components/poker/hand-table";
import { ScaleToFit } from "@/components/scale-to-fit";
import {
  BigWordmark,
  FigureCaption,
  PageIntro,
  SectionHead,
  Tile,
  TileRow,
} from "@/components/site/detail";
import { TicketCta } from "@/components/site/ticket-cta";

// Публичная страница-пример: настоящая раздача (Test/GG20260611-1320 …, №59), а не макет.
// Числа страница считает САМА, парсером, прямо здесь — plans/2026-08-17-публичный-пример-разбора.md.
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations({ locale: await getMetaLocale(), namespace: "Meta" });
  return {
    ...indexablePage("/example"),
    title: t("exampleTitle"),
    description: t("exampleDescription"),
  };
}

export default async function ExamplePage() {
  const t = await getTranslations("ExamplePage");
  const tLanding = await getTranslations("Landing");
  const player = await getCurrentPlayer();
  const ctaHref = player ? "/analyze" : "/enter";

  // Правило 1: числа не переписаны руками — парсер считает их из настоящего HH-текста
  // при каждом рендере, точно так же, как в разборе платящего игрока.
  const parsed = parseHandHistory(Buffer.from(EXAMPLE_HAND_RAW));
  if (!parsed.ok) throw new Error("example-hand: parse failed");
  const hand = parsed.data.hands[0];
  const snapshot = hand.tableSnapshot;
  const table = tableStateUpTo(snapshot, EXAMPLE_HAND_DECISION_INDEX);
  const lucky = detectHeroLuckyWin(snapshot);
  const bb = bigBlindFromSnapshot(snapshot);
  const resultBb = bb ? (hand.chipResult / bb).toFixed(1) : null;

  return (
    <main>
      <PageHeader />

      <section className="mx-auto site-wrap px-8 py-16 sm:py-24">
        <PageIntro tag={t("sectionTag")} title={t("title")} subtitle={t("subtitle")} className="max-w-2xl" />
        <p className="mt-6 max-w-2xl text-small text-muted-foreground">
          {t("trustNote")}{" "}
          <Link href="/#basis" className="text-primary underline underline-offset-4">
            {t("trustLinkText")}
          </Link>
        </p>

        {/* Стол, вопрос, ответ, вердикт — ровно тот же вид и те же классы, что в
            настоящем разборе (app/tournament/[id]/hands/[handId]/page.tsx): без
            рамки-«окна» и без цветных чат-пузырей — тех приёмов на реальной
            странице разбора нет, это стиль иллюстрации на главной, а не продукта. */}
        <div className="mt-16 border-t border-border pt-16">
          <SectionHead tag={t("dialogTag")} title={t("dialogTitle")} />

          <ScaleToFit baseWidth={960}>
            <HandTable state={table} nick={null} fit />
          </ScaleToFit>
          <FigureCaption>{t("tableCaption")}</FigureCaption>

          <div className="mt-8 space-y-2">
            <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
              {t("questionLabel")}
            </p>
            <p className="text-body text-foreground">{t("question")}</p>
            <div className="border border-border bg-card p-4">
              <p className="text-body text-muted-foreground">{t("answer")}</p>
            </div>
          </div>

          <div className="mt-8 space-y-4">
            <h2 className="text-h2">{t("verdictLabel")}</h2>
            <div className="border border-primary bg-card p-6">
              <p className="text-body text-foreground">{t("verdict")}</p>
            </div>
          </div>
        </div>

        {lucky && bb && (
          <div className="mt-16 border-t border-border pt-16">
            <SectionHead tag={t("statsTag")} title={t("statsTitle")} />
            <TileRow>
              <Tile label={t("statEquityLabel")} title={`${lucky.equityPct}%`} accent>
                <p className="mt-2 text-small text-muted-foreground">{t("statEquityNote")}</p>
              </Tile>
              <Tile label={t("statResultLabel")} title={`+${hand.chipResult.toLocaleString("ru-RU")}`}>
                <p className="mt-2 text-small text-muted-foreground">{resultBb} bb</p>
              </Tile>
            </TileRow>
          </div>
        )}

        {/* Исходный HH-файл целиком, свёрнут по умолчанию (тот же приём <details>,
            что в аккордеоне возражений на главной — доступно без JS и с клавиатуры).
            Раздача Артёма, ссылка на владельца заменена на «Hero» ещё в самом файле
            GG-экспорта, соперники — уже под хэш-ID рума, вручную обезличивать нечего. */}
        <details className="group mt-16 border-t border-border pt-16">
          <summary className="cursor-pointer list-none font-mono text-label uppercase tracking-label text-primary [&::-webkit-details-marker]:hidden">
            {t("rawFileToggle")}
          </summary>
          <div className="mt-6 overflow-x-auto border border-border bg-card p-4">
            <pre className="whitespace-pre font-mono text-[0.6875rem] leading-relaxed text-muted-foreground">
              {EXAMPLE_HAND_RAW}
            </pre>
          </div>
        </details>

        <div className="mt-16 border-t border-border pt-16">
          <TicketCta
            label={tLanding("ticketLabel")}
            title={tLanding("finalTitle")}
            description={tLanding("finalSubtitle")}
            primary={{ href: ctaHref, text: tLanding("ctaUpload") }}
            secondary={{ href: "/pricing", text: tLanding("allPlans") }}
            fields={[
              { label: tLanding("ticketFirstLabel"), value: tLanding("ticketFirstValue"), accent: true },
              { label: tLanding("ticketCardLabel"), value: tLanding("ticketCardValue") },
            ]}
          />
        </div>

        <BigWordmark />
      </section>
    </main>
  );
}
