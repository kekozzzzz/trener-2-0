"use client";

import { useEffect } from "react";
import { reachGoal } from "@/lib/metrika";
import type { HeadlineVariant } from "@/config/growth";

// Невидимый маячок показа варианта заголовка (config/growth.ts) — один раз на загрузку
// hero. Без настроенной Метрики reachGoal тихо ничего не делает (lib/metrika.ts).
export function HeadlineImpression({ variant }: { variant: HeadlineVariant }): null {
  useEffect(() => {
    reachGoal("headline_impression", { variant });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
