"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { LoadingDots } from "@/components/ui/loading-dots";
import { unlockTournamentAnalysisAction } from "./actions";

// Автозапуск разбора при открытии запертого турнира. Именно клиентский эффект,
// а не вызов в серверном рендере: Next.js префетчит страницы заранее (наведение
// на ссылку в списке турниров), и платный разбор стартовал бы без реального
// открытия. Эффект срабатывает только у живого посетителя страницы.
// Все проверки (бюджет, часовой лимит, идемпотентность) остаются в экшене.
export function AutoUnlockClient({ tournamentId }: { tournamentId: string }) {
  const t = useTranslations("Tournament");
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // StrictMode в dev монтирует эффект дважды
    started.current = true;
    const formData = new FormData();
    formData.set("tournamentId", tournamentId);
    void unlockTournamentAnalysisAction(formData);
  }, [tournamentId]);

  return (
    <p className="mt-4 flex items-center gap-2 text-body text-foreground">
      {t("reviewStarting")}
      <LoadingDots />
    </p>
  );
}
