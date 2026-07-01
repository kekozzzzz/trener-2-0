"use client";

import { useLocale } from "next-intl";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Globe } from "lucide-react";
import { setUserLocale } from "@/i18n/actions";
import { type Locale } from "@/i18n/config";
import { cn } from "@/lib/utils";

// Переключатель языка: один значок-глобус + код текущего языка. Клик переключает
// на другой язык (языка два), пишет куку через серверный экшен и перерисовывает
// страницу. При первом заходе язык определяется по браузеру — этот значок для ручной смены.
export function LangSwitcher() {
  const active = useLocale() as Locale;
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const next: Locale = active === "ru" ? "en" : "ru";

  function toggle() {
    if (pending) return;
    startTransition(async () => {
      await setUserLocale(next);
      router.refresh();
    });
  }

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={pending}
      aria-label={next === "en" ? "Switch to English" : "Переключить на русский"}
      title={next === "en" ? "English" : "Русский"}
      className={cn(
        "flex items-center gap-2 font-mono text-label uppercase tracking-label",
        "text-muted-foreground transition-colors hover:text-primary disabled:opacity-60",
      )}
    >
      <Globe className="size-4" strokeWidth={1.5} aria-hidden />
      <span>{active}</span>
    </button>
  );
}
