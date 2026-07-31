"use client";

import { useEffect } from "react";

// Невидимый маячок общего счётчика заходов (app/api/track-visit): монтируется
// в корневом layout (app/layout.tsx), который НЕ перемонтируется при переходах
// между страницами внутри приложения — эффект срабатывает один раз на живую
// загрузку сайта, а не на каждый клик по ссылке.
export function SiteVisitTracker(): null {
  useEffect(() => {
    fetch("/api/track-visit", { method: "POST", keepalive: true }).catch(() => {});
  }, []);
  return null;
}
