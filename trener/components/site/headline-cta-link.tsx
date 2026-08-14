"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { reachGoal } from "@/lib/metrika";
import type { HeadlineVariant } from "@/config/growth";

type Props = ComponentProps<typeof Link> & { variant: HeadlineVariant };

// Обёртка над главной кнопкой hero: та же ссылка, что и раньше, плюс цель Метрики для
// A/B-теста заголовка (config/growth.ts) — без настроенной Метрики просто ничего не шлёт.
export function HeadlineCtaLink({ variant, onClick, ...props }: Props) {
  return (
    <Link
      {...props}
      onClick={(e) => {
        reachGoal("headline_cta_click", { variant });
        onClick?.(e);
      }}
    />
  );
}
