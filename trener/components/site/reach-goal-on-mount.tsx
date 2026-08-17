"use client";

import { useEffect } from "react";
import { reachGoal } from "@/lib/metrika";

// Цель Метрики в момент показа страницы (не клика) — обёртка над reachGoal (lib/metrika.ts)
// для серверных компонентов воронки (funnel.md): загрузил турнир, увидел вердикт.
// Без настроенного счётчика reachGoal — тихий no-op, как и везде в проекте.
export function ReachGoalOnMount({
  target,
  params,
}: {
  target: string;
  params?: Record<string, unknown>;
}) {
  useEffect(() => {
    reachGoal(target, params);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return null;
}
