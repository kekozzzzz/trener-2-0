"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";

import { LoadingDots } from "@/components/ui/loading-dots";

// Пока в списке есть турниры в обработке (парсинг метрик), тихо обновляем серверную
// страницу — бейджи «в очереди»/«обрабатывается» сами превращаются в «готов», без F5.
// Обратная связь Артёма 2026-07-15: «закинул — жду и гадаю». router.refresh перезапрашивает
// серверный компонент, состояние этого клиентского опросника при этом сохраняется.
// Предохранитель MAX_POLLS — чтобы не опрашивать вечно, если что-то реально застряло.
const INTERVAL_MS = 6000;
const MAX_POLLS = 50; // ~5 минут — с запасом на парсинг большой пачки

export function TournamentsAutoRefresh({ active }: { active: boolean }) {
  const router = useRouter();
  const t = useTranslations("Tournaments");
  const polls = useRef(0);

  useEffect(() => {
    if (!active) return;
    polls.current = 0;
    const id = setInterval(() => {
      polls.current += 1;
      if (polls.current >= MAX_POLLS) {
        clearInterval(id);
        return;
      }
      router.refresh();
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, [active, router]);

  if (!active) return null;

  return (
    <p className="mt-4 flex items-center gap-2 font-mono text-label uppercase tracking-label text-muted-foreground">
      {t("processingHint")}
      <LoadingDots />
    </p>
  );
}
