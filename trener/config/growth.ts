// A/B-тест заголовка на главной. Оба варианта — правда о продукте, различается только
// акцент (design-system.md: витрина не выдумывает фактов). Правило 3: список вариантов —
// в конфиге, не в разметке страницы.
//
// Измеряется через Яндекс.Метрику (components/site/headline-impression.tsx — показ,
// components/site/headline-cta-link.tsx — клик по главной кнопке), без своей таблицы
// в базе — решение Артёма 2026-08-13, не городить схему БД ради одного теста.

export type HeadlineVariant = "A" | "B";

export const HEADLINE_VARIANTS: HeadlineVariant[] = ["A", "B"];

export const HEADLINE_VARIANT_COOKIE = "wg_hv";
export const HEADLINE_VARIANT_COOKIE_MAX_AGE_DAYS = 90;

export function isHeadlineVariant(value: string | undefined): value is HeadlineVariant {
  return value === "A" || value === "B";
}

// 50/50 — вариантов сейчас ровно два, доли можно поменять здесь при необходимости.
export function pickHeadlineVariant(): HeadlineVariant {
  return HEADLINE_VARIANTS[Math.floor(Math.random() * HEADLINE_VARIANTS.length)];
}
