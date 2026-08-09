import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CornerMarks } from "@/components/site/detail";

// Финальный призыв в виде посадочного талона — приём из референса
// perasperadastra.ru (design/refs/2026-08-08). Слева обещание и кнопки, справа
// отрывной корешок с полями.
//
// Штрихкод отсюда убран (решение Артёма 2026-08-09): полоски ничего не кодировали
// и не сканировались, то есть притворялись данными, будучи украшением. Талон
// узнаётся и без него — по пунктиру отрыва и полям «тариф / первый турнир / карта».

export function TicketCta({
  label,
  title,
  description,
  primary,
  secondary,
  fields,
}: {
  label: string;
  title: string;
  description: string;
  primary: { href: string; text: string };
  secondary: { href: string; text: string };
  fields: { label: string; value: string; accent?: boolean }[];
}) {
  return (
    <div className="relative grid border border-primary bg-card lg:grid-cols-[1fr_auto]">
      <CornerMarks />

      <div className="p-8 sm:p-12">
        <p className="font-mono text-label uppercase tracking-label text-primary">{label}</p>
        <h2 className="mt-4 max-w-[18ch] text-h1">{title}</h2>
        <p className="mt-4 max-w-[56ch] text-body text-muted-foreground">{description}</p>
        <div className="mt-8 flex flex-wrap gap-4">
          <Link href={primary.href} className={cn(buttonVariants(), "gap-2")}>
            {primary.text}
            <ArrowRight className="size-4" />
          </Link>
          <Link href={secondary.href} className={cn(buttonVariants({ variant: "outline" }))}>
            {secondary.text}
          </Link>
        </div>
      </div>

      {/* Корешок: пунктирная линия отрыва — сверху на мобильном, слева на широком */}
      <div className="flex flex-col justify-between gap-8 border-t border-dashed border-border p-8 sm:p-12 lg:min-w-[260px] lg:border-l lg:border-t-0">
        <div className="space-y-6">
          {fields.map((field) => (
            <div key={field.label}>
              <p className="font-mono text-label uppercase tracking-label text-muted-foreground">
                {field.label}
              </p>
              <p
                className={cn(
                  "mt-2 font-mono text-h3",
                  field.accent ? "text-primary" : "text-foreground"
                )}
              >
                {field.value}
              </p>
            </div>
          ))}
        </div>

      </div>
    </div>
  );
}
