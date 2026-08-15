import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { PageHeader } from "@/components/page-header";
import { PageIntro, BigWordmark } from "@/components/site/detail";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { indexablePage } from "@/lib/seo";
import { SUPPORTED_ROOMS } from "@/config/rooms";
import { RoomSteps } from "@/components/upload/hand-history-guide";

type Params = { room: string };

// Один динамический роут на все 8 румов, а не 8 файлов — источник правды тот же
// config/rooms.ts, что кормит общий гайд и ленту на главной (см. комментарий там).
// SEO-причина отдельных страниц (не только раскрывашки на /how-to-export): кто ищет
// «как выгрузить историю раздач PokerStars», должен попасть на страницу с ТОЧНЫМ
// заголовком под его рум, а не делить один тайтл с семью другими румами.
export function generateStaticParams(): Params[] {
  return SUPPORTED_ROOMS.map((room) => ({ room: room.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { room: roomId } = await params;
  const room = SUPPORTED_ROOMS.find((r) => r.id === roomId);
  if (!room) return {};

  const t = await getTranslations("UploadGuide");
  return {
    ...indexablePage(`/how-to-export/${room.id}`),
    title: t(`exportTitle.${room.id}`),
    description: t(`exportDescription.${room.id}`),
  };
}

export default async function ExportRoomPage({ params }: { params: Promise<Params> }) {
  const { room: roomId } = await params;
  const room = SUPPORTED_ROOMS.find((r) => r.id === roomId);
  if (!room) notFound();

  const t = await getTranslations("UploadGuide");
  const tExport = await getTranslations("HowToExport");

  return (
    <main>
      <PageHeader />

      <section className="mx-auto site-wrap px-8 py-16 sm:py-24">
        <PageIntro
          tag={t("exportSectionTag")}
          title={t(`exportTitle.${room.id}`)}
          subtitle={t(`exportIntro.${room.id}`)}
          className="max-w-2xl"
        />

        <div className="mt-12 border border-border bg-card text-left">
          <RoomSteps room={room} />
        </div>

        <p className="mt-8 max-w-2xl text-small text-muted-foreground">
          {tExport("otherRoomsLinkText")}{" "}
          <Link href="/how-to-export" className="text-primary underline underline-offset-4">
            {tExport("otherRoomsLinkCta")}
          </Link>
        </p>

        <div className="mt-8 flex flex-col items-start gap-4 border border-border bg-card p-8 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-body text-muted-foreground">{tExport("ctaNote")}</p>
          <Link href="/analyze" className={cn(buttonVariants(), "shrink-0")}>
            {tExport("ctaButton")}
          </Link>
        </div>
        {/* Подвальный вордмарк — общий приём публичных страниц (§4.1 п. 11) */}
        <BigWordmark />
      </section>
    </main>
  );
}
